#!/usr/bin/env node
/**
 * Complex Code Generation Tests
 * Testing Swarm on real-world coding scenarios
 */

const { CodeSwarm } = require('./lib/code-swarm');

const COMPLEX_TESTS = [
  {
    name: 'Full-Stack Utility Library',
    description: 'Common utilities for a web application',
    functions: [
      { name: 'hashPassword', description: 'Hash a password using bcrypt-like algorithm (pure JS implementation)', inputType: 'string', outputType: 'Promise<string>' },
      { name: 'generateJWT', description: 'Generate a simple JWT token structure (base64 encoded)', inputType: '(payload: object, secret: string, expiresIn: number)', outputType: 'string' },
      { name: 'parseJWT', description: 'Parse and decode a JWT token (without verification)', inputType: 'string', outputType: 'object | null' },
      { name: 'sanitizeHTML', description: 'Sanitize HTML string to prevent XSS attacks', inputType: 'string', outputType: 'string' },
      { name: 'rateLimiter', description: 'Create a rate limiter that allows N requests per time window', inputType: '(maxRequests: number, windowMs: number)', outputType: 'Function' },
      { name: 'retry', description: 'Retry an async function with exponential backoff', inputType: '(fn: Function, maxRetries: number, baseDelay: number)', outputType: 'Promise<any>' },
    ],
  },
  {
    name: 'Data Processing Pipeline',
    description: 'Functions for ETL and data transformation',
    functions: [
      { name: 'csvToJSON', description: 'Parse CSV string to array of objects', inputType: 'string', outputType: 'object[]' },
      { name: 'jsonToCSV', description: 'Convert array of objects to CSV string', inputType: 'object[]', outputType: 'string' },
      { name: 'flattenObject', description: 'Flatten nested object to dot notation keys', inputType: 'object', outputType: 'object', example: '{a:{b:1}} → {"a.b":1}' },
      { name: 'unflattenObject', description: 'Unflatten dot notation object to nested', inputType: 'object', outputType: 'object' },
      { name: 'groupBy', description: 'Group array of objects by a key', inputType: '(arr: object[], key: string)', outputType: 'object' },
      { name: 'chunk', description: 'Split array into chunks of specified size', inputType: '(arr: any[], size: number)', outputType: 'any[][]' },
    ],
  },
  {
    name: 'API Client Helpers',
    description: 'Utilities for building API clients',
    functions: [
      { name: 'createFetcher', description: 'Create a fetch wrapper with base URL, default headers, and timeout', inputType: '(baseURL: string, options: object)', outputType: 'object with get/post/put/delete methods' },
      { name: 'queryString', description: 'Convert object to URL query string', inputType: 'object', outputType: 'string', example: '{a:1,b:2} → "a=1&b=2"' },
      { name: 'parseQueryString', description: 'Parse URL query string to object', inputType: 'string', outputType: 'object' },
      { name: 'handleAPIError', description: 'Standardize API error handling with status codes', inputType: 'Response | Error', outputType: '{ status, message, data }' },
      { name: 'cacheRequest', description: 'Cache API responses with TTL', inputType: '(fn: Function, ttlMs: number)', outputType: 'Function' },
    ],
  },
  {
    name: 'Form Validation Library',
    description: 'Comprehensive form validation utilities',
    functions: [
      { name: 'validateEmail', description: 'Validate email with detailed error messages', inputType: 'string', outputType: '{ valid: boolean, errors: string[] }' },
      { name: 'validatePassword', description: 'Validate password strength (min 8 chars, uppercase, lowercase, number, special)', inputType: 'string', outputType: '{ valid: boolean, strength: string, errors: string[] }' },
      { name: 'validateCreditCard', description: 'Validate credit card number using Luhn algorithm', inputType: 'string', outputType: '{ valid: boolean, type: string }' },
      { name: 'validatePhoneInternational', description: 'Validate international phone numbers', inputType: 'string', outputType: '{ valid: boolean, country: string | null }' },
      { name: 'createValidator', description: 'Create a schema-based validator for objects', inputType: 'schema: object', outputType: '(data: object) => { valid: boolean, errors: object }' },
    ],
  },
  {
    name: 'State Management Utilities',
    description: 'Redux-like state management helpers',
    functions: [
      { name: 'createStore', description: 'Create a simple Redux-like store with subscribe/dispatch', inputType: '(reducer: Function, initialState: any)', outputType: '{ getState, dispatch, subscribe }' },
      { name: 'combineReducers', description: 'Combine multiple reducers into one', inputType: 'object of reducers', outputType: 'Function' },
      { name: 'createAction', description: 'Create an action creator function', inputType: '(type: string)', outputType: '(payload?: any) => { type, payload }' },
      { name: 'createSelector', description: 'Create a memoized selector function', inputType: '(...selectors: Function[], combiner: Function)', outputType: 'Function' },
    ],
  },
  {
    name: 'Date/Time Utilities',
    description: 'Comprehensive date manipulation without external deps',
    functions: [
      { name: 'formatRelativeTime', description: 'Format date as relative time (e.g., "2 hours ago", "in 3 days")', inputType: 'Date | string | number', outputType: 'string' },
      { name: 'parseDate', description: 'Parse various date string formats to Date object', inputType: 'string', outputType: 'Date | null' },
      { name: 'addTime', description: 'Add time to a date (supports days, hours, minutes, seconds)', inputType: '(date: Date, amount: number, unit: string)', outputType: 'Date' },
      { name: 'getDateRange', description: 'Get array of dates between start and end', inputType: '(start: Date, end: Date)', outputType: 'Date[]' },
      { name: 'formatDuration', description: 'Format milliseconds to human readable duration', inputType: 'number', outputType: 'string', example: '3661000 → "1h 1m 1s"' },
      { name: 'isBusinessDay', description: 'Check if date is a business day (Mon-Fri, excluding common US holidays)', inputType: 'Date', outputType: 'boolean' },
    ],
  },
];

async function runComplexTests() {
  console.log('═'.repeat(70));
  console.log('🧪 COMPLEX CODE GENERATION TESTS');
  console.log('═'.repeat(70));
  console.log('');

  const swarm = new CodeSwarm();
  swarm.setContext({ language: 'JavaScript', framework: 'Node.js' });

  const results = [];
  let totalFunctions = 0;
  let totalTime = 0;

  for (const test of COMPLEX_TESTS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📦 ${test.name}`);
    console.log(`   ${test.description}`);
    console.log(`   Functions: ${test.functions.length}`);
    console.log('─'.repeat(70));

    const startTime = Date.now();
    
    try {
      const functions = await swarm.generateFunctions(test.functions);
      const duration = Date.now() - startTime;
      
      // Count successful generations
      const successful = Object.values(functions).filter(f => !f.includes('[SWARM ERROR]')).length;
      
      console.log(`\n✅ Generated ${successful}/${test.functions.length} functions in ${(duration/1000).toFixed(1)}s`);
      
      // Show preview of each function
      for (const [name, code] of Object.entries(functions)) {
        const lines = code.split('\n').length;
        const preview = code.substring(0, 150).replace(/\n/g, ' ');
        console.log(`   • ${name}: ${lines} lines - ${preview.substring(0, 60)}...`);
      }

      results.push({
        name: test.name,
        functions: test.functions.length,
        successful,
        duration,
        code: functions,
      });

      totalFunctions += test.functions.length;
      totalTime += duration;

    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
      results.push({
        name: test.name,
        functions: test.functions.length,
        successful: 0,
        duration: Date.now() - startTime,
        error: error.message,
      });
    }

    // Brief pause between tests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Final Summary
  console.log('\n' + '═'.repeat(70));
  console.log('📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  
  console.log('\n| Test Suite | Functions | Success | Time | Avg/Fn |');
  console.log('|------------|-----------|---------|------|--------|');
  
  for (const r of results) {
    const avg = r.functions > 0 ? (r.duration / r.functions / 1000).toFixed(2) : 'N/A';
    console.log(`| ${r.name.substring(0,20).padEnd(20)} | ${r.functions.toString().padStart(9)} | ${(r.successful + '/' + r.functions).padStart(7)} | ${(r.duration/1000).toFixed(1).padStart(4)}s | ${avg.padStart(6)}s |`);
  }

  const totalSuccessful = results.reduce((sum, r) => sum + r.successful, 0);
  console.log('|------------|-----------|---------|------|--------|');
  console.log(`| ${'TOTAL'.padEnd(20)} | ${totalFunctions.toString().padStart(9)} | ${(totalSuccessful + '/' + totalFunctions).padStart(7)} | ${(totalTime/1000).toFixed(1).padStart(4)}s | ${(totalTime/totalFunctions/1000).toFixed(2).padStart(6)}s |`);

  // Speedup estimation
  const estimatedSequential = totalFunctions * 2000; // ~2s per function sequentially
  const speedup = estimatedSequential / totalTime;

  console.log(`\n⚡ Performance:`);
  console.log(`   Total functions: ${totalFunctions}`);
  console.log(`   Parallel time: ${(totalTime/1000).toFixed(1)}s`);
  console.log(`   Estimated sequential: ~${(estimatedSequential/1000).toFixed(0)}s`);
  console.log(`   Speedup: ${speedup.toFixed(1)}x`);

  // Save one complete module as example
  console.log('\n📁 Saving sample output...');
  const fs = require('fs');
  
  if (results[0]?.code) {
    const sampleModule = `/**
 * ${results[0].name}
 * Generated by Code Swarm
 * ${new Date().toISOString()}
 */

${Object.entries(results[0].code).map(([name, code]) => `// === ${name} ===\n${code}`).join('\n\n')}

module.exports = {
  ${Object.keys(results[0].code).join(',\n  ')}
};
`;
    fs.writeFileSync(__dirname + '/sample-generated-module.js', sampleModule);
    console.log('   Saved: sample-generated-module.js');
  }

  swarm.shutdown();
  
  return results;
}

runComplexTests().catch(console.error);
