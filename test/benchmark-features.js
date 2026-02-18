#!/usr/bin/env node
/**
 * Swarm Feature Benchmark Suite
 * 
 * Tests each new feature for:
 * 1. Correctness — does it work?
 * 2. Quality — does it improve output?
 * 3. Performance — does it stay within guardrails?
 * 4. Cost — what's the overhead?
 * 
 * Run: node test/benchmark-features.js [--feature <name>]
 * Features: reflection, routing, errors, all
 */

const http = require('http');
const BASE = 'http://localhost:9999';

// ─── Helpers ────────────────────────────────────────────

async function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let buf = '';
      res.on('data', (d) => buf += d);
      res.on('end', () => {
        // Parse NDJSON — return last complete event
        const lines = buf.trim().split('\n');
        const events = [];
        for (const line of lines) {
          try { events.push(JSON.parse(line)); } catch {}
        }
        resolve({ events, last: events[events.length - 1], raw: buf });
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end(data);
  });
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const GUARDRAILS = {
  singlePrompt: 1500,      // ms
  parallel10: 10000,        // ms (can include Pro-routed tasks)
  chainStandard: 20000,     // ms  
  chainWithReflect: 35000,  // ms (chain + 1-2 extra calls)
};

// ─── Test: Self-Reflection ──────────────────────────────

async function testReflection() {
  console.log('\n═══ TEST: Self-Reflection Loop ═══\n');
  
  const task = 'Analyze the pros and cons of remote work for software companies';
  const data = 'Remote work has grown 300% since 2020. Major companies like Spotify, Airbnb offer full remote. Others like Amazon, Goldman Sachs mandate return-to-office. Productivity studies show mixed results.';
  
  // 1. Chain WITHOUT reflection (baseline)
  console.log('1. Running chain WITHOUT reflection (baseline)...');
  const t1 = Date.now();
  const baseline = await post('/chain/auto', { task, data, depth: 'quick' });
  const baselineDuration = Date.now() - t1;
  const baselineOutput = baseline.last?.output || '';
  console.log(`   Duration: ${baselineDuration}ms | Output: ${baselineOutput.length} chars`);
  
  // 2. Chain WITH reflection
  console.log('2. Running chain WITH reflection...');
  const t2 = Date.now();
  const reflected = await post('/chain/auto', { task, data, depth: 'quick', reflect: true });
  const reflectDuration = Date.now() - t2;
  const reflectOutput = reflected.last?.output || '';
  const reflection = reflected.last?.reflection;
  console.log(`   Duration: ${reflectDuration}ms | Output: ${reflectOutput.length} chars`);
  
  if (reflection) {
    console.log(`   Original score: ${reflection.originalScore}/10`);
    console.log(`   Final score: ${reflection.finalScore}/10`);
    console.log(`   Refined: ${reflection.refined}`);
    console.log(`   Weakest dimension: ${reflection.critiques?.[0]?.weakest}`);
    if (reflection.critiques?.[0]?.scores) {
      const scores = reflection.critiques[0].scores;
      console.log(`   Scores: ${Object.entries(scores).map(([k,v]) => `${k}=${v}`).join(', ')}`);
    }
  } else {
    console.log('   ⚠️ No reflection data in response');
  }
  
  // 3. Performance check
  const overhead = reflectDuration - baselineDuration;
  const overheadPct = Math.round((overhead / baselineDuration) * 100);
  console.log(`\n   📊 Overhead: +${overhead}ms (+${overheadPct}%)`);
  
  // Assertions
  assert(baselineOutput.length > 50, 'Baseline output too short');
  assert(reflectOutput.length > 50, 'Reflected output too short');
  assert(reflectDuration < GUARDRAILS.chainWithReflect, `Reflection too slow: ${reflectDuration}ms > ${GUARDRAILS.chainWithReflect}ms`);
  
  // 4. Quality comparison — run critic on both outputs
  console.log('\n3. Scoring both outputs with critic...');
  const { criticize } = require('../lib/reflect');
  
  // Use a simple HTTP call for the critic since we don't have direct dispatcher access
  const criticBaseline = await post('/parallel', {
    prompts: [`You are a quality critic. Score this text on accuracy, completeness, coherence, actionability, conciseness (each 1-10). Return ONLY JSON: {"scores": {...}, "avgScore": N}

Text about "${task}":
${typeof baselineOutput === 'string' ? baselineOutput.substring(0, 2000) : JSON.stringify(baselineOutput).substring(0, 2000)}`],
  });
  
  const criticReflected = await post('/parallel', {
    prompts: [`You are a quality critic. Score this text on accuracy, completeness, coherence, actionability, conciseness (each 1-10). Return ONLY JSON: {"scores": {...}, "avgScore": N}

Text about "${task}":
${typeof reflectOutput === 'string' ? reflectOutput.substring(0, 2000) : JSON.stringify(reflectOutput).substring(0, 2000)}`],
  });
  
  let baseScore, reflectScore;
  try {
    const bRaw = criticBaseline.last?.results?.[0] || '';
    const rRaw = criticReflected.last?.results?.[0] || '';
    baseScore = JSON.parse(bRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    reflectScore = JSON.parse(rRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch (e) {
    console.log('   ⚠️ Could not parse critic scores (non-JSON response)');
  }
  
  if (baseScore && reflectScore) {
    console.log(`   Baseline avg: ${baseScore.avgScore}/10`);
    console.log(`   Reflected avg: ${reflectScore.avgScore}/10`);
    const qualityDelta = (reflectScore.avgScore - baseScore.avgScore).toFixed(1);
    console.log(`   Quality delta: ${qualityDelta > 0 ? '+' : ''}${qualityDelta}`);
  }
  
  return {
    feature: 'reflection',
    passed: true,
    baselineDuration,
    reflectDuration,
    overhead,
    overheadPct,
    reflection,
  };
}

// ─── Test: Smart Routing ────────────────────────────────

async function testRouting() {
  console.log('\n═══ TEST: Smart Routing ═══\n');
  
  // 1. Simple prompt (should route to Flash)
  console.log('1. Simple prompt (expect Flash)...');
  const t1 = Date.now();
  const simple = await post('/parallel', { prompts: ['What is 2+2?'] });
  const simpleDuration = Date.now() - t1;
  console.log(`   Duration: ${simpleDuration}ms`);
  assert(simpleDuration < GUARDRAILS.singlePrompt, `Simple prompt too slow: ${simpleDuration}ms`);
  
  // 2. Complex prompt (should route to Pro if enabled)
  console.log('2. Complex analysis prompt (may route to Pro)...');
  const t2 = Date.now();
  const complex = await post('/parallel', {
    prompts: ['Synthesize these competing analyses, resolve the contradictions, and recommend a strategic direction considering both market dynamics and organizational capabilities: ' + 'A'.repeat(1000)],
  });
  const complexDuration = Date.now() - t2;
  console.log(`   Duration: ${complexDuration}ms`);
  
  // 3. Batch — mix of simple and complex
  console.log('3. Mixed batch (10 prompts)...');
  const prompts = [
    'What color is the sky?',
    'Capital of Japan?',
    'What is 10 * 15?',
    'Summarize the key trends in AI from 2020-2025 and their implications for enterprise software',
    'Compare and contrast microservices vs monolithic architecture considering scalability, team structure, and operational complexity',
    'What year was Python created?',
    'Hello world',
    'Analyze the competitive dynamics of the cloud infrastructure market and predict which strategies will succeed',
    'List 3 colors',
    'Evaluate the tradeoffs between SQL and NoSQL databases for a real-time analytics pipeline handling 1M events/second',
  ];
  const t3 = Date.now();
  const batch = await post('/parallel', { prompts });
  const batchDuration = Date.now() - t3;
  const batchStats = batch.last?.stats;
  console.log(`   Duration: ${batchDuration}ms (${Math.round(batchDuration / 10)}ms/task effective)`);
  console.log(`   Success: ${batchStats?.successful}/${prompts.length}`);
  assert(batchDuration < GUARDRAILS.parallel10, `Batch too slow: ${batchDuration}ms`);
  assert(batchStats?.successful === prompts.length, `Some tasks failed: ${batchStats?.failed} failed`);
  
  // Check status for routing stats
  const status = await new Promise((resolve) => {
    http.get(`${BASE}/status`, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(JSON.parse(buf)));
    });
  });
  console.log(`\n   📊 Routing stats: ${JSON.stringify(status.workers?.routedToPro || 'N/A')} tasks routed to Pro`);
  
  return {
    feature: 'routing',
    passed: true,
    simpleDuration,
    complexDuration,
    batchDuration,
    perTaskMs: Math.round(batchDuration / 10),
  };
}

// ─── Test: Error Diagnostics ────────────────────────────

async function testErrors() {
  console.log('\n═══ TEST: Error Diagnostics ═══\n');
  
  const { diagnoseError, formatErrorCLI } = require('../lib/errors');
  
  const testCases = [
    { error: new Error('Rate limited - backing off for 10000ms'), expectedCategory: 'rate_limit' },
    { error: new Error('Gemini API error: 401 - Unauthorized'), expectedCategory: 'auth' },
    { error: new Error('Task timed out after 30000ms'), expectedCategory: 'timeout' },
    { error: new Error('fetch failed: ECONNREFUSED'), expectedCategory: 'network' },
    { error: new Error('I cannot help with that request'), expectedCategory: 'safety' },
    { error: new Error('Quality check failed: degenerate repetition'), expectedCategory: 'quality' },
    { error: new Error('Unexpected token < in JSON'), expectedCategory: 'parse' },
    { error: new Error('Something unknown'), expectedCategory: 'unknown' },
  ];
  
  let passed = 0;
  for (const tc of testCases) {
    const diag = diagnoseError(tc.error);
    const match = diag.category === tc.expectedCategory;
    const icon = match ? '✅' : '❌';
    console.log(`${icon} "${tc.error.message.substring(0, 40)}..." → ${diag.category} (expected: ${tc.expectedCategory})`);
    if (match) passed++;
    
    assert(diag.suggestion, `Missing suggestion for ${tc.expectedCategory}`);
    assert(typeof diag.retryable === 'boolean', `Missing retryable for ${tc.expectedCategory}`);
    assert(diag.severity, `Missing severity for ${tc.expectedCategory}`);
  }
  
  console.log(`\n   📊 ${passed}/${testCases.length} categories matched correctly`);
  assert(passed === testCases.length, `${testCases.length - passed} error categories mismatched`);
  
  return { feature: 'errors', passed: true, categoriesCorrect: passed, total: testCases.length };
}

// ─── Test: Performance Guardrails ───────────────────────

async function testPerformanceGuardrails() {
  console.log('\n═══ TEST: Performance Guardrails ═══\n');
  
  // Single prompt
  const t1 = Date.now();
  await post('/parallel', { prompts: ['Capital of France?'] });
  const single = Date.now() - t1;
  const singleOk = single < GUARDRAILS.singlePrompt;
  console.log(`${singleOk ? '✅' : '❌'} Single prompt: ${single}ms (limit: ${GUARDRAILS.singlePrompt}ms)`);
  
  // 10 parallel
  const t2 = Date.now();
  await post('/parallel', { prompts: Array(10).fill('What is 1+1?') });
  const par10 = Date.now() - t2;
  const par10Ok = par10 < GUARDRAILS.parallel10;
  console.log(`${par10Ok ? '✅' : '❌'} 10 parallel: ${par10}ms (limit: ${GUARDRAILS.parallel10}ms)`);
  
  // Chain standard
  const t3 = Date.now();
  await post('/chain/auto', { task: 'Analyze this market', data: 'SaaS for plumbers. $50/mo. 500K market.', depth: 'standard' });
  const chain = Date.now() - t3;
  const chainOk = chain < GUARDRAILS.chainStandard;
  console.log(`${chainOk ? '✅' : '❌'} Chain standard: ${chain}ms (limit: ${GUARDRAILS.chainStandard}ms)`);
  
  // Chain with reflection
  const t4 = Date.now();
  await post('/chain/auto', { task: 'Analyze this market', data: 'SaaS for plumbers. $50/mo. 500K market.', depth: 'quick', reflect: true });
  const chainReflect = Date.now() - t4;
  const chainReflectOk = chainReflect < GUARDRAILS.chainWithReflect;
  console.log(`${chainReflectOk ? '✅' : '❌'} Chain + reflect: ${chainReflect}ms (limit: ${GUARDRAILS.chainWithReflect}ms)`);
  
  const allOk = singleOk && par10Ok && chainOk && chainReflectOk;
  console.log(`\n   📊 ${allOk ? 'ALL GUARDRAILS PASSED' : '⚠️ SOME GUARDRAILS FAILED'}`);
  
  return {
    feature: 'guardrails',
    passed: allOk,
    single, par10, chain, chainReflect,
  };
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const feature = process.argv.find(a => a !== '--feature' && process.argv[process.argv.indexOf(a) - 1] === '--feature') || 'all';
  
  console.log('═══════════════════════════════════════════');
  console.log('🐝 SWARM FEATURE BENCHMARK SUITE');
  console.log('═══════════════════════════════════════════');
  console.log(`Feature: ${feature}`);
  
  const results = [];
  
  try {
    if (feature === 'all' || feature === 'errors') results.push(await testErrors());
    if (feature === 'all' || feature === 'routing') results.push(await testRouting());
    if (feature === 'all' || feature === 'reflection') results.push(await testReflection());
    if (feature === 'all' || feature === 'guardrails') results.push(await testPerformanceGuardrails());
  } catch (e) {
    console.error(`\n💀 TEST FAILED: ${e.message}`);
    process.exit(1);
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════');
  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.feature}`);
  }
  
  const allPassed = results.every(r => r.passed);
  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED' : '💀 SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}

main();
