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
const { buildChainPhases, validateChain, PERSPECTIVES, TRANSFORMS } = require('./chain');
const { buildAutoChain, previewChain, DEPTH_PRESETS } = require('./chain-builder');
const { runBenchmark, formatComparisonTable, SCORING_DIMENSIONS } = require('./benchmark');
const config = require('../config');
const { promptCache } = require('./cache');

const DEFAULT_PORT = 9999;
const HEARTBEAT_INTERVAL = 30000; // 30s keepalive

// Opus pricing per 1M tokens (for savings comparison)
const OPUS_INPUT_PER_1M = 15.00;
const OPUS_OUTPUT_PER_1M = 75.00;

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
      avgResponseMs: 0,      // Average per-request response time
      avgTaskMs: 0,           // Average per-task execution time
      totalTaskDurationMs: 0, // Sum of all individual task durations
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
        cost: this.getCostSummary(),
        cache: promptCache.getStats(),
        config: {
          maxNodes: config.scaling.maxNodes,
          provider: config.provider.name,
          webSearch: config.webSearch?.enabled || false,
          webSearchMode: config.webSearch?.enabled && config.provider?.name === 'gemini' 
            ? 'grounding' : config.webSearch?.enabled ? 'unsupported (requires gemini)' : 'disabled',
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

    // Capabilities discovery — tells orchestrator what execution modes are available
    if (url.pathname === '/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: '1.3.0',
        provider: config.provider.name,
        model: config.provider.model,
        webSearch: config.webSearch?.enabled || false,
        modes: {
          parallel: {
            description: 'Execute N prompts simultaneously across N workers. Best for independent tasks.',
            endpoint: 'POST /parallel',
            when: '3+ independent tasks, batch processing, multi-subject research',
            example: { prompts: ['prompt1', 'prompt2', 'prompt3'] },
          },
          research: {
            description: 'Multi-phase research: search → fetch → analyze. Best for deep-dive on subjects.',
            endpoint: 'POST /research',
            when: 'Need web data on multiple subjects with analysis',
            example: { subjects: ['subject1', 'subject2'], topic: 'angle' },
          },
          chain: {
            description: 'Refinement pipeline: data flows through multiple stages, each with a different perspective/filter. Stages can be parallel, single, fan-out (same data → multiple perspectives), or reduce (merge → synthesize). Use /chain for manual definitions, /chain/auto to describe what you want and let the builder construct the optimal pipeline.',
            endpoints: ['POST /chain (manual)', 'POST /chain/auto (dynamic)', 'POST /chain/preview (dry run)'],
            when: 'Complex analysis needing multiple passes, adversarial review, progressive refinement, or diverse perspectives on the same data',
            stageModes: {
              parallel: 'N inputs → N workers (same perspective). Use for parallel extraction/processing.',
              single: 'Merged input → 1 worker. Use for filtering, scoring, or focused analysis.',
              'fan-out': '1 input → N workers with DIFFERENT perspectives. Use for diverse viewpoints.',
              reduce: 'N inputs → 1 synthesized output. Use for final synthesis.',
            },
            builtInPerspectives: Object.keys(PERSPECTIVES),
            builtInTransforms: Object.keys(TRANSFORMS),
            depthPresets: Object.entries(DEPTH_PRESETS).reduce((acc, [k, v]) => {
              acc[k] = v.description;
              return acc;
            }, {}),
            autoExample: {
              task: 'Find business opportunities in this contractor feedback',
              data: '(your data here)',
              depth: 'standard',
            },
            manualExample: {
              name: 'Market Analysis',
              stages: [
                { name: 'Extract', mode: 'parallel', perspective: 'extractor', prompts: ['...'] },
                { name: 'Filter', mode: 'single', perspective: 'filter', inputTransform: 'merge' },
                { name: 'Perspectives', mode: 'fan-out', perspectives: ['analyst', 'challenger', 'strategist'] },
                { name: 'Synthesize', mode: 'reduce', perspective: 'synthesizer' },
              ],
            },
          },
        },
        limits: {
          maxWorkers: config.scaling.maxNodes,
          maxConcurrentApi: config.scaling.maxConcurrentApi,
          taskTimeoutMs: config.scaling.timeoutMs,
          retries: config.scaling.retries,
        },
        cost: this.getCostSummary(),
      }));
      return;
    }

    // Chain execution — refinement pipeline
    if (url.pathname === '/chain' && req.method === 'POST') {
      await this.handleChain(req, res);
      return;
    }

    // Auto-chain — describe what you want, get an optimal pipeline
    if (url.pathname === '/chain/auto' && req.method === 'POST') {
      await this.handleAutoChain(req, res);
      return;
    }

    // Preview auto-chain without executing
    if (url.pathname === '/chain/preview' && req.method === 'POST') {
      try {
        const body = await this.readBody(req);
        const opts = JSON.parse(body);
        const preview = previewChain(opts);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(preview));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // Benchmark — compare single vs parallel vs chain quality
    if (url.pathname === '/benchmark' && req.method === 'POST') {
      await this.handleBenchmark(req, res);
      return;
    }

    // Cache management
    if (url.pathname === '/cache') {
      if (req.method === 'DELETE') {
        promptCache.clear();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cleared: true }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(promptCache.getStats()));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', available: ['/health', '/status', '/capabilities', '/parallel', '/research', '/chain', '/chain/auto', '/chain/preview', '/benchmark', '/cache'] }));
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

      // Execute - pass webSearch flag if requested or if config default is on
      const useWebSearch = options.webSearch ?? config.webSearch?.parallelDefault ?? false;
      const tasks = prompts.map(prompt => ({
        nodeType: 'analyze',
        instruction: prompt,
        label: prompt.substring(0, 40),
        webSearch: useWebSearch,
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
        },
        cost: this.getCostSummary(),
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

      // Extract analyses from the last phase (phase 1 for grounding, phase 3 for classic)
      const lastPhase = result.phases[result.phases.length - 1];
      const analyses = lastPhase?.results
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
        },
        cost: this.getCostSummary(),
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message }) + '\n');
    }

    res.end();
  }

  /**
   * Handle benchmark — compare single vs parallel vs chain
   */
  async handleBenchmark(req, res) {
    const startTime = Date.now();
    this.stats.requests++;

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    try {
      const body = await this.readBody(req);
      const opts = JSON.parse(body);

      if (!opts.task || !opts.data) {
        res.write(JSON.stringify({ event: 'error', error: '"task" and "data" fields required' }) + '\n');
        res.end();
        return;
      }

      res.write(JSON.stringify({
        event: 'start',
        timestamp: Date.now(),
        message: '🏁 Benchmark starting: single vs parallel vs chain',
        modes: ['single', 'parallel (3 workers)', `chain (${opts.depth || 'standard'})`],
        scoringDimensions: Object.keys(SCORING_DIMENSIONS),
      }) + '\n');

      // Progress updates
      const phaseHandler = (data) => {
        res.write(JSON.stringify({ event: 'progress', ...data }) + '\n');
      };
      swarmEvents.on(EVENTS.PHASE_START, phaseHandler);
      swarmEvents.on(EVENTS.PHASE_COMPLETE, phaseHandler);

      const result = await runBenchmark(opts, this.dispatcher, buildAutoChain);

      swarmEvents.removeListener(EVENTS.PHASE_START, phaseHandler);
      swarmEvents.removeListener(EVENTS.PHASE_COMPLETE, phaseHandler);

      const duration = Date.now() - startTime;

      // Format comparison table
      const tableText = formatComparisonTable(result.comparison);

      res.write(JSON.stringify({
        event: 'complete',
        duration,
        comparisonTable: tableText,
        results: result.results.map(r => ({
          mode: r.mode,
          durationMs: r.durationMs,
          taskCount: r.taskCount,
          cost: r.cost,
          outputLength: r.outputLength,
          scores: r.scores,
          stages: r.stages,
        })),
        judgeCost: result.judgeCost,
        totalBenchmarkCost: result.totalBenchmarkCost,
        winner: result.results.reduce((best, r) => 
          (r.scores?.overall || 0) > (best.scores?.overall || 0) ? r : best
        ).mode,
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message, stack: e.stack?.split('\n').slice(0, 3) }) + '\n');
    }

    res.end();
  }

  /**
   * Handle auto-chain — build and execute pipeline from task description
   */
  async handleAutoChain(req, res) {
    const startTime = Date.now();
    this.stats.requests++;

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    try {
      const body = await this.readBody(req);
      const opts = JSON.parse(body);

      if (!opts.task) {
        res.write(JSON.stringify({ event: 'error', error: '"task" field required' }) + '\n');
        res.end();
        return;
      }

      // Build chain automatically
      const chainDef = buildAutoChain(opts);

      // Send the generated chain plan
      res.write(JSON.stringify({
        event: 'plan',
        timestamp: Date.now(),
        message: `🐝 Auto-chain: ${chainDef.name}`,
        meta: chainDef._meta,
        stages: chainDef.stages.map(s => ({
          name: s.name,
          mode: s.mode,
          perspective: s.perspective || s.perspectives?.join(', '),
        })),
      }) + '\n');

      // Validate
      const validation = validateChain(chainDef);
      if (!validation.valid) {
        res.write(JSON.stringify({ event: 'error', errors: validation.errors }) + '\n');
        res.end();
        return;
      }

      // Stream events
      const phaseStartHandler = (data) => {
        res.write(JSON.stringify({ event: 'phase_start', ...data }) + '\n');
      };
      const phaseCompleteHandler = (data) => {
        res.write(JSON.stringify({ event: 'phase_complete', ...data }) + '\n');
      };
      const taskHandler = (data) => {
        res.write(JSON.stringify({ event: 'task', ...data }) + '\n');
      };

      swarmEvents.on(EVENTS.PHASE_START, phaseStartHandler);
      swarmEvents.on(EVENTS.PHASE_COMPLETE, phaseCompleteHandler);
      swarmEvents.on(EVENTS.TASK_COMPLETE, taskHandler);

      // Execute
      const phases = buildChainPhases(chainDef);
      const result = await this.dispatcher.orchestrate(phases, {
        description: chainDef.name,
      });

      swarmEvents.removeListener(EVENTS.PHASE_START, phaseStartHandler);
      swarmEvents.removeListener(EVENTS.PHASE_COMPLETE, phaseCompleteHandler);
      swarmEvents.removeListener(EVENTS.TASK_COMPLETE, taskHandler);

      // Extract results
      const stageResults = result.phases.map((phase, i) => ({
        stage: chainDef.stages[i]?.name || phase.phase,
        mode: chainDef.stages[i]?.mode || 'single',
        success: phase.success,
        durationMs: phase.totalDurationMs,
        results: phase.results
          .filter(r => r.success)
          .map(r => r.result?.response || null),
      }));

      const lastStage = stageResults[stageResults.length - 1];
      const finalOutput = lastStage?.results?.length === 1
        ? lastStage.results[0]
        : lastStage?.results;

      const duration = Date.now() - startTime;
      const totalTasks = result.phases.reduce((sum, p) => sum + (p.results?.length || 0), 0);
      this.updateStats(duration, totalTasks);

      res.write(JSON.stringify({
        event: 'complete',
        duration,
        name: chainDef.name,
        output: finalOutput,
        stages: stageResults,
        stats: {
          totalStages: stageResults.length,
          totalTasks,
          successful: result.phases.reduce((sum, p) => sum + (p.results?.filter(r => r?.success).length || 0), 0),
          failed: result.phases.reduce((sum, p) => sum + (p.results?.filter(r => !r?.success).length || 0), 0),
        },
        cost: this.getCostSummary(),
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message }) + '\n');
    }

    res.end();
  }

  /**
   * Handle chain (refinement pipeline) execution
   */
  async handleChain(req, res) {
    const startTime = Date.now();
    this.stats.requests++;

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    res.write(JSON.stringify({
      event: 'start',
      timestamp: Date.now(),
      message: '🐝 Swarm chain starting...',
    }) + '\n');

    try {
      const body = await this.readBody(req);
      const chainDef = JSON.parse(body);

      // Validate chain definition
      const validation = validateChain(chainDef);
      if (!validation.valid) {
        res.write(JSON.stringify({ event: 'error', errors: validation.errors }) + '\n');
        res.end();
        return;
      }

      // Stream phase events
      const phaseStartHandler = (data) => {
        res.write(JSON.stringify({ event: 'phase_start', ...data }) + '\n');
      };
      const phaseCompleteHandler = (data) => {
        res.write(JSON.stringify({ event: 'phase_complete', ...data }) + '\n');
      };
      const taskHandler = (data) => {
        res.write(JSON.stringify({ event: 'task', ...data }) + '\n');
      };

      swarmEvents.on(EVENTS.PHASE_START, phaseStartHandler);
      swarmEvents.on(EVENTS.PHASE_COMPLETE, phaseCompleteHandler);
      swarmEvents.on(EVENTS.TASK_COMPLETE, taskHandler);

      // Build phases from chain definition and execute
      const phases = buildChainPhases(chainDef);
      const result = await this.dispatcher.orchestrate(phases, {
        description: chainDef.name || 'chain',
      });

      swarmEvents.removeListener(EVENTS.PHASE_START, phaseStartHandler);
      swarmEvents.removeListener(EVENTS.PHASE_COMPLETE, phaseCompleteHandler);
      swarmEvents.removeListener(EVENTS.TASK_COMPLETE, taskHandler);

      // Extract results from each stage
      const stageResults = result.phases.map((phase, i) => ({
        stage: chainDef.stages[i]?.name || phase.phase,
        mode: chainDef.stages[i]?.mode || 'single',
        success: phase.success,
        durationMs: phase.totalDurationMs,
        results: phase.results
          .filter(r => r.success)
          .map(r => r.result?.response || null),
      }));

      // Final output = last stage's results
      const lastStage = stageResults[stageResults.length - 1];
      const finalOutput = lastStage?.results?.length === 1
        ? lastStage.results[0]
        : lastStage?.results;

      const duration = Date.now() - startTime;
      const totalTasks = result.phases.reduce((sum, p) => sum + (p.results?.length || 0), 0);
      this.updateStats(duration, totalTasks);

      res.write(JSON.stringify({
        event: 'complete',
        duration,
        name: chainDef.name,
        output: finalOutput,
        stages: stageResults,
        stats: {
          totalStages: stageResults.length,
          totalTasks,
          successful: result.phases.reduce((sum, p) => sum + (p.results?.filter(r => r?.success).length || 0), 0),
          failed: result.phases.reduce((sum, p) => sum + (p.results?.filter(r => !r?.success).length || 0), 0),
        },
        cost: this.getCostSummary(),
      }) + '\n');

    } catch (e) {
      res.write(JSON.stringify({ event: 'error', error: e.message }) + '\n');
    }

    res.end();
  }

  /**
   * Build research phases for orchestration
   * 
   * Two modes:
   * - Web search enabled (Gemini): Single-phase with Google Search grounding
   *   Workers query Google directly — no manual Search+Fetch needed
   * - Web search disabled: Classic 3-phase (Search → Fetch → Analyze)
   *   Uses web_search/web_fetch tools for manual data gathering
   */
  buildResearchPhases(subjects, topic) {
    const webSearchEnabled = config.webSearch?.enabled && config.provider?.name === 'gemini';

    if (webSearchEnabled) {
      // Single-phase: Gemini workers search Google natively via grounding
      return [
        {
          name: 'Research',
          tasks: subjects.map(subject => ({
            nodeType: 'analyze',
            webSearch: true,
            instruction: `Research ${subject} regarding ${topic}. Search for the latest information available. Be thorough but concise. Include key facts, numbers, pricing, dates, and actionable insights. Cite sources when possible.`,
            metadata: { subject },
            label: subject,
          })),
        },
      ];
    }

    // Classic 3-phase: manual Search → Fetch → Analyze
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
   * Aggregate cost and savings across all workers
   */
  getCostSummary() {
    if (!this.dispatcher) return null;
    
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalSwarmCost = 0;

    for (const node of this.dispatcher.nodes.values()) {
      const stats = node.getStats();
      totalInputTokens += stats.tokens?.input || 0;
      totalOutputTokens += stats.tokens?.output || 0;
      totalSwarmCost += parseFloat(stats.cost?.totalCost || 0);
    }

    // What this would have cost on Opus
    const opusCost = (totalInputTokens / 1_000_000) * OPUS_INPUT_PER_1M 
                   + (totalOutputTokens / 1_000_000) * OPUS_OUTPUT_PER_1M;
    const saved = opusCost - totalSwarmCost;

    // Get daily totals (persisted across restarts)
    let daily = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const summaryFile = path.join(process.env.HOME, '.config/clawdbot/swarm-metrics/daily-summary.json');
      if (fs.existsSync(summaryFile)) {
        const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
        const today = new Date().toISOString().split('T')[0];
        if (summary[today]?.cost) {
          daily = summary[today].cost;
        }
      }
    } catch (e) { /* non-critical */ }

    return {
      session: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        swarmCost: totalSwarmCost.toFixed(6),
        opusEquivalent: opusCost.toFixed(4),
        saved: saved.toFixed(4),
        savingsMultiplier: totalSwarmCost > 0 ? (opusCost / totalSwarmCost).toFixed(0) + 'x' : 'N/A',
      },
      daily: daily || {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        swarmCost: totalSwarmCost.toFixed(6),
        opusEquivalent: opusCost.toFixed(4),
        saved: saved.toFixed(4),
        savingsMultiplier: totalSwarmCost > 0 ? (opusCost / totalSwarmCost).toFixed(0) + 'x' : 'N/A',
      },
      // Flat fields for backward compat
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      swarmCost: totalSwarmCost.toFixed(6),
      opusEquivalent: opusCost.toFixed(4),
      saved: saved.toFixed(4),
      savingsMultiplier: totalSwarmCost > 0 ? (opusCost / totalSwarmCost).toFixed(0) + 'x' : 'N/A',
    };
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
    // Per-task average: total wall time / total tasks
    this.stats.totalTaskDurationMs += durationMs;
    this.stats.avgTaskMs = Math.round(this.stats.totalTaskDurationMs / this.stats.totalTasks);

    // Persist cost data to daily metrics
    try {
      const cost = this.getCostSummary();
      if (cost) {
        const { metrics } = require('./metrics');
        metrics.updateDailyCost(cost);
      }
    } catch (e) {
      // Non-critical — don't fail requests over metrics
    }
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
    const wsEnabled = config.webSearch?.enabled && config.provider?.name === 'gemini';
    console.log(`   Web search: ${wsEnabled ? '✅ enabled (Google Search grounding)' : '❌ disabled'}`);
    if (config.webSearch?.enabled && config.provider?.name !== 'gemini') {
      console.log(`   ⚠️  Web search requires Gemini provider (current: ${config.provider.name})`);
    }
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
      console.log(`   GET  /health         - Health check`);
      console.log(`   GET  /status         - Detailed status`);
      console.log(`   GET  /capabilities   - Discover execution modes`);
      console.log(`   POST /parallel       - Execute prompts in parallel`);
      console.log(`   POST /research       - Multi-phase research`);
      console.log(`   POST /chain          - Refinement pipeline (manual)`);
      console.log(`   POST /chain/auto     - Refinement pipeline (dynamic)`);
      console.log(`   POST /chain/preview  - Preview pipeline (dry run)`);
      console.log(`   POST /benchmark      - Quality comparison test`);
      console.log('');
      console.log('Waiting for requests... (Ctrl+C to stop)');
    });

    // Keepalive - prevent connections from going stale
    this.server.keepAliveTimeout = HEARTBEAT_INTERVAL;
    
    // Periodic cache maintenance (every 5 min)
    this._cacheInterval = setInterval(() => {
      const pruned = promptCache.prune();
      if (pruned > 0) console.log(`📦 Cache: pruned ${pruned} expired entries`);
      promptCache.persist();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop the daemon
   */
  stop() {
    if (this._cacheInterval) clearInterval(this._cacheInterval);
    promptCache.persist();
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
