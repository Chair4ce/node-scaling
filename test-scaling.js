#!/usr/bin/env node
/**
 * Node Scaling Test Runner
 * Demonstrates parallel task execution with Gemini Flash
 */

const { Dispatcher } = require('./lib/dispatcher');
const { GeminiClient } = require('./lib/gemini-client');

async function testSingleCall() {
  console.log('\n=== Test 1: Single Gemini Flash Call ===');
  const client = new GeminiClient();
  
  const start = Date.now();
  const result = await client.complete('What is 2+2? Reply with just the number.');
  const duration = Date.now() - start;
  
  console.log(`Result: ${result.trim()}`);
  console.log(`Duration: ${duration}ms`);
  return duration;
}

async function testParallelCalls() {
  console.log('\n=== Test 2: Parallel Gemini Flash Calls (5x) ===');
  const client = new GeminiClient();
  
  const prompts = [
    'What is the capital of France? One word answer.',
    'What is the largest planet? One word answer.',
    'What color is the sky? One word answer.',
    'How many continents are there? Number only.',
    'What is H2O commonly called? One word answer.',
  ];
  
  const start = Date.now();
  const results = await client.batch(prompts);
  const duration = Date.now() - start;
  
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.success ? r.result.trim() : `ERROR: ${r.error}`}`);
  });
  console.log(`Total duration: ${duration}ms (parallel)`);
  console.log(`Effective per-call: ${Math.round(duration / prompts.length)}ms`);
  return duration;
}

async function testDispatcher() {
  console.log('\n=== Test 3: Dispatcher with Worker Nodes ===');
  const dispatcher = new Dispatcher();
  
  // Spawn 5 research workers
  dispatcher.spawnWorkers(5, 'research');
  console.log('Status:', dispatcher.getStatus());
  
  // Submit batch of research tasks
  const tasks = [
    { instruction: 'Summarize what Node.js is in one sentence.' },
    { instruction: 'Summarize what Docker is in one sentence.' },
    { instruction: 'Summarize what Kubernetes is in one sentence.' },
    { instruction: 'Summarize what Redis is in one sentence.' },
    { instruction: 'Summarize what PostgreSQL is in one sentence.' },
  ];
  
  console.log('\nExecuting 5 tasks in parallel...');
  const results = await dispatcher.submitBatch(tasks);
  
  console.log(`\nCompleted: ${results.successful}/${results.totalTasks}`);
  console.log(`Total time: ${results.totalDurationMs}ms`);
  console.log(`Avg per task: ${results.avgDurationMs}ms`);
  
  console.log('\nResults:');
  results.results.forEach((r, i) => {
    const preview = r.success 
      ? r.result.substring(0, 80).replace(/\n/g, ' ') + '...'
      : `ERROR: ${r.error}`;
    console.log(`  ${i + 1}. [${r.durationMs}ms] ${preview}`);
  });
  
  dispatcher.shutdown();
  return results;
}

async function testScaleComparison() {
  console.log('\n=== Test 4: Scale Comparison (1 vs 10 parallel) ===');
  const client = new GeminiClient();
  
  const singlePrompt = 'Name a random color. One word.';
  
  // Sequential: 10 calls one after another
  console.log('\nSequential (10 calls)...');
  const seqStart = Date.now();
  for (let i = 0; i < 10; i++) {
    await client.complete(singlePrompt);
  }
  const seqDuration = Date.now() - seqStart;
  console.log(`Sequential total: ${seqDuration}ms`);
  
  // Parallel: 10 calls at once
  console.log('\nParallel (10 calls)...');
  const parStart = Date.now();
  await client.batch(Array(10).fill(singlePrompt));
  const parDuration = Date.now() - parStart;
  console.log(`Parallel total: ${parDuration}ms`);
  
  console.log(`\nSpeedup: ${(seqDuration / parDuration).toFixed(1)}x faster with parallel`);
}

async function main() {
  console.log('🚀 Node Scaling Test Suite');
  console.log('Using Gemini Flash for cheap, parallel LLM scaling\n');
  
  try {
    await testSingleCall();
    await testParallelCalls();
    await testDispatcher();
    await testScaleComparison();
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
