/**
 * Realtime Swarm Coordinator
 * 
 * Workers communicate via Supabase Realtime - instant push, no polling.
 * Each worker subscribes to the blackboard and reacts to messages.
 */

const { Dispatcher } = require('./dispatcher');
const { SupabaseBlackboard } = require('./blackboard-supabase');
const { globalLimiter } = require('./rate-limiter');

class RealtimeSwarmCoordinator {
  constructor(options = {}) {
    this.maxRounds = options.maxRounds || 3;
    this.maxWorkers = options.maxWorkers || 8;
    this.convergenceThreshold = options.convergenceThreshold || 2;
    this.dispatcher = new Dispatcher({ quiet: true, silent: options.silent });
    this.board = null;
    this.messageQueue = [];
    this.processingComplete = false;
  }

  /**
   * Run research with true realtime worker coordination
   */
  async research(topic, options = {}) {
    const taskId = `rt-research-${Date.now()}`;
    const subjects = options.subjects || [topic];
    
    // Create blackboard and subscribe to realtime updates
    this.board = new SupabaseBlackboard(taskId);
    this.messageQueue = [];
    
    console.log(`🐝 Starting REALTIME swarm research on: ${topic}`);
    console.log(`   Subjects: ${subjects.join(', ')}`);
    console.log(`   Max rounds: ${this.maxRounds}`);
    console.log(`   📡 Realtime subscriptions active\n`);

    // Subscribe to realtime - workers will react to each other's messages
    await this.subscribeToBoard();
    
    let round = 0;
    let noNewFindingsCount = 0;
    let previousFindingsCount = 0;
    
    while (round < this.maxRounds && noNewFindingsCount < this.convergenceThreshold) {
      round++;
      console.log(`📍 Round ${round}/${this.maxRounds}`);
      
      // Phase 1: Search (initial or follow-up)
      if (round === 1) {
        await this.parallelSearch(subjects, topic);
      } else {
        await this.followUpOnQuestions(topic);
      }
      
      // Wait briefly for realtime messages to propagate
      await this.waitForMessages(500);
      
      // Phase 2: Analyze findings and generate questions
      await this.analyzeAndQuestion(topic);
      
      // Check convergence via realtime cache (no polling!)
      const currentFindings = this.board.cache.findings.length;
      if (currentFindings === previousFindingsCount) {
        noNewFindingsCount++;
        console.log(`   ⏸️ No new findings (${noNewFindingsCount}/${this.convergenceThreshold})`);
      } else {
        noNewFindingsCount = 0;
        console.log(`   ✅ ${currentFindings - previousFindingsCount} new findings (via realtime)`);
      }
      previousFindingsCount = currentFindings;
    }
    
    // Synthesize
    console.log(`\n🔄 Synthesizing findings...`);
    const synthesis = await this.synthesize(topic);
    await this.board.postSynthesis(synthesis);
    await this.board.markDone(synthesis);
    
    // Cleanup subscription
    await this.board.unsubscribe();
    
    const stats = {
      rounds: round,
      totalFindings: this.board.cache.findings.length,
      questions: this.board.cache.questions.length,
      realtimeMessages: this.messageQueue.length,
      rateLimiter: globalLimiter.getStats(),
      backend: 'supabase-realtime',
    };
    
    console.log(`\n✨ Swarm complete: ${stats.totalFindings} findings in ${round} rounds`);
    console.log(`   📡 ${stats.realtimeMessages} realtime messages received`);
    
    return {
      synthesis,
      findings: this.board.cache.findings,
      stats,
    };
  }

  async subscribeToBoard() {
    return new Promise((resolve) => {
      // Subscribe with status callback to know when ready
      this.board.supabase
        .channel(`swarm:${this.board.taskId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'swarm_blackboard',
          filter: `task_id=eq.${this.board.taskId}`
        }, (payload) => {
          this.messageQueue.push(payload.new);
          
          // Update cache
          const msg = payload.new;
          if (msg.msg_type === 'FINDING') {
            this.board.cache.findings.push(msg.content);
          } else if (msg.msg_type === 'QUESTION') {
            this.board.cache.questions.push(msg.content);
          } else if (msg.msg_type === 'CLAIM') {
            this.board.cache.claims.push(msg.content);
          }
          
          // Log realtime message receipt
          const emoji = {
            'FINDING': '💡',
            'QUESTION': '❓',
            'CLAIM': '🎯',
            'SYNTHESIZE': '📝',
            'DONE': '✅'
          }[msg.msg_type] || '📨';
          
          console.log(`   ${emoji} Realtime: ${msg.msg_type} from ${msg.worker_id}`);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('   📡 Subscription ready');
            resolve();
          }
        });
    });
  }

  waitForMessages(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async parallelSearch(subjects, topic) {
    const tasks = subjects.map((subject, i) => ({
      nodeType: 'search',
      tool: 'web_search',
      input: `${subject} ${topic}`,
      options: { count: 3 },
      metadata: { subject, workerId: `search-${i}` },
    }));
    
    const results = await this.dispatcher.executeParallel(tasks);
    
    // Post findings - other workers will see via realtime
    for (let i = 0; i < results.results.length; i++) {
      const r = results.results[i];
      if (r.success && r.result?.results) {
        for (const item of r.result.results.slice(0, 2)) {
          await this.board.postFinding(
            `search-worker-${i}`,
            `[${subjects[i]}] ${item.title}: ${item.description}`,
            { source: item.url }
          );
        }
      }
    }
  }

  async followUpOnQuestions(topic) {
    // Use cached questions from realtime updates - no polling!
    const openQuestions = this.board.cache.questions.slice(-3);
    
    if (openQuestions.length === 0) return;
    
    const tasks = openQuestions.map((q, i) => ({
      nodeType: 'search',
      tool: 'web_search',
      input: `${q} ${topic}`,
      options: { count: 2 },
      metadata: { question: q, workerId: `followup-${i}` },
    }));
    
    const results = await this.dispatcher.executeParallel(tasks);
    
    for (let i = 0; i < results.results.length; i++) {
      const r = results.results[i];
      if (r.success && r.result?.results?.[0]) {
        const item = r.result.results[0];
        await this.board.postFinding(
          `followup-worker-${i}`,
          `[Answer: ${openQuestions[i]}] ${item.title}`,
          { source: item.url }
        );
      }
    }
  }

  async analyzeAndQuestion(topic) {
    // Use cached findings from realtime - no REST call!
    const findings = this.board.cache.findings;
    if (findings.length < 2) return;
    
    const findingsSummary = findings.slice(-5).join('\n- ');
    
    const tasks = [{
      nodeType: 'analyze',
      instruction: `Given these findings about "${topic}":
- ${findingsSummary}

What 1-2 important questions remain? Be specific, one line each.`,
    }];
    
    const results = await this.dispatcher.executeParallel(tasks);
    
    if (results.results[0]?.success) {
      const questions = results.results[0].result.response
        .split('\n')
        .filter(q => q.trim().length > 10)
        .slice(0, 2);
      
      for (const q of questions) {
        await this.board.postQuestion('analyst', q.replace(/^[-*\d.]\s*/, ''));
      }
    }
  }

  async synthesize(topic) {
    // Use cached findings - realtime updated!
    const findings = this.board.cache.findings;
    
    const tasks = [{
      nodeType: 'analyze',
      instruction: `Synthesize these findings about "${topic}" into a 2-3 paragraph summary:

${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
    }];
    
    const results = await this.dispatcher.executeParallel(tasks);
    return results.results[0]?.result?.response || 'Synthesis failed';
  }

  shutdown() {
    this.dispatcher.shutdown();
    if (this.board) {
      this.board.unsubscribe();
    }
  }
}

module.exports = { RealtimeSwarmCoordinator };
