/**
 * Specialized Worker Node
 * Each node type has specific tools and capabilities
 * 
 * Security: All outputs are sanitized and injection attempts are detected
 */

const { GeminiClient } = require('./gemini-client');
const { 
  webSearch, 
  webFetch, 
  createAnalyzeTool, 
  createExtractTool, 
  createSynthesizeTool 
} = require('./tools');
const config = require('../config');
const { detectInjection, sanitizeOutput } = require('./security');

class WorkerNode {
  constructor(id, nodeType = 'analyze') {
    this.id = id;
    this.nodeType = nodeType;
    this.llm = new GeminiClient();
    this.status = 'idle';
    this.currentTask = null;
    this.completedTasks = 0;
    this.totalDuration = 0;
    
    // Get node configuration
    this.config = config.nodeTypes[nodeType] || config.nodeTypes.analyze;
    
    // Initialize tools based on node type
    this.tools = this.initializeTools();
  }

  initializeTools() {
    const tools = {};
    
    // Add tools based on node type
    switch (this.nodeType) {
      case 'search':
        tools.web_search = webSearch;
        break;
      case 'fetch':
        tools.web_fetch = webFetch;
        break;
      case 'analyze':
        tools.analyze = createAnalyzeTool(this.llm);
        break;
      case 'extract':
        tools.extract = createExtractTool(this.llm);
        break;
      case 'synthesize':
        tools.synthesize = createSynthesizeTool(this.llm);
        break;
    }
    
    return tools;
  }

  async execute(task) {
    this.status = 'busy';
    this.currentTask = task;
    const startTime = Date.now();

    try {
      // Security: Scan input for injection attempts
      const inputText = typeof task.input === 'string' ? task.input : JSON.stringify(task.input || '');
      const injectionCheck = detectInjection(inputText);
      
      if (!injectionCheck.safe) {
        console.warn(`[Security] Potential injection detected in task ${task.id}:`, injectionCheck.threats.map(t => t.type).join(', '));
        // Continue processing but log the threat - the security policy in the prompt will handle it
      }
      
      let result;
      
      // Execute based on task type and available tools
      if (task.tool && this.tools[task.tool]) {
        // Direct tool execution
        result = await this.executeTool(task.tool, task.input, task.options);
      } else {
        // LLM-based execution with context
        result = await this.executeLLM(task);
      }
      
      // Security: Sanitize output to remove any accidentally exposed credentials
      if (result && result.response) {
        result.response = sanitizeOutput(result.response);
      }
      
      const duration = Date.now() - startTime;
      this.completedTasks++;
      this.totalDuration += duration;
      this.status = 'idle';
      this.currentTask = null;

      return {
        nodeId: this.id,
        nodeType: this.nodeType,
        taskId: task.id,
        success: true,
        result,
        durationMs: duration,
        securityWarnings: injectionCheck.safe ? undefined : injectionCheck.threats.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.status = 'idle';
      this.currentTask = null;
      
      return {
        nodeId: this.id,
        nodeType: this.nodeType,
        taskId: task.id,
        success: false,
        error: sanitizeOutput(error.message), // Sanitize errors too
        durationMs: duration,
      };
    }
  }

  async executeTool(toolName, input, options = {}) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool '${toolName}' not available on ${this.nodeType} node`);
    }
    return await tool(input, options);
  }

  async executeLLM(task) {
    const prompt = `${this.config.systemPrompt}

Task: ${task.instruction}

${task.context ? `Context:\n${task.context}` : ''}
${task.input ? `Input:\n${typeof task.input === 'string' ? task.input : JSON.stringify(task.input, null, 2)}` : ''}

Provide a focused, high-quality response.`;

    const result = await this.llm.complete(prompt);
    return { response: result };
  }

  getStats() {
    return {
      id: this.id,
      type: this.nodeType,
      status: this.status,
      completedTasks: this.completedTasks,
      avgDurationMs: this.completedTasks > 0 
        ? Math.round(this.totalDuration / this.completedTasks) 
        : 0,
    };
  }
}

module.exports = { WorkerNode };
