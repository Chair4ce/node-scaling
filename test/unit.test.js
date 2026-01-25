/**
 * Unit Tests for Swarm
 * Tests individual components in isolation
 */

const assert = require('assert');
const { swarmEvents, EVENTS } = require('../lib/events');
const { SwarmDisplay } = require('../lib/display');

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    return false;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    return false;
  }
}

console.log('\n🧪 UNIT TESTS\n');

// ============================================
// Event System Tests
// ============================================
console.log('📡 Event System');

let passed = 0;
let failed = 0;

// Test: Events module exports correctly
if (test('Events module exports EVENTS constant', () => {
  assert(EVENTS, 'EVENTS should be exported');
  assert(EVENTS.SWARM_START, 'EVENTS.SWARM_START should exist');
  assert(EVENTS.SWARM_COMPLETE, 'EVENTS.SWARM_COMPLETE should exist');
  assert(EVENTS.TASK_START, 'EVENTS.TASK_START should exist');
  assert(EVENTS.TASK_COMPLETE, 'EVENTS.TASK_COMPLETE should exist');
})) passed++; else failed++;

// Test: swarmEvents is an EventEmitter
if (test('swarmEvents is an EventEmitter', () => {
  assert(swarmEvents, 'swarmEvents should be exported');
  assert(typeof swarmEvents.on === 'function', 'should have on() method');
  assert(typeof swarmEvents.emit === 'function', 'should have emit() method');
})) passed++; else failed++;

// Test: Events can be emitted and received
if (test('Events can be emitted and received', () => {
  let received = null;
  const handler = (data) => { received = data; };
  
  swarmEvents.on('test:event', handler);
  swarmEvents.emit('test:event', { foo: 'bar' });
  
  assert.deepStrictEqual(received, { foo: 'bar' }, 'Event data should match');
  
  // Cleanup
  swarmEvents.removeListener('test:event', handler);
})) passed++; else failed++;

// Test: Multiple listeners work
if (test('Multiple listeners receive events', () => {
  let count = 0;
  const handler1 = () => { count++; };
  const handler2 = () => { count++; };
  
  swarmEvents.on('test:multi', handler1);
  swarmEvents.on('test:multi', handler2);
  swarmEvents.emit('test:multi');
  
  assert.strictEqual(count, 2, 'Both handlers should fire');
  
  // Cleanup
  swarmEvents.removeListener('test:multi', handler1);
  swarmEvents.removeListener('test:multi', handler2);
})) passed++; else failed++;

// ============================================
// Display Tests
// ============================================
console.log('\n🖥️  Display System');

// Test: Display can be instantiated
if (test('SwarmDisplay can be instantiated', () => {
  const display = new SwarmDisplay({ enabled: false });
  assert(display, 'Display should be created');
  assert.strictEqual(display.enabled, false, 'enabled should be false');
})) passed++; else failed++;

// Test: Display tracks task state
if (test('Display tracks tasks', () => {
  const display = new SwarmDisplay({ enabled: false });
  
  display.tasks.set('task-1', { label: 'Test Task', startTime: Date.now() });
  assert.strictEqual(display.tasks.size, 1, 'Should have 1 task');
  
  display.tasks.delete('task-1');
  assert.strictEqual(display.tasks.size, 0, 'Should have 0 tasks');
})) passed++; else failed++;

// Test: Display tracks workers
if (test('Display tracks workers', () => {
  const display = new SwarmDisplay({ enabled: false });
  
  display.workers.set('worker-1', { type: 'analyze', num: 1 });
  display.workers.set('worker-2', { type: 'search', num: 2 });
  
  assert.strictEqual(display.workers.size, 2, 'Should have 2 workers');
  assert.strictEqual(display.getWorkerNum('worker-1'), 1, 'Worker 1 should have num 1');
})) passed++; else failed++;

// Test: Progress bar generation
if (test('Progress bar renders correctly', () => {
  const display = new SwarmDisplay({ enabled: false });
  
  const bar0 = display.progressBar(0, 10, 10);
  assert(bar0.includes('░░░░░░░░░░'), 'Empty bar should have 10 empty chars');
  
  const bar50 = display.progressBar(5, 10, 10);
  assert(bar50.includes('█████'), 'Half bar should have 5 filled chars');
  
  const bar100 = display.progressBar(10, 10, 10);
  assert(bar100.includes('██████████'), 'Full bar should have 10 filled chars');
})) passed++; else failed++;

// Test: Truncate helper
if (test('Truncate helper works', () => {
  const display = new SwarmDisplay({ enabled: false });
  
  const short = display.truncate('hello', 10);
  assert.strictEqual(short, 'hello', 'Short string unchanged');
  
  const long = display.truncate('hello world this is long', 10);
  assert.strictEqual(long, 'hello w...', 'Long string truncated');
  
  const empty = display.truncate('', 10);
  assert.strictEqual(empty, '', 'Empty string returns empty');
  
  const nullStr = display.truncate(null, 10);
  assert.strictEqual(nullStr, '', 'Null returns empty');
})) passed++; else failed++;

// ============================================
// Summary
// ============================================
console.log('\n' + '─'.repeat(40));
console.log(`Unit Tests: ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
