/**
 * Swarm Client
 * Lightweight client to communicate with Swarm Daemon
 * 
 * Designed for minimal overhead - instant time to first token
 */

const http = require('http');

const DEFAULT_PORT = 9999;
const DEFAULT_HOST = 'localhost';
const BRAINDB_URL = 'http://localhost:3333';
const BRAINDB_RECALL_LIMIT = 7;

class SwarmClient {
  constructor(options = {}) {
    this.host = options.host || DEFAULT_HOST;
    this.port = options.port || DEFAULT_PORT;
    this.timeout = options.timeout || 60000;
  }

  /**
   * Check if daemon is running
   */
  async isReady() {
    try {
      const health = await this.health();
      return health.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Health check
   */
  async health() {
    return this._get('/health');
  }

  /**
   * Detailed status
   */
  async status() {
    return this._get('/status');
  }

  /**
   * Recall memories from BrainDB relevant to the given prompts
   * Acts as a "memory multiplexer" — one recall, fanned out to N workers
   * @param {string[]} prompts - Prompts to derive context from
   * @param {object} options - { limit, braindbUrl }
   * @returns {string} - Formatted context block to prepend to prompts
   */
  async recallContext(prompts, options = {}) {
    const url = options.braindbUrl || BRAINDB_URL;
    const limit = options.limit || BRAINDB_RECALL_LIMIT;
    
    // Derive a search query from all prompts (take key terms)
    const combinedQuery = prompts.join(' ').substring(0, 500);
    
    try {
      const body = JSON.stringify({ query: combinedQuery, limit });
      const result = await new Promise((resolve, reject) => {
        const req = http.request(`${url}/memory/recall`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid BrainDB response')); }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('BrainDB timeout')); });
        req.write(body);
        req.end();
      });

      if (!result.ok || !result.results || result.results.length === 0) {
        return null;
      }

      // Format memories as a context block
      const memories = result.results.map((m, i) => 
        `${i + 1}. [${m.type}] ${m.trigger}: ${m.content}`
      ).join('\n');

      return `<context source="braindb" count="${result.results.length}">\nRelevant memories from knowledge graph:\n${memories}\n</context>`;
    } catch (err) {
      // BrainDB unavailable — degrade gracefully, workers still function without context
      return null;
    }
  }

  /**
   * Prepend context block to each prompt
   * @param {string[]} prompts 
   * @param {string|null} context 
   * @returns {string[]}
   */
  _injectContext(prompts, context) {
    if (!context) return prompts;
    return prompts.map(p => `${context}\n\n${p}`);
  }

  /**
   * Execute prompts in parallel
   * @param {string[]} prompts - Array of prompts
   * @param {object} options - Options ({ context: true } to enable BrainDB recall)
   * @returns {AsyncGenerator} - Yields events as they come in
   */
  async *parallel(prompts, options = {}) {
    let finalPrompts = prompts;
    if (options.context) {
      const ctx = await this.recallContext(prompts, options);
      finalPrompts = this._injectContext(prompts, ctx);
      if (ctx) {
        yield { event: 'context', message: 'BrainDB context loaded', memoryCount: (ctx.match(/\n/g) || []).length - 2 };
      }
    }
    yield* this._stream('/parallel', { prompts: finalPrompts, options });
  }

  /**
   * Research multiple subjects
   * @param {string[]} subjects - Subjects to research
   * @param {string} topic - Research topic/angle
   * @param {object} options - Options ({ context: true } to enable BrainDB recall)
   * @returns {AsyncGenerator} - Yields events as they come in
   */
  async *research(subjects, topic, options = {}) {
    if (options.context) {
      const queryPrompts = subjects.map(s => `${s} ${topic}`);
      const ctx = await this.recallContext(queryPrompts, options);
      if (ctx) {
        // Inject context into the topic so all research phases get it
        topic = `${ctx}\n\n${topic}`;
        yield { event: 'context', message: 'BrainDB context loaded' };
      }
    }
    yield* this._stream('/research', { subjects, topic, options });
  }

  /**
   * Execute parallel and wait for all results
   */
  async parallelSync(prompts, options = {}) {
    const events = [];
    for await (const event of this.parallel(prompts, options)) {
      events.push(event);
      if (event.event === 'complete' || event.event === 'error') {
        return event;
      }
    }
    return events[events.length - 1];
  }

  /**
   * Research and wait for all results
   */
  async researchSync(subjects, topic, options = {}) {
    for await (const event of this.research(subjects, topic, options)) {
      if (event.event === 'complete' || event.event === 'error') {
        return event;
      }
    }
  }

  /**
   * GET request helper
   */
  _get(path) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path,
        method: 'GET',
        timeout: this.timeout,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });
  }

  /**
   * Streaming POST request - yields NDJSON events
   */
  async *_stream(path, body) {
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: this.timeout,
      }, resolve);
      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    });

    // Read NDJSON stream
    let buffer = '';
    for await (const chunk of response) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
    
    // Handle remaining buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer);
      } catch {}
    }
  }
}

/**
 * Quick helper - parallel execution with streaming
 */
async function parallel(prompts, options = {}) {
  const client = new SwarmClient(options);
  return client.parallelSync(prompts, options);
}

/**
 * Quick helper - research with streaming
 */
async function research(subjects, topic, options = {}) {
  const client = new SwarmClient(options);
  return client.researchSync(subjects, topic, options);
}

/**
 * Quick helper - recall context from BrainDB
 */
async function recallContext(prompts, options = {}) {
  const client = new SwarmClient(options);
  return client.recallContext(prompts, options);
}

/**
 * Check if daemon is running
 */
async function isDaemonRunning(options = {}) {
  const client = new SwarmClient(options);
  return client.isReady();
}

module.exports = {
  SwarmClient,
  parallel,
  research,
  recallContext,
  isDaemonRunning,
};
