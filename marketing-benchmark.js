#!/usr/bin/env node
/**
 * Swarm Marketing Benchmark
 * Real-world tasks users actually perform
 */

const { research, parallel } = require('./lib');

const REAL_WORLD_TASKS = [
  {
    name: "AI Tools Comparison",
    description: "Compare top AI assistants",
    subjects: ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Perplexity'],
    topic: 'features pricing and capabilities 2024',
    emoji: '🤖',
  },
  {
    name: "Tech Job Market",
    description: "Research tech companies hiring",
    subjects: ['Google', 'Meta', 'Apple', 'Microsoft', 'Amazon', 'Netflix'],
    topic: 'software engineer jobs salary and culture 2024',
    emoji: '💼',
  },
  {
    name: "Cloud Providers",
    description: "Compare cloud platforms",
    subjects: ['AWS', 'Azure', 'Google Cloud', 'Vercel', 'Cloudflare'],
    topic: 'pricing features and developer experience',
    emoji: '☁️',
  },
  {
    name: "Programming Languages",
    description: "Compare programming languages",
    subjects: ['Python', 'JavaScript', 'Rust', 'Go', 'TypeScript'],
    topic: 'popularity use cases and job demand 2024',
    emoji: '💻',
  },
  {
    name: "Investment Research",
    description: "Research tech stocks",
    subjects: ['NVIDIA', 'AMD', 'TSMC', 'Intel', 'Qualcomm'],
    topic: 'AI chip market position and growth 2024',
    emoji: '📈',
  },
  {
    name: "Startup Analysis",
    description: "Research AI startups",
    subjects: ['OpenAI', 'Anthropic', 'Mistral', 'Cohere', 'Stability AI', 'Hugging Face'],
    topic: 'funding products and market position',
    emoji: '🚀',
  },
];

async function runSequential(task) {
  const { GeminiClient } = require('./lib/gemini-client');
  const { webSearch, webFetch } = require('./lib/tools');
  const client = new GeminiClient();
  
  const results = [];
  for (const subject of task.subjects) {
    // Search
    const search = await webSearch(`${subject} ${task.topic}`, { count: 2 });
    
    // Fetch
    let content = '';
    if (search.success && search.results[0]) {
      const fetch = await webFetch(search.results[0].url, { maxChars: 5000 });
      content = fetch.success ? fetch.content : '';
    }
    
    // Analyze
    await client.complete(`Summarize ${subject} regarding ${task.topic}. Context: ${content.substring(0, 3000)}`);
    results.push(subject);
  }
  return results;
}

async function runBenchmark() {
  console.log('');
  console.log('🐝 SWARM MARKETING BENCHMARK');
  console.log('━'.repeat(60));
  console.log('Testing real-world research tasks users actually perform');
  console.log('');
  
  const results = [];
  
  for (const task of REAL_WORLD_TASKS) {
    console.log(`${task.emoji} ${task.name}`);
    console.log(`   "${task.description}" (${task.subjects.length} subjects)`);
    
    // Run with Swarm (parallel)
    const swarmStart = Date.now();
    try {
      await research(task.subjects, task.topic);
    } catch (e) {
      console.log(`   ⚠️ Swarm error: ${e.message}`);
    }
    const swarmTime = Date.now() - swarmStart;
    
    // Estimate sequential time (we'll do 1 subject and multiply)
    const sampleStart = Date.now();
    const { GeminiClient } = require('./lib/gemini-client');
    const { webSearch, webFetch } = require('./lib/tools');
    const client = new GeminiClient();
    
    const search = await webSearch(`${task.subjects[0]} ${task.topic}`, { count: 2 });
    let content = '';
    if (search.success && search.results[0]) {
      const fetch = await webFetch(search.results[0].url, { maxChars: 5000 });
      content = fetch.success ? fetch.content : '';
    }
    await client.complete(`Summarize ${task.subjects[0]}. Context: ${content.substring(0, 2000)}`);
    const sampleTime = Date.now() - sampleStart;
    const estimatedSeqTime = sampleTime * task.subjects.length;
    
    const speedup = estimatedSeqTime / swarmTime;
    
    console.log(`   ⏱️  Swarm: ${(swarmTime/1000).toFixed(1)}s | Sequential: ~${(estimatedSeqTime/1000).toFixed(1)}s | Speedup: ${speedup.toFixed(1)}x`);
    console.log('');
    
    results.push({
      name: task.name,
      emoji: task.emoji,
      subjects: task.subjects.length,
      swarmTime,
      estimatedSeqTime,
      speedup: parseFloat(speedup.toFixed(2)),
    });
    
    // Brief pause between tasks
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Summary
  console.log('━'.repeat(60));
  console.log('📊 BENCHMARK SUMMARY');
  console.log('━'.repeat(60));
  console.log('');
  
  console.log('| Task | Subjects | Sequential | Swarm | Speedup |');
  console.log('|------|----------|------------|-------|---------|');
  
  results.forEach(r => {
    const seq = `~${(r.estimatedSeqTime/1000).toFixed(0)}s`;
    const swarm = `${(r.swarmTime/1000).toFixed(1)}s`;
    console.log(`| ${r.emoji} ${r.name.substring(0,20).padEnd(20)} | ${r.subjects} | ${seq.padStart(10)} | ${swarm.padStart(5)} | **${r.speedup}x** |`);
  });
  
  const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
  const totalSwarm = results.reduce((sum, r) => sum + r.swarmTime, 0);
  const totalSeq = results.reduce((sum, r) => sum + r.estimatedSeqTime, 0);
  
  console.log('');
  console.log(`🏆 Average Speedup: ${avgSpeedup.toFixed(1)}x`);
  console.log(`⏱️  Total Swarm Time: ${(totalSwarm/1000).toFixed(0)}s`);
  console.log(`⏱️  Total Sequential: ~${(totalSeq/1000).toFixed(0)}s`);
  console.log(`💰 Time Saved: ${((totalSeq - totalSwarm)/1000/60).toFixed(1)} minutes`);
  console.log('');
  
  return results;
}

runBenchmark()
  .then(results => {
    // Save results
    const fs = require('fs');
    fs.writeFileSync(
      __dirname + '/marketing-benchmark-results.json',
      JSON.stringify({ 
        date: new Date().toISOString(),
        results,
        summary: {
          avgSpeedup: (results.reduce((s,r) => s + r.speedup, 0) / results.length).toFixed(1),
          totalTasks: results.length,
          totalSubjects: results.reduce((s,r) => s + r.subjects, 0),
        }
      }, null, 2)
    );
    console.log('📁 Results saved to marketing-benchmark-results.json');
  })
  .catch(console.error);
