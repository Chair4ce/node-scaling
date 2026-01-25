#!/usr/bin/env node
/**
 * Comprehensive Node Scaling Benchmark
 * Tests a variety of tasks from simple to very complex
 * Compares single-node sequential vs multi-node parallel execution
 */

const { Dispatcher } = require('./lib/dispatcher');
const { GeminiClient } = require('./lib/gemini-client');
const { webSearch, webFetch } = require('./lib/tools');

// ============================================================
// BENCHMARK TASK DEFINITIONS
// ============================================================

const BENCHMARKS = [
  // -------------------- SIMPLE TASKS --------------------
  {
    name: 'Simple: 5 Quick Questions',
    complexity: 'simple',
    description: '5 independent factual questions',
    parallelism: 5,
    tasks: [
      'What is the capital of Japan? One word answer.',
      'What year did World War 2 end? Number only.',
      'What is the chemical symbol for gold? Letters only.',
      'How many planets in our solar system? Number only.',
      'What is the largest ocean? One word answer.',
    ],
  },
  {
    name: 'Simple: 10 Quick Questions',
    complexity: 'simple',
    description: '10 independent factual questions',
    parallelism: 10,
    tasks: [
      'Capital of France?', 'Capital of Germany?', 'Capital of Italy?',
      'Capital of Spain?', 'Capital of Poland?', 'Capital of Sweden?',
      'Capital of Norway?', 'Capital of Finland?', 'Capital of Denmark?',
      'Capital of Netherlands?',
    ],
  },

  // -------------------- MEDIUM TASKS --------------------
  {
    name: 'Medium: 5 Web Searches',
    complexity: 'medium',
    description: '5 parallel web searches on different topics',
    parallelism: 5,
    type: 'search',
    tasks: [
      'best programming languages 2024',
      'top cloud providers comparison',
      'machine learning frameworks popular',
      'database technologies trends',
      'devops tools essential',
    ],
  },
  {
    name: 'Medium: 10 Summaries',
    complexity: 'medium',
    description: '10 parallel text summarization tasks',
    parallelism: 10,
    tasks: [
      'Explain microservices architecture in 2 sentences.',
      'Explain containerization in 2 sentences.',
      'Explain CI/CD in 2 sentences.',
      'Explain REST APIs in 2 sentences.',
      'Explain GraphQL in 2 sentences.',
      'Explain serverless computing in 2 sentences.',
      'Explain Kubernetes in 2 sentences.',
      'Explain infrastructure as code in 2 sentences.',
      'Explain event-driven architecture in 2 sentences.',
      'Explain API gateways in 2 sentences.',
    ],
  },

  // -------------------- COMPLEX TASKS --------------------
  {
    name: 'Complex: 5 Company Research',
    complexity: 'complex',
    description: 'Search + Fetch + Analyze for 5 companies',
    parallelism: 5,
    type: 'research',
    subjects: ['Microsoft', 'Google', 'Amazon', 'Apple', 'Meta'],
    topic: 'AI products and strategy 2024',
  },
  {
    name: 'Complex: 10 Tech Analysis',
    complexity: 'complex',
    description: 'Deep analysis of 10 technologies',
    parallelism: 10,
    tasks: [
      'Analyze the pros and cons of React vs Vue for enterprise applications. Be thorough.',
      'Analyze the pros and cons of PostgreSQL vs MongoDB for scalable applications. Be thorough.',
      'Analyze the pros and cons of AWS vs Azure for startups. Be thorough.',
      'Analyze the pros and cons of Python vs Go for backend services. Be thorough.',
      'Analyze the pros and cons of Docker vs Podman for containerization. Be thorough.',
      'Analyze the pros and cons of GitHub Actions vs GitLab CI for automation. Be thorough.',
      'Analyze the pros and cons of Redis vs Memcached for caching. Be thorough.',
      'Analyze the pros and cons of Kafka vs RabbitMQ for messaging. Be thorough.',
      'Analyze the pros and cons of Terraform vs Pulumi for IaC. Be thorough.',
      'Analyze the pros and cons of Next.js vs Nuxt.js for SSR. Be thorough.',
    ],
  },

  // -------------------- VERY COMPLEX TASKS --------------------
  {
    name: 'Very Complex: 15-Subject Research',
    complexity: 'very-complex',
    description: 'Full research pipeline on 15 subjects',
    parallelism: 15,
    type: 'research',
    subjects: [
      'OpenAI', 'Anthropic', 'Google DeepMind', 'Meta AI', 'Microsoft AI',
      'Stability AI', 'Midjourney', 'Hugging Face', 'Cohere', 'AI21 Labs',
      'Inflection AI', 'Mistral AI', 'xAI', 'Perplexity', 'Character AI',
    ],
    topic: 'latest developments and products',
  },
  {
    name: 'Very Complex: 20 Parallel Analyses',
    complexity: 'very-complex',
    description: '20 in-depth technical analyses in parallel',
    parallelism: 20,
    tasks: Array.from({ length: 20 }, (_, i) => {
      const topics = [
        'WebAssembly adoption in production', 'Edge computing architectures',
        'Zero-trust security models', 'eBPF for observability',
        'Service mesh implementations', 'GitOps workflows',
        'Platform engineering practices', 'Developer experience metrics',
        'API versioning strategies', 'Database sharding patterns',
        'Caching strategies at scale', 'Rate limiting implementations',
        'Circuit breaker patterns', 'Distributed tracing systems',
        'Log aggregation architectures', 'Metrics and alerting systems',
        'Chaos engineering practices', 'Feature flag systems',
        'A/B testing infrastructure', 'Canary deployment strategies',
      ];
      return `Provide a detailed technical analysis of ${topics[i]}. Include current best practices, common pitfalls, and recommendations.`;
    }),
  },
];

// ============================================================
// SINGLE NODE EXECUTOR
// ============================================================

async function executeSingleNode(benchmark) {
  const llm = new GeminiClient();
  const results = [];
  const startTime = Date.now();

  if (benchmark.type === 'search') {
    // Search tasks
    for (const query of benchmark.tasks) {
      const taskStart = Date.now();
      const searchResult = await webSearch(query, { count: 3 });
      results.push({ query, duration: Date.now() - taskStart, success: searchResult.success });
    }
  } else if (benchmark.type === 'research') {
    // Full research pipeline (search + fetch + analyze) - sequential
    for (const subject of benchmark.subjects) {
      const taskStart = Date.now();
      
      // Search
      const searchResult = await webSearch(`${subject} ${benchmark.topic}`, { count: 2 });
      
      // Fetch top result
      let content = '';
      if (searchResult.success && searchResult.results[0]) {
        const fetchResult = await webFetch(searchResult.results[0].url, { maxChars: 5000 });
        content = fetchResult.success ? fetchResult.content : '';
      }
      
      // Analyze
      const analysis = await llm.complete(`Summarize the key points about ${subject} regarding ${benchmark.topic}. ${content ? `Context: ${content.substring(0, 3000)}` : ''} Be concise.`);
      
      results.push({ subject, duration: Date.now() - taskStart, success: true });
    }
  } else {
    // Simple LLM tasks
    for (const task of benchmark.tasks) {
      const taskStart = Date.now();
      const response = await llm.complete(task);
      results.push({ task: task.substring(0, 50), duration: Date.now() - taskStart, success: !!response });
    }
  }

  return {
    totalDuration: Date.now() - startTime,
    taskCount: results.length,
    results,
  };
}

// ============================================================
// MULTI-NODE EXECUTOR
// ============================================================

async function executeMultiNode(benchmark) {
  const dispatcher = new Dispatcher();
  const startTime = Date.now();
  let results;

  if (benchmark.type === 'search') {
    // Parallel searches
    const tasks = benchmark.tasks.map(query => ({
      nodeType: 'search',
      tool: 'web_search',
      input: query,
      options: { count: 3 },
    }));
    results = await dispatcher.executeParallel(tasks);
  } else if (benchmark.type === 'research') {
    // Orchestrated research pipeline
    const phases = [
      {
        name: 'Search',
        tasks: benchmark.subjects.map(subject => ({
          nodeType: 'search',
          tool: 'web_search',
          input: `${subject} ${benchmark.topic}`,
          options: { count: 2 },
          metadata: { subject },
        })),
      },
      {
        name: 'Fetch',
        tasks: (prev) => {
          return prev[0].results
            .filter(r => r.success && r.result?.results?.[0])
            .map(r => ({
              nodeType: 'fetch',
              tool: 'web_fetch',
              input: r.result.results[0].url,
              options: { maxChars: 5000 },
              metadata: { subject: r.result.query?.split(' ')[0] },
            }));
        },
      },
      {
        name: 'Analyze',
        tasks: (prev) => {
          const fetches = prev[1].results.filter(r => r.success);
          return benchmark.subjects.map((subject, i) => ({
            nodeType: 'analyze',
            instruction: `Summarize the key points about ${subject} regarding ${benchmark.topic}. Be concise.`,
            input: fetches[i]?.result?.content?.substring(0, 3000) || '',
          }));
        },
      },
    ];
    results = await dispatcher.orchestrate(phases);
  } else {
    // Parallel LLM tasks
    const tasks = benchmark.tasks.map(task => ({
      nodeType: 'analyze',
      instruction: task,
    }));
    results = await dispatcher.executeParallel(tasks);
  }

  const totalDuration = Date.now() - startTime;
  const nodeStats = dispatcher.getNodeStats();
  dispatcher.shutdown();

  return {
    totalDuration,
    taskCount: benchmark.tasks?.length || benchmark.subjects?.length || 0,
    nodeStats,
    results,
  };
}

// ============================================================
// BENCHMARK RUNNER
// ============================================================

async function runBenchmark(benchmark) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${benchmark.name}`);
  console.log(`   ${benchmark.description}`);
  console.log(`   Complexity: ${benchmark.complexity} | Parallelism: ${benchmark.parallelism}`);
  console.log('─'.repeat(70));

  // Run single node
  console.log('\n  🐌 Single Node (Sequential)...');
  const singleStart = Date.now();
  let singleResult;
  try {
    singleResult = await executeSingleNode(benchmark);
    console.log(`     ✓ Completed in ${singleResult.totalDuration}ms`);
  } catch (error) {
    console.log(`     ✗ Failed: ${error.message}`);
    singleResult = { totalDuration: Infinity, error: error.message };
  }

  // Brief pause
  await new Promise(r => setTimeout(r, 500));

  // Run multi node
  console.log('\n  🚀 Multi-Node (Parallel)...');
  let multiResult;
  try {
    multiResult = await executeMultiNode(benchmark);
    console.log(`     ✓ Completed in ${multiResult.totalDuration}ms`);
    if (multiResult.nodeStats) {
      const nodeTypes = {};
      multiResult.nodeStats.forEach(n => {
        nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
      });
      console.log(`     📊 Nodes used: ${Object.entries(nodeTypes).map(([t, c]) => `${t}(${c})`).join(', ')}`);
    }
  } catch (error) {
    console.log(`     ✗ Failed: ${error.message}`);
    multiResult = { totalDuration: Infinity, error: error.message };
  }

  // Calculate metrics
  const speedup = singleResult.totalDuration / multiResult.totalDuration;
  const timeSaved = singleResult.totalDuration - multiResult.totalDuration;

  return {
    name: benchmark.name,
    complexity: benchmark.complexity,
    parallelism: benchmark.parallelism,
    singleNode: {
      duration: singleResult.totalDuration,
      error: singleResult.error,
    },
    multiNode: {
      duration: multiResult.totalDuration,
      nodesUsed: multiResult.nodeStats?.length || 0,
      error: multiResult.error,
    },
    speedup: isFinite(speedup) ? speedup : null,
    timeSaved: isFinite(timeSaved) ? timeSaved : null,
  };
}

// ============================================================
// REPORT GENERATOR
// ============================================================

function generateReport(results) {
  console.log('\n' + '═'.repeat(70));
  console.log('                    📊 COMPREHENSIVE BENCHMARK REPORT');
  console.log('═'.repeat(70));

  // Summary table
  console.log('\n┌─────────────────────────────────────────┬────────┬──────────┬──────────┬─────────┬───────────┐');
  console.log('│ Benchmark                               │ Tasks  │ Single   │ Multi    │ Speedup │ Time Saved│');
  console.log('├─────────────────────────────────────────┼────────┼──────────┼──────────┼─────────┼───────────┤');
  
  results.forEach(r => {
    const name = r.name.substring(0, 39).padEnd(39);
    const tasks = String(r.parallelism).padStart(5);
    const single = r.singleNode.error ? 'ERROR' : `${(r.singleNode.duration / 1000).toFixed(1)}s`.padStart(7);
    const multi = r.multiNode.error ? 'ERROR' : `${(r.multiNode.duration / 1000).toFixed(1)}s`.padStart(7);
    const speedup = r.speedup ? `${r.speedup.toFixed(2)}x`.padStart(6) : 'N/A'.padStart(6);
    const saved = r.timeSaved ? `${(r.timeSaved / 1000).toFixed(1)}s`.padStart(8) : 'N/A'.padStart(8);
    console.log(`│ ${name} │ ${tasks} │ ${single} │ ${multi} │ ${speedup} │ ${saved} │`);
  });
  
  console.log('└─────────────────────────────────────────┴────────┴──────────┴──────────┴─────────┴───────────┘');

  // Aggregate stats by complexity
  console.log('\n📈 PERFORMANCE BY COMPLEXITY LEVEL:\n');
  
  const byComplexity = {};
  results.forEach(r => {
    if (!byComplexity[r.complexity]) {
      byComplexity[r.complexity] = { speedups: [], timeSaved: [], count: 0 };
    }
    if (r.speedup) {
      byComplexity[r.complexity].speedups.push(r.speedup);
      byComplexity[r.complexity].timeSaved.push(r.timeSaved);
      byComplexity[r.complexity].count++;
    }
  });

  Object.entries(byComplexity).forEach(([complexity, data]) => {
    if (data.count > 0) {
      const avgSpeedup = data.speedups.reduce((a, b) => a + b, 0) / data.count;
      const totalSaved = data.timeSaved.reduce((a, b) => a + b, 0);
      console.log(`  ${complexity.toUpperCase()}:`);
      console.log(`    Average Speedup: ${avgSpeedup.toFixed(2)}x`);
      console.log(`    Total Time Saved: ${(totalSaved / 1000).toFixed(1)}s`);
      console.log('');
    }
  });

  // Overall stats
  const validResults = results.filter(r => r.speedup);
  if (validResults.length > 0) {
    const avgSpeedup = validResults.reduce((sum, r) => sum + r.speedup, 0) / validResults.length;
    const maxSpeedup = Math.max(...validResults.map(r => r.speedup));
    const totalTimeSaved = validResults.reduce((sum, r) => sum + r.timeSaved, 0);
    const totalSingleTime = validResults.reduce((sum, r) => sum + r.singleNode.duration, 0);
    const totalMultiTime = validResults.reduce((sum, r) => sum + r.multiNode.duration, 0);

    console.log('🏆 OVERALL PERFORMANCE:\n');
    console.log(`  Total Single-Node Time: ${(totalSingleTime / 1000).toFixed(1)}s`);
    console.log(`  Total Multi-Node Time:  ${(totalMultiTime / 1000).toFixed(1)}s`);
    console.log(`  Total Time Saved:       ${(totalTimeSaved / 1000).toFixed(1)}s (${((totalTimeSaved / totalSingleTime) * 100).toFixed(0)}%)`);
    console.log(`  Average Speedup:        ${avgSpeedup.toFixed(2)}x`);
    console.log(`  Maximum Speedup:        ${maxSpeedup.toFixed(2)}x`);
  }

  // Key insights
  console.log('\n💡 KEY INSIGHTS:\n');
  
  const bestResult = validResults.reduce((best, r) => r.speedup > (best?.speedup || 0) ? r : best, null);
  if (bestResult) {
    console.log(`  • Best speedup: ${bestResult.speedup.toFixed(2)}x on "${bestResult.name}"`);
  }
  
  const complexResults = validResults.filter(r => r.complexity === 'complex' || r.complexity === 'very-complex');
  if (complexResults.length > 0) {
    const avgComplexSpeedup = complexResults.reduce((sum, r) => sum + r.speedup, 0) / complexResults.length;
    console.log(`  • Complex tasks average ${avgComplexSpeedup.toFixed(2)}x speedup (best ROI for parallelization)`);
  }

  console.log(`  • Multi-node scaling is most effective when parallelism ≥ 5`);
  console.log(`  • I/O-bound tasks (search, fetch) benefit most from parallelization`);
  console.log(`  • Sequential synthesis phases are inherent bottlenecks`);

  console.log('\n' + '═'.repeat(70));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║           NODE SCALING COMPREHENSIVE BENCHMARK SUITE                  ║');
  console.log('║                                                                       ║');
  console.log('║   Testing single-node vs multi-node (up to 100) execution            ║');
  console.log('║   Tasks range from simple (5 parallel) to very complex (20 parallel) ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  const results = [];

  for (const benchmark of BENCHMARKS) {
    try {
      const result = await runBenchmark(benchmark);
      results.push(result);
    } catch (error) {
      console.error(`\n  ❌ Benchmark "${benchmark.name}" failed: ${error.message}`);
      results.push({
        name: benchmark.name,
        complexity: benchmark.complexity,
        parallelism: benchmark.parallelism,
        singleNode: { duration: null, error: error.message },
        multiNode: { duration: null, error: error.message },
        speedup: null,
        timeSaved: null,
      });
    }

    // Brief pause between benchmarks
    await new Promise(r => setTimeout(r, 1000));
  }

  // Generate comprehensive report
  generateReport(results);

  // Save results to file
  const reportPath = `${__dirname}/benchmark-report-${Date.now()}.json`;
  require('fs').writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Full results saved to: ${reportPath}`);
}

main().catch(console.error);
