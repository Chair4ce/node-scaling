/**
 * Swarm Daemon
 * Long-running process with warm workers ready to go
 * 
 * Optimizations:
 * - Pre-warmed worker pool
 * - HTTP keep-alive connections
 * - Instant acknowledgment, streaming results
 */

const http = require('http');
const { Dispatcher } = require('./dispatcher');
const { swarmEvents, EVENTS } = require('./events');
const config = require('../config');

const DEFAULT_PORT = 9999;
const HEARTBEAT_INTERVAL = 30000; // 30s keepalive

class SwarmDaemon {
  constructor(options = {}) {
    this.port = options.port || DEFAULT_PORT;
    this.server = null;
    this.dispatcher = null;
    this.startTime = null;
    this.requestCount = 0;
    this.warmWorkers = options.warmWorkers || 6;
    
    // Stats
    this.stats = {
      requests: 0,
      totalTasks: 0,
      avgResponseMs: 0,
      uptime: 0,
    };
  }

  /**
   * Pre-warm workers so they're ready instantly
   */
  async warmUp() {
    console.log(`🔥 Warming up ${this.warmWorkers} workers...`);
    
    // Create dispatcher with silent mode (no console spam)
    this.dispatcher = new Dispatcher({ 
      quiet: true, 
      silent: true,
      trackMetrics: false 
    });
    
    // Pre-create workers of each type
    const types = ['search', 'fetch', 'analyze'];
    const workersPerType = Math.ceil(this.warmWorkers / types.length);
    
    for (const type of types) {
      for (let i = 0; i < workersPerType; i++) {
        try {
          this.dispatcher.getOrCreateNode(type);
        } catch (e) {
          // Max nodes reached, that's fine
          break;
        }
      }
    }
    
    console.log(`✓ ${this.dispatcher.nodes.size} workers ready`);
    
    // Optional: Make a tiny test call to warm up API connections
    // This ensures first real request doesn't pay connection setup cost
    try {
      const { GeminiClient } = require('./gemini-client');
      const client = new GeminiClient();
      await client.complete('Say "ready"', { maxTokens: 5 });
      console.log('✓ API connection warm');
    } catch (e) {
      console.log('⚠ API warmup skipped:', e.message);
    }
  }

  /**
   * Handle incoming requests
   */
  async handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    
    // CORS headers for local use
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check - instant response
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Date.now() - this.startTime,
        workers: this.dispatcher?.nodes.size || 0,
        requests: this.stats.requests,
      }));
      return;
    }

    // Status - detailed stats
    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...this.stats,
        uptime: Date.now() - this.startTime,
        workers: this.dispatcher?.getStatus() || {},
        config: {
          maxNodes: config.scaling.maxNodes,
          provider: config.provider.name,
        },
      }));
      return;
    }

    // Parallel execution
    if (url.pathname === '/parallel' && req.method === 'POST') {
      await this.handleParallel(req, res);
      return;
    }

    // Research (multi-phase)
    if (url.pathname === '/research' && req.method === 'POST') {
      await this.handleResearch(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle parallel prompt execution
   */
  async handleParallel(req, res) {
    const startTime = Date.now();
    this.stats.requests++;

    // Immediate acknowledgment with streaming
    res.writeHead(200, { 
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    // Send instant ack
    res.write(JSON.stringify({ 
      event: 'start', 
      timestamp: Date.now(),
      message: '🐝 Swarm processing...'
    }) + '\n');

    try {
      const body = await this.readBody(req);
      const { prompts, options = {} } = JSON.parse(body);

      if (!prompts || !Array.isArray(prompts)) {
        res.write(JSON.stringify({ event: 'error', error: 'prompts array required' }) + '\n');
        res.end();
        return;
      }

      // Stream progress events
      const progressHandler = (data) => {
        res.write(JSON.stringify({ event: 'progress', ...data }) + '\n');
      };
      swarmEvents.on(EVENTS.TASK_COMPLETE, progressHandler);

      // Execute
      const tasks = prompts.map(prompt => ({
        nodeType: 'analyze',
        instruction: prompt,
        label: prompt.substring(0, 40),
      }));

      const result = await this.dispatcher.executeParallel(tasks);
      
      swarmEvents.removeListener(EVENTS.TASK_COMPLETE, progressHandler);

      // Send final results
      const duration = Date.now() - startTime;
      this.updateStats(duration, prompts.length);

      res.write(JSON.stringify({
        event: 'complete',
        duration,
        results: result.results.map(r => r.success ? r.result?.response : null),
        stats: {
          successful: result.results.filter(r => r.success).length,
          failed: result.results.filter(r => !r.success).length,
        }
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message }) + '\n');
    }

    res.end();
  }

  /**
   * Handle research (multi-phase) execution
   */
  async handleResearch(req, res) {
    const startTime = Date.now();
    this.stats.requests++;

    // Immediate acknowledgment with streaming
    res.writeHead(200, { 
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    // Instant ack - this is the TTFT optimization
    res.write(JSON.stringify({ 
      event: 'start', 
      timestamp: Date.now(),
      message: '🐝 Swarm research starting...'
    }) + '\n');

    try {
      const body = await this.readBody(req);
      const { subjects, topic, options = {} } = JSON.parse(body);

      if (!subjects || !Array.isArray(subjects)) {
        res.write(JSON.stringify({ event: 'error', error: 'subjects array required' }) + '\n');
        res.end();
        return;
      }

      // Stream phase events
      const phaseHandler = (data) => {
        res.write(JSON.stringify({ event: 'phase', ...data }) + '\n');
      };
      const taskHandler = (data) => {
        res.write(JSON.stringify({ event: 'task', ...data }) + '\n');
      };
      
      swarmEvents.on(EVENTS.PHASE_START, phaseHandler);
      swarmEvents.on(EVENTS.TASK_COMPLETE, taskHandler);

      // Build research phases
      const phases = this.buildResearchPhases(subjects, topic);
      const result = await this.dispatcher.orchestrate(phases, { silent: true });

      swarmEvents.removeListener(EVENTS.PHASE_START, phaseHandler);
      swarmEvents.removeListener(EVENTS.TASK_COMPLETE, taskHandler);

      // Extract analyses from phase 3
      const analyses = result.phases[2]?.results
        .filter(r => r.success)
        .map((r, i) => ({
          subject: subjects[i],
          analysis: r.result?.response || null,
        })) || [];

      const duration = Date.now() - startTime;
      this.updateStats(duration, subjects.length * 3);

      res.write(JSON.stringify({
        event: 'complete',
        duration,
        subjects,
        topic,
        analyses,
        stats: {
          phases: result.phases.length,
          totalTasks: result.phases.reduce((sum, p) => sum + (p.results?.length || 0), 0),
        }
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message }) + '\n');
    }

    res.end();
  }

  /**
   * Build research phases for orchestration
   */
  buildResearchPhases(subjects, topic) {
    return [
      {
        name: 'Search',
        tasks: subjects.map(subject => ({
          nodeType: 'search',
          tool: 'web_search',
          input: `${subject} ${topic}`,
          options: { count: 3 },
          metadata: { subject },
          label: subject,
        })),
      },
      {
        name: 'Fetch',
        tasks: (prev) => {
          return prev[0].results
            .filter(r => r.success && r.result?.results?.[0])
            .map((r, i) => ({
              nodeType: 'fetch',
              tool: 'web_fetch',
              input: r.result.results[0].url,
              options: { maxChars: 8000 },
              metadata: { subject: subjects[i] },
              label: subjects[i],
            }));
        },
      },
      {
        name: 'Analyze',
        tasks: (prev) => {
          const fetches = prev[1].results.filter(r => r.success);
          return subjects.map((subject, i) => ({
            nodeType: 'analyze',
            instruction: `Analyze and summarize information about ${subject} regarding ${topic}. Be thorough but concise. Include key facts, numbers, and insights.`,
            input: fetches[i]?.result?.content?.substring(0, 5000) || '',
            metadata: { subject },
            label: subject,
          }));
        },
      },
    ];
  }

  /**
   * Helper to read request body
   */
  readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Update running stats
   */
  updateStats(durationMs, taskCount) {
    this.stats.totalTasks += taskCount;
    const n = this.stats.requests;
    this.stats.avgResponseMs = Math.round(
      (this.stats.avgResponseMs * (n - 1) + durationMs) / n
    );
  }

  /**
   * Start the daemon
   */
  async start() {
    this.startTime = Date.now();
    
    console.log('🐝 Swarm Daemon starting...');
    console.log(`   Port: ${this.port}`);
    console.log(`   Provider: ${config.provider.name}`);
    console.log(`   Max workers: ${config.scaling.maxNodes}`);
    console.log('');

    // Warm up workers
    await this.warmUp();
    console.log('');

    // Start HTTP server
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    
    this.server.listen(this.port, () => {
      console.log(`🚀 Swarm Daemon ready on http://localhost:${this.port}`);
      console.log('');
      console.log('Endpoints:');
      console.log(`   GET  /health   - Health check`);
      console.log(`   GET  /status   - Detailed status`);
      console.log(`   POST /parallel - Execute prompts in parallel`);
      console.log(`   POST /research - Multi-phase research`);
      console.log('');
      console.log('Waiting for requests... (Ctrl+C to stop)');
    });

    // Keepalive - prevent connections from going stale
    this.server.keepAliveTimeout = HEARTBEAT_INTERVAL;
  }

  /**
   * Stop the daemon
   */
  stop() {
    if (this.server) {
      this.server.close();
      console.log('\n🛑 Swarm Daemon stopped');
    }
    if (this.dispatcher) {
      this.dispatcher.shutdown();
    }
  }
}

module.exports = { SwarmDaemon };
