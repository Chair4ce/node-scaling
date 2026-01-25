/**
 * Orchestrating Dispatcher
 * Coordinates specialized nodes for complex multi-step tasks
 * Max 5 nodes with smart reuse across phases
 */

const { WorkerNode } = require('./worker-node');
const config = require('../config');

class Dispatcher {
  constructor() {
    this.nodes = new Map();
    this.taskQueue = [];
    this.results = new Map();
    this.nextTaskId = 1;
    this.maxNodes = config.scaling.maxNodes; // 5 max
    this.logs = [];
  }

  log(message) {
    const entry = { time: Date.now(), message };
    this.logs.push(entry);
    console.log(`  [Dispatcher] ${message}`);
  }

  // Get or create a node of specific type (with smart recycling)
  getOrCreateNode(nodeType) {
    // First, try to find an idle node of the same type
    for (const node of this.nodes.values()) {
      if (node.status === 'idle' && node.nodeType === nodeType) {
        return node;
      }
    }
    
    // Second, if under limit, create a new node
    if (this.nodes.size < this.maxNodes) {
      const id = `${nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const node = new WorkerNode(id, nodeType);
      this.nodes.set(id, node);
      this.log(`Spawned ${nodeType} node: ${id}`);
      return node;
    }
    
    // Third, recycle an idle node of different type
    for (const [id, node] of this.nodes.entries()) {
      if (node.status === 'idle') {
        this.log(`Recycling ${node.nodeType} node → ${nodeType}`);
        this.nodes.delete(id);
        const newId = `${nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const newNode = new WorkerNode(newId, nodeType);
        this.nodes.set(newId, newNode);
        return newNode;
      }
    }
    
    // No available nodes - this shouldn't happen in orchestrated flow
    throw new Error(`No available nodes (all ${this.maxNodes} busy)`);
  }

  // Wait for a node to become available
  async waitForNode(nodeType, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        return this.getOrCreateNode(nodeType);
      } catch (e) {
        // All busy, wait a bit
        await new Promise(r => setTimeout(r, 100));
      }
    }
    throw new Error(`Timeout waiting for ${nodeType} node`);
  }

  // Execute a single task
  async executeTask(task) {
    const node = await this.waitForNode(task.nodeType || 'analyze');
    task.id = task.id || this.nextTaskId++;
    
    const result = await node.execute(task);
    this.results.set(task.id, result);
    return result;
  }

  // Execute multiple tasks in parallel (respecting max nodes)
  async executeParallel(tasks) {
    const startTime = Date.now();
    this.log(`Executing ${tasks.length} tasks in parallel (max ${this.maxNodes} concurrent)`);
    
    // Group tasks by node type
    const tasksByType = {};
    tasks.forEach((task, idx) => {
      const type = task.nodeType || 'analyze';
      if (!tasksByType[type]) tasksByType[type] = [];
      tasksByType[type].push({ ...task, originalIndex: idx });
    });
    
    // Pre-allocate nodes for each type (up to maxNodes total)
    const typeCount = Object.keys(tasksByType).length;
    const nodesPerType = Math.floor(this.maxNodes / typeCount);
    
    // Execute all tasks with controlled concurrency
    const results = new Array(tasks.length);
    const executing = new Set();
    const pending = [...tasks.map((t, i) => ({ ...t, originalIndex: i, id: this.nextTaskId++ }))];
    
    const executeNext = async () => {
      while (pending.length > 0 || executing.size > 0) {
        // Start new tasks up to max concurrency
        while (pending.length > 0 && executing.size < this.maxNodes) {
          const task = pending.shift();
          const node = await this.waitForNode(task.nodeType || 'analyze');
          
          const promise = (async () => {
            const result = await node.execute(task);
            results[task.originalIndex] = result;
            executing.delete(promise);
          })();
          
          executing.add(promise);
        }
        
        // Wait for at least one to complete
        if (executing.size > 0) {
          await Promise.race([...executing]);
        }
      }
    };
    
    await executeNext();
    
    const duration = Date.now() - startTime;
    const successful = results.filter(r => r?.success).length;
    this.log(`Parallel execution complete: ${successful}/${results.length} succeeded in ${duration}ms`);
    
    return {
      success: results.every(r => r?.success),
      results,
      totalDurationMs: duration,
      parallelEfficiency: results.length > 0 
        ? (results.reduce((sum, r) => sum + (r?.durationMs || 0), 0) / duration).toFixed(2)
        : 0,
    };
  }

  // Orchestrate a complex multi-phase task
  async orchestrate(phases) {
    const startTime = Date.now();
    const phaseResults = [];
    
    this.log(`Starting orchestration with ${phases.length} phases`);
    
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      this.log(`Phase ${i + 1}: ${phase.name}`);
      
      // Build tasks, potentially using previous phase results
      let tasks = phase.tasks;
      if (typeof tasks === 'function') {
        tasks = tasks(phaseResults);
      }
      
      if (!tasks || tasks.length === 0) {
        this.log(`Phase ${i + 1}: No tasks to execute`);
        phaseResults.push({ phase: phase.name, success: true, results: [], totalDurationMs: 0 });
        continue;
      }
      
      // Execute phase tasks in parallel
      const phaseResult = await this.executeParallel(tasks);
      phaseResults.push({
        phase: phase.name,
        ...phaseResult,
      });
      
      if (!phaseResult.success && phase.required !== false) {
        this.log(`Phase ${i + 1} had failures, continuing...`);
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    return {
      success: phaseResults.every(p => p.success || p.results?.some(r => r?.success)),
      phases: phaseResults,
      totalDurationMs: totalDuration,
      nodeStats: this.getNodeStats(),
    };
  }

  // Get stats for all nodes
  getNodeStats() {
    const stats = [];
    for (const node of this.nodes.values()) {
      stats.push(node.getStats());
    }
    return stats;
  }

  // Get overall status
  getStatus() {
    const nodes = [...this.nodes.values()];
    return {
      totalNodes: nodes.length,
      maxNodes: this.maxNodes,
      byType: this.getNodesByType(),
      idle: nodes.filter(n => n.status === 'idle').length,
      busy: nodes.filter(n => n.status === 'busy').length,
    };
  }

  getNodesByType() {
    const byType = {};
    for (const node of this.nodes.values()) {
      byType[node.nodeType] = (byType[node.nodeType] || 0) + 1;
    }
    return byType;
  }

  // Clean up
  shutdown() {
    this.log(`Shutting down ${this.nodes.size} nodes`);
    this.nodes.clear();
  }
}

module.exports = { Dispatcher };
