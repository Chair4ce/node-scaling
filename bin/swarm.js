#!/usr/bin/env node
/**
 * Swarm CLI Client
 * Quick way to execute Swarm tasks from command line
 * 
 * Usage:
 *   swarm research "OpenAI" "Anthropic" "Google" --topic "AI products"
 *   swarm parallel "prompt1" "prompt2" "prompt3"
 *   swarm status
 */

const { SwarmClient } = require('../lib/client');

const client = new SwarmClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    console.log('🐝 Swarm CLI');
    console.log('');
    console.log('Usage:');
    console.log('  swarm status');
    console.log('  swarm research <subject1> <subject2> ... --topic "topic" [--context]');
    console.log('  swarm parallel <prompt1> <prompt2> ... [--context]');
    console.log('');
    console.log('Options:');
    console.log('  --context    Pre-fetch BrainDB memories and inject into worker prompts');
    console.log('               (Memory Multiplexer: one recall, fanned out to N workers)');
    console.log('');
    console.log('Examples:');
    console.log('  swarm research OpenAI Anthropic Google --topic "AI products 2024"');
    console.log('  swarm parallel "What is 2+2?" "What is 3+3?"');
    console.log('  swarm parallel --context "Analyze JobNimbus" "Analyze Buildertrend"');
    console.log('');
    console.log('Make sure daemon is running: swarm-daemon start');
    return;
  }

  // Check daemon
  const ready = await client.isReady();
  if (!ready && command !== 'status') {
    console.error('❌ Swarm Daemon is not running');
    console.error('   Start it with: swarm-daemon start');
    process.exit(1);
  }

  switch (command) {
    case 'status': {
      if (!ready) {
        console.log('❌ Swarm Daemon is not running');
        console.log('   Start with: swarm-daemon start');
      } else {
        const status = await client.status();
        console.log('🐝 Swarm Status');
        console.log('─'.repeat(40));
        console.log(`   Workers:   ${status.workers?.totalNodes || 0}`);
        console.log(`   Requests:  ${status.requests}`);
        console.log(`   Tasks:     ${status.totalTasks}`);
        console.log(`   Avg time:  ${status.avgResponseMs}ms`);
        console.log(`   Uptime:    ${Math.round(status.uptime / 1000)}s`);
      }
      break;
    }

    case 'research': {
      // Parse: swarm research subj1 subj2 subj3 --topic "topic" [--context]
      const useContextR = args.includes('--context');
      const filteredArgsR = args.filter(a => a !== '--context');
      const topicIdx = filteredArgsR.indexOf('--topic');
      let subjects, topic;
      
      if (topicIdx !== -1) {
        subjects = filteredArgsR.slice(1, topicIdx);
        topic = filteredArgsR.slice(topicIdx + 1).join(' ');
      } else {
        subjects = filteredArgsR.slice(1);
        topic = 'latest news and information';
      }

      if (subjects.length === 0) {
        console.error('Usage: swarm research <subject1> <subject2> ... --topic "topic"');
        process.exit(1);
      }

      console.log(`🐝 Researching ${subjects.length} subjects: ${subjects.join(', ')}`);
      console.log(`   Topic: ${topic}`);
      if (useContextR) console.log(`   🧠 BrainDB context: enabled`);
      console.log('');

      const startTime = Date.now();
      
      for await (const event of client.research(subjects, topic, { context: useContextR })) {
        switch (event.event) {
          case 'context':
            console.log(`🧠 ${event.message}`);
            break;
          case 'start':
            console.log(`⚡ ${event.message}`);
            break;
          case 'phase':
            console.log(`   Phase: ${event.name} (${event.taskCount} tasks)`);
            break;
          case 'task':
            // Progress indicator
            process.stdout.write('.');
            break;
          case 'complete':
            console.log('\n');
            console.log(`✓ Complete in ${event.duration}ms`);
            console.log('');
            for (const analysis of event.analyses) {
              console.log(`=== ${analysis.subject} ===`);
              console.log(analysis.analysis?.substring(0, 500) + '...');
              console.log('');
            }
            break;
          case 'error':
            console.error(`❌ Error: ${event.error}`);
            break;
        }
      }
      break;
    }

    case 'parallel': {
      const useContextP = args.includes('--context');
      const prompts = args.slice(1).filter(a => a !== '--context');
      
      if (prompts.length === 0) {
        console.error('Usage: swarm parallel <prompt1> <prompt2> ... [--context]');
        process.exit(1);
      }

      console.log(`🐝 Executing ${prompts.length} prompts in parallel`);
      if (useContextP) console.log(`   🧠 BrainDB context: enabled`);

      for await (const event of client.parallel(prompts, { context: useContextP })) {
        switch (event.event) {
          case 'context':
            console.log(`🧠 ${event.message}`);
            break;
          case 'start':
            console.log(`⚡ ${event.message}`);
            break;
          case 'progress':
            process.stdout.write('.');
            break;
          case 'complete':
            console.log('\n');
            console.log(`✓ Complete in ${event.duration}ms`);
            console.log('');
            event.results.forEach((result, i) => {
              console.log(`[${i + 1}] ${result?.substring(0, 200) || 'No result'}...`);
              console.log('');
            });
            break;
          case 'error':
            console.error(`❌ Error: ${event.error}`);
            break;
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "swarm help" for usage');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
