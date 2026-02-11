/**
 * Swarm Client
 * Lightweight client to communicate with Swarm Daemon
 * 
 * Designed for minimal overhead - instant time to first token
 */

const http = require('http');

const DEFAULT_PORT = 9999;
const DEFAULT_HOST = 'localhost';

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
   * Execute prompts in parallel
   * @param {string[]} prompts - Array of prompts
   * @param {object} options - Options
   * @returns {AsyncGenerator} - Yields events as they come in
   */
  async *parallel(prompts, options = {}) {
    yield* this._stream('/parallel', { prompts, options });
  }

  /**
   * Research multiple subjects
   * @param {string[]} subjects - Subjects to research
   * @param {string} topic - Research topic/angle
   * @param {object} options - Options
   * @returns {AsyncGenerator} - Yields events as they come in
   */
  async *research(subjects, topic, options = {}) {
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
  isDaemonRunning,
};
