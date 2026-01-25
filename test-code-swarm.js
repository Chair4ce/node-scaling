#!/usr/bin/env node
/**
 * Test Code Swarm - Parallel Code Generation
 */

const { CodeSwarm } = require('./lib/code-swarm');

async function testCodeSwarm() {
  console.log('═'.repeat(60));
  console.log('🧪 CODE SWARM TEST - Parallel Code Generation');
  console.log('═'.repeat(60));
  
  const swarm = new CodeSwarm();
  
  // Set context
  swarm.setContext({
    language: 'JavaScript',
    framework: 'Node.js',
  });

  // Test 1: Generate multiple utility functions in parallel
  console.log('\n📝 Test 1: Generate 5 utility functions in parallel\n');
  
  const utilitySpecs = [
    {
      name: 'formatDate',
      description: 'Format a Date object to YYYY-MM-DD string',
      inputType: 'Date',
      outputType: 'string',
    },
    {
      name: 'slugify',
      description: 'Convert a string to URL-friendly slug',
      inputType: 'string',
      outputType: 'string',
      example: '"Hello World!" → "hello-world"',
    },
    {
      name: 'debounce',
      description: 'Create a debounced version of a function',
      inputType: '(fn: Function, delay: number)',
      outputType: 'Function',
    },
    {
      name: 'deepClone',
      description: 'Deep clone an object or array',
      inputType: 'any',
      outputType: 'any',
    },
    {
      name: 'randomId',
      description: 'Generate a random alphanumeric ID',
      inputType: '(length?: number)',
      outputType: 'string',
    },
  ];

  const startTime = Date.now();
  const functions = await swarm.generateFunctions(utilitySpecs);
  const parallelTime = Date.now() - startTime;

  console.log('Generated functions:');
  for (const [name, code] of Object.entries(functions)) {
    console.log(`\n--- ${name} ---`);
    console.log(code.substring(0, 300) + (code.length > 300 ? '...' : ''));
  }

  // Test 2: Generate a complete module
  console.log('\n' + '═'.repeat(60));
  console.log('📦 Test 2: Generate a complete validation module\n');

  const moduleSpec = {
    name: 'validators',
    description: 'Common validation utilities',
    functions: [
      {
        name: 'isEmail',
        description: 'Validate email address format',
        inputType: 'string',
        outputType: 'boolean',
      },
      {
        name: 'isURL',
        description: 'Validate URL format',
        inputType: 'string',
        outputType: 'boolean',
      },
      {
        name: 'isPhoneNumber',
        description: 'Validate phone number (US format)',
        inputType: 'string',
        outputType: 'boolean',
      },
    ],
  };

  const moduleCode = await swarm.generateModule(moduleSpec);
  console.log('\nGenerated module:');
  console.log('─'.repeat(40));
  console.log(moduleCode);
  console.log('─'.repeat(40));

  // Test 3: Research and implement
  console.log('\n' + '═'.repeat(60));
  console.log('🔬 Test 3: Research + Implement (finds best package)\n');

  const researchSpec = {
    name: 'parseMarkdown',
    description: 'Parse markdown string to HTML',
  };

  const researchedCode = await swarm.researchAndImplement(researchSpec);
  console.log('\nResearched & implemented:');
  console.log('─'.repeat(40));
  console.log(researchedCode);
  console.log('─'.repeat(40));

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✓ Generated ${Object.keys(functions).length} utility functions`);
  console.log(`✓ Created validators module with ${moduleSpec.functions.length} functions`);
  console.log(`✓ Researched and implemented markdown parser`);
  console.log(`\n⏱️  Total parallel time: ${parallelTime}ms for 5 functions`);
  console.log(`   Sequential estimate: ~${parallelTime * 3}ms (based on typical 3x speedup)`);

  swarm.shutdown();
}

testCodeSwarm().catch(console.error);
