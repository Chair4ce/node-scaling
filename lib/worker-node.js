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

const DEFAULT_TASK_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 1;
const RETRY_BACKOFF_MS = 1000;

class WorkerNode {
  constructor(id, nodeType = 'analyze') {
    this.id = id;
    this.nodeType = nodeType;
    this.llm = new GeminiClient();
    this.status = 'idle';
    this.currentTask = null;
    this.completedTasks = 0;
    this.totalDuration = 0;
    this.retriedTasks = 0;
    
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
    const maxRetries = task.retries ?? config.scaling?.retries ?? DEFAULT_RETRIES;
    const timeoutMs = task.timeoutMs ?? config.scaling?.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.retriedTasks++;
        const backoff = RETRY_BACKOFF_MS * attempt;
        await new Promise(r => setTimeout(r, backoff));
      }

      const result = await this._executeOnce(task, timeoutMs);
      
      if (result.success) {
        if (attempt > 0) result.retries = attempt;
        return result;
      }

      lastError = result;
      
      // Don't retry on non-transient errors
      if (result.error && /invalid|malformed|unauthorized|forbidden|not found/i.test(result.error)) {
        return result;
      }
    }

    // All retries exhausted
    if (lastError) lastError.retriesExhausted = true;
    return lastError;
  }

  async _executeOnce(task, timeoutMs) {
    this.status = 'busy';
    this.currentTask = task;
    const startTime = Date.now();

    try {
      // Security: Scan input for injection attempts
      const inputText = typeof task.input === 'string' ? task.input : JSON.stringify(task.input || '');
      const injectionCheck = detectInjection(inputText);
      
      if (!injectionCheck.safe) {
        console.warn(`[Security] Potential injection detected in task ${task.id}:`, injectionCheck.threats.map(t => t.type).join(', '));
      }
      
      let result;
      
      // Wrap execution with timeout
      const execPromise = (async () => {
        if (task.tool && this.tools[task.tool]) {
          return await this.executeTool(task.tool, task.input, task.options);
        } else {
          return await this.executeLLM(task);
        }
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      result = await Promise.race([execPromise, timeoutPromise]);
      
      // Security: Sanitize output
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
        error: sanitizeOutput(error.message),
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
    // Chain stages can override system prompt with a perspective
    const sysPrompt = task._systemPrompt || this.config.systemPrompt;
    
    const prompt = `${sysPrompt}

Task: ${task.instruction}

${task.context ? `Context:\n${task.context}` : ''}
${task.input ? `Input:\n${typeof task.input === 'string' ? task.input : JSON.stringify(task.input, null, 2)}` : ''}

Provide a focused, high-quality response. Be concise — prioritize insight density over length.`;

    const llmOptions = {};
    if (task.maxOutputTokens) llmOptions.maxTokens = task.maxOutputTokens;
    // Enable Google Search grounding for research/analysis tasks
    if (task.webSearch || task.grounding) {
      llmOptions.webSearch = true;
    }
    const result = await this.llm.complete(prompt, llmOptions);
    return { response: result };
  }

  getStats() {
    const providerInfo = this.llm.getStats();
    return {
      id: this.id,
      type: this.nodeType,
      status: this.status,
      completedTasks: this.completedTasks,
      retriedTasks: this.retriedTasks,
      avgDurationMs: this.completedTasks > 0 
        ? Math.round(this.totalDuration / this.completedTasks) 
        : 0,
      tokens: providerInfo.tokens,
      cost: providerInfo.cost,
    };
  }
}

module.exports = { WorkerNode };
