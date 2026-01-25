#!/usr/bin/env node
/**
 * Quick tool validation before running full benchmark
 */

const { webSearch, webFetch } = require('./lib/tools');
const { GeminiClient } = require('./lib/gemini-client');

async function testTools() {
  console.log('🔧 Testing individual tools...\n');
  
  // Test web search
  console.log('1. Testing web_search...');
  const searchResult = await webSearch('GitHub Copilot features 2024', { count: 3 });
  console.log(`   Success: ${searchResult.success}`);
  console.log(`   Results: ${searchResult.results.length} found`);
  if (searchResult.results[0]) {
    console.log(`   Top result: ${searchResult.results[0].title}`);
    console.log(`   URL: ${searchResult.results[0].url}`);
  }
  
  // Test web fetch
  console.log('\n2. Testing web_fetch...');
  if (searchResult.results[0]) {
    const fetchResult = await webFetch(searchResult.results[0].url, { maxChars: 5000 });
    console.log(`   Success: ${fetchResult.success}`);
    console.log(`   Content length: ${fetchResult.content?.length || 0} chars`);
    if (fetchResult.content) {
      console.log(`   Preview: ${fetchResult.content.substring(0, 150)}...`);
    }
  }
  
  // Test Gemini client
  console.log('\n3. Testing Gemini client...');
  const llm = new GeminiClient();
  const llmResult = await llm.complete('What is GitHub Copilot? One sentence answer.');
  console.log(`   Response: ${llmResult.trim()}`);
  
  console.log('\n✅ All tools working!');
}

testTools().catch(err => {
  console.error('❌ Tool test failed:', err.message);
  process.exit(1);
});
