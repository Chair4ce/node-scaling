#!/usr/bin/env node
/**
 * Comprehensive Benchmark: Single Node vs Multi-Node Orchestration
 * 
 * Task: Research and compare the top 3 AI assistant tools
 * This requires: searching, fetching, analyzing, extracting, and synthesizing
 */

const { Dispatcher } = require('./lib/dispatcher');
const { GeminiClient } = require('./lib/gemini-client');
const { webSearch, webFetch } = require('./lib/tools');

// The research task - complex enough to benefit from parallelization
const RESEARCH_TASK = {
  topic: 'AI coding assistants comparison 2024',
  subjects: ['GitHub Copilot', 'Cursor AI', 'Claude'],
  questions: [
    'What are the main features?',
    'What is the pricing?',
    'What are the pros and cons?',
  ],
};

/**
 * SINGLE NODE APPROACH
 * One LLM does everything sequentially
 */
async function singleNodeExecution() {
  console.log('\n' + '='.repeat(60));
  console.log('🐌 SINGLE NODE EXECUTION (Sequential)');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const llm = new GeminiClient();
  const results = { searches: [], fetches: [], analyses: [], final: null };
  
  // Step 1: Search for each subject (sequential)
  console.log('\n📍 Phase 1: Searching (sequential)...');
  for (const subject of RESEARCH_TASK.subjects) {
    const searchStart = Date.now();
    const query = `${subject} ${RESEARCH_TASK.topic}`;
    const searchResult = await webSearch(query, { count: 3 });
    results.searches.push({ subject, ...searchResult, duration: Date.now() - searchStart });
    console.log(`  ✓ Searched "${subject}" - ${Date.now() - searchStart}ms`);
  }
  
  // Step 2: Fetch top result for each (sequential)
  console.log('\n📍 Phase 2: Fetching content (sequential)...');
  for (const search of results.searches) {
    if (search.results && search.results[0]) {
      const fetchStart = Date.now();
      const fetchResult = await webFetch(search.results[0].url, { maxChars: 8000 });
      results.fetches.push({ 
        subject: search.subject, 
        url: search.results[0].url,
        ...fetchResult, 
        duration: Date.now() - fetchStart 
      });
      console.log(`  ✓ Fetched ${search.subject} - ${Date.now() - fetchStart}ms`);
    }
  }
  
  // Step 3: Analyze each piece of content (sequential)
  console.log('\n📍 Phase 3: Analyzing content (sequential)...');
  for (const fetch of results.fetches) {
    if (fetch.success && fetch.content) {
      const analyzeStart = Date.now();
      const prompt = `Analyze this content about ${fetch.subject}. Extract: main features, pricing if mentioned, and pros/cons.

Content (truncated):
${fetch.content.substring(0, 5000)}

Provide a structured summary.`;
      
      const analysis = await llm.complete(prompt);
      results.analyses.push({ 
        subject: fetch.subject, 
        analysis, 
        duration: Date.now() - analyzeStart 
      });
      console.log(`  ✓ Analyzed ${fetch.subject} - ${Date.now() - analyzeStart}ms`);
    }
  }
  
  // Step 4: Synthesize final comparison
  console.log('\n📍 Phase 4: Synthesizing final report...');
  const synthesizeStart = Date.now();
  const synthesisPrompt = `Create a comparison report of these AI coding assistants based on the following analyses:

${results.analyses.map(a => `### ${a.subject}\n${a.analysis}`).join('\n\n')}

Provide a structured comparison with:
1. Feature comparison table (text format)
2. Pricing comparison
3. Best use cases for each
4. Overall recommendation`;

  results.final = await llm.complete(synthesisPrompt);
  console.log(`  ✓ Synthesis complete - ${Date.now() - synthesizeStart}ms`);
  
  const totalDuration = Date.now() - startTime;
  
  return {
    approach: 'single-node',
    totalDurationMs: totalDuration,
    phases: {
      search: results.searches.reduce((sum, s) => sum + s.duration, 0),
      fetch: results.fetches.reduce((sum, f) => sum + (f.duration || 0), 0),
      analyze: results.analyses.reduce((sum, a) => sum + a.duration, 0),
      synthesize: Date.now() - synthesizeStart,
    },
    results,
  };
}

/**
 * MULTI-NODE ORCHESTRATED APPROACH
 * Specialized nodes working in parallel
 */
async function multiNodeExecution() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MULTI-NODE ORCHESTRATED EXECUTION (Parallel)');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const dispatcher = new Dispatcher();
  
  // Define orchestration phases
  const phases = [
    {
      name: 'Search Phase',
      tasks: RESEARCH_TASK.subjects.map(subject => ({
        nodeType: 'search',
        tool: 'web_search',
        input: `${subject} ${RESEARCH_TASK.topic}`,
        options: { count: 3 },
        metadata: { subject },
      })),
    },
    {
      name: 'Fetch Phase',
      tasks: (previousResults) => {
        const searchResults = previousResults[0].results;
        return searchResults
          .filter(r => r.success && r.result.results?.length > 0)
          .map(r => ({
            nodeType: 'fetch',
            tool: 'web_fetch',
            input: r.result.results[0].url,
            options: { maxChars: 8000 },
            metadata: { subject: r.result.query.split(' ')[0] },
          }));
      },
    },
    {
      name: 'Analyze Phase',
      tasks: (previousResults) => {
        const fetchResults = previousResults[1].results;
        return fetchResults
          .filter(r => r.success && r.result.content)
          .map(r => ({
            nodeType: 'analyze',
            instruction: `Analyze this content about an AI coding assistant. Extract: main features, pricing if mentioned, and pros/cons. Be concise but thorough.`,
            input: r.result.content.substring(0, 5000),
            metadata: { url: r.result.url },
          }));
      },
    },
    {
      name: 'Synthesize Phase',
      tasks: (previousResults) => {
        const analyses = previousResults[2].results
          .filter(r => r.success)
          .map(r => r.result.response || r.result);
        
        return [{
          nodeType: 'synthesize',
          instruction: `Create a comparison report of AI coding assistants. Include:
1. Feature comparison (text table format)
2. Pricing comparison  
3. Best use cases for each
4. Overall recommendation`,
          input: analyses,
        }];
      },
    },
  ];
  
  // Execute orchestration
  const orchestrationResult = await dispatcher.orchestrate(phases);
  
  const totalDuration = Date.now() - startTime;
  
  // Extract final result
  const finalPhase = orchestrationResult.phases[orchestrationResult.phases.length - 1];
  const finalResult = finalPhase?.results?.[0]?.result?.response || 
                      finalPhase?.results?.[0]?.result?.synthesis ||
                      'No synthesis result';
  
  dispatcher.shutdown();
  
  return {
    approach: 'multi-node',
    totalDurationMs: totalDuration,
    phases: orchestrationResult.phases.map(p => ({
      name: p.phase,
      duration: p.totalDurationMs,
      parallelEfficiency: p.parallelEfficiency,
      tasksCompleted: p.results.filter(r => r.success).length,
    })),
    nodeStats: orchestrationResult.nodeStats,
    finalResult,
  };
}

/**
 * Run benchmark and compare
 */
async function runBenchmark() {
  console.log('\n🔬 NODE SCALING BENCHMARK');
  console.log('Task: Research and compare top AI coding assistants');
  console.log(`Subjects: ${RESEARCH_TASK.subjects.join(', ')}`);
  
  // Run single node first
  let singleResult;
  try {
    singleResult = await singleNodeExecution();
  } catch (error) {
    console.error('Single node execution failed:', error.message);
    singleResult = { totalDurationMs: Infinity, error: error.message };
  }
  
  // Brief pause between tests
  await new Promise(r => setTimeout(r, 1000));
  
  // Run multi-node
  let multiResult;
  try {
    multiResult = await multiNodeExecution();
  } catch (error) {
    console.error('Multi-node execution failed:', error.message);
    multiResult = { totalDurationMs: Infinity, error: error.message };
  }
  
  // Compare results
  console.log('\n' + '='.repeat(60));
  console.log('📊 BENCHMARK RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n⏱️  TIMING COMPARISON:');
  console.log(`  Single Node:  ${singleResult.totalDurationMs}ms`);
  console.log(`  Multi-Node:   ${multiResult.totalDurationMs}ms`);
  
  const speedup = singleResult.totalDurationMs / multiResult.totalDurationMs;
  console.log(`  Speedup:      ${speedup.toFixed(2)}x ${speedup > 1 ? '🚀' : '🐌'}`);
  
  if (singleResult.phases && multiResult.phases) {
    console.log('\n📍 PHASE BREAKDOWN:');
    console.log('  Single Node (sequential):');
    Object.entries(singleResult.phases).forEach(([phase, duration]) => {
      console.log(`    ${phase}: ${duration}ms`);
    });
    
    console.log('  Multi-Node (parallel):');
    multiResult.phases.forEach(phase => {
      console.log(`    ${phase.name}: ${phase.duration}ms (${phase.tasksCompleted} tasks, ${phase.parallelEfficiency}x parallel efficiency)`);
    });
  }
  
  if (multiResult.nodeStats) {
    console.log('\n🖥️  NODE UTILIZATION:');
    multiResult.nodeStats.forEach(node => {
      console.log(`    ${node.type}: ${node.completedTasks} tasks, avg ${node.avgDurationMs}ms`);
    });
  }
  
  console.log('\n📝 QUALITY CHECK:');
  console.log('  Single Node Output Preview:');
  const singlePreview = singleResult.results?.final?.substring(0, 200) || 'N/A';
  console.log(`    "${singlePreview}..."`);
  
  console.log('  Multi-Node Output Preview:');
  const multiPreview = multiResult.finalResult?.substring(0, 200) || 'N/A';
  console.log(`    "${multiPreview}..."`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ BENCHMARK COMPLETE');
  console.log('='.repeat(60));
  
  return { singleResult, multiResult, speedup };
}

// Run if executed directly
runBenchmark().catch(console.error);
