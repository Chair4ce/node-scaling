/**
 * Swarm Coordinator
 * 
 * Manages autonomous worker-to-worker collaboration.
 * Workers communicate via blackboard (file or Supabase), coordinator monitors convergence.
 * Minimal Opus involvement - only for final synthesis if needed.
 */

const { Blackboard } = require('./blackboard');
const { Dispatcher } = require('./dispatcher');
const { globalLimiter } = require('./rate-limiter');

// Try to load Supabase blackboard (optional)
let SupabaseBlackboard;
try {
  SupabaseBlackboard = require('./blackboard-supabase').SupabaseBlackboard;
} catch (e) {
  // Supabase not available, will use file-based
}

// Helper to make sync blackboard methods async-compatible
async function callBoard(board, method, ...args) {
  const result = board[method](...args);
  return result instanceof Promise ? await result : result;
}

class SwarmCoordinator {
  constructor(options = {}) {
    this.maxRounds = options.maxRounds || 3;
    this.maxWorkers = options.maxWorkers || 8;
    this.convergenceThreshold = options.convergenceThreshold || 2;
    this.dispatcher = new Dispatcher({ quiet: true, silent: options.silent });
    this.useSupabase = options.useSupabase !== false && SupabaseBlackboard;
  }

  /**
   * Run an autonomous research swarm
   */
  async research(topic, options = {}) {
    const taskId = `research-${Date.now()}`;
    
    // Use Supabase blackboard if available
    let board;
    const useSupabase = (options.useSupabase !== false) && this.useSupabase;
    
    if (useSupabase) {
      board = new SupabaseBlackboard(taskId, options.supabaseConfig);
      console.log('   Using Supabase blackboard (realtime)');
    } else {
      board = new Blackboard(taskId);
      console.log('   Using file-based blackboard');
    }
    
    const subjects = options.subjects || [topic];
    
    console.log(`🐝 Starting autonomous swarm research on: ${topic}`);
    console.log(`   Subjects: ${subjects.join(', ')}`);
    console.log(`   Max rounds: ${this.maxRounds}`);
    
    let round = 0;
    let noNewFindingsCount = 0;
    let previousFindingsCount = 0;
    
    while (round < this.maxRounds && noNewFindingsCount < this.convergenceThreshold) {
      round++;
      
      console.log(`\n📍 Round ${round}/${this.maxRounds}`);
      
      // Phase 1: Initial search (first round) or follow-up search
      if (round === 1) {
        await this.initialSearch(board, subjects, topic);
      } else {
        await this.followUpSearch(board, topic);
      }
      
      // Phase 2: Workers analyze and build on findings
      await this.analyzeFindings(board, topic);
      
      // Check convergence
      const state = await callBoard(board, 'getState');
      const currentFindingsCount = state.findings?.length || 0;
      
      if (currentFindingsCount === previousFindingsCount) {
        noNewFindingsCount++;
        console.log(`   ⏸️ No new findings (${noNewFindingsCount}/${this.convergenceThreshold})`);
      } else {
        noNewFindingsCount = 0;
        console.log(`   ✅ ${currentFindingsCount - previousFindingsCount} new findings`);
      }
      previousFindingsCount = currentFindingsCount;
    }
    
    // Final synthesis
    console.log(`\n🔄 Synthesizing findings...`);
    const synthesis = await this.synthesize(board, topic);
    await callBoard(board, 'postSynthesis', synthesis);
    await callBoard(board, 'markDone', synthesis);
    
    const finalState = await callBoard(board, 'getState');
    const stats = {
      rounds: round,
      totalFindings: finalState.findings?.length || 0,
      questions: finalState.questions?.length || 0,
      rateLimiter: globalLimiter.getStats(),
      backend: useSupabase ? 'supabase' : 'file',
    };
    
    console.log(`\n✨ Swarm complete: ${stats.totalFindings} findings in ${round} rounds`);
    
    return {
      synthesis,
      findings: finalState.findings || [],
      stats,
    };
  }

  async initialSearch(board, subjects, topic) {
    const tasks = subjects.map(subject => ({
      nodeType: 'search',
      tool: 'web_search',
      input: `${subject} ${topic}`,
      options: { count: 3 },
      metadata: { subject },
    }));
    
    const results = await this.dispatcher.executeParallel(tasks);
    
    for (let i = 0; i < results.results.length; i++) {
      const r = results.results[i];
      if (r.success && r.result?.results) {
        for (const item of r.result.results.slice(0, 2)) {
          await callBoard(board, 'postFinding', `search-worker-${i}`,
            `[${subjects[i]}] ${item.title}: ${item.description}`,
            { source: item.url }
          );
        }
      }
    }
  }

  async followUpSearch(board, topic) {
    const context = await callBoard(board, 'getContext');
    
    if (context.openQuestions?.length > 0) {
      const tasks = context.openQuestions.slice(0, 3).map((q, i) => ({
        nodeType: 'search',
        tool: 'web_search',
        input: `${q} ${topic}`,
        options: { count: 2 },
        metadata: { question: q },
      }));
      
      const results = await this.dispatcher.executeParallel(tasks);
      
      for (let i = 0; i < results.results.length; i++) {
        const r = results.results[i];
        if (r.success && r.result?.results?.[0]) {
          const item = r.result.results[0];
          await callBoard(board, 'postFinding', `followup-worker-${i}`,
            `[Answer to: ${context.openQuestions[i]}] ${item.title}`,
            { source: item.url }
          );
        }
      }
    }
  }

  async analyzeFindings(board, topic) {
    const context = await callBoard(board, 'getContext');
    if (!context.findings || context.findings.length < 2) return;
    
    const findingsSummary = context.findings.slice(-5).join('\n- ');
    
    const tasks = [{
      nodeType: 'analyze',
      instruction: `Given these findings about "${topic}":
- ${findingsSummary}

What important questions remain unanswered? List 1-2 specific questions.
Keep it brief, one line per question.`,
    }];
    
    const results = await this.dispatcher.executeParallel(tasks);
    
    if (results.results[0]?.success) {
      const questions = results.results[0].result.response
        .split('\n')
        .filter(q => q.trim().length > 10)
        .slice(0, 2);
      
      for (const q of questions) {
        await callBoard(board, 'postQuestion', 'analysis-worker', q.replace(/^[-*\d.]\s*/, ''));
      }
    }
  }

  async synthesize(board, topic) {
    const state = await callBoard(board, 'getState');
    const findings = (state.findings || []).map(f => typeof f === 'string' ? f : f.finding || f.content);
    
    const tasks = [{
      nodeType: 'analyze',
      instruction: `Synthesize these research findings about "${topic}" into a clear, concise summary.
Include key facts, statistics, and insights.

Findings:
${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Write a 2-3 paragraph summary:`,
    }];
    
    const results = await this.dispatcher.executeParallel(tasks);
    return results.results[0]?.result?.response || 'Synthesis failed';
  }

  shutdown() {
    this.dispatcher.shutdown();
  }
}

module.exports = { SwarmCoordinator };
