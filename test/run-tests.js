import { loadConfig } from '../lib/config.js';
import { checkRequestRisk } from '../lib/rules.js';
import assert from 'assert';

function testConfig() {
  console.log('Testing Config Loader...');
  const config = loadConfig();
  assert.ok(config);
  assert.strictEqual(config.defaultPolicy, 'prompt');
  assert.ok(config.rules.alwaysAllow.includes('tools/list'));
  assert.ok(config.rules.promptOnly.includes('execute_command'));
  console.log('✅ Config Loader tests passed.');
}

function testRules() {
  console.log('Testing Risk Checker...');
  const config = loadConfig();

  // Test always allow methods
  const res1 = checkRequestRisk('tools/list', null, null, config);
  assert.strictEqual(res1.action, 'allow');

  // Test always allow tools
  const res2 = checkRequestRisk('tools/call', 'tools/list', null, config);
  assert.strictEqual(res2.action, 'allow');

  // Test custom high-risk tools
  const res3 = checkRequestRisk('tools/call', 'execute_command', null, config);
  assert.strictEqual(res3.action, 'prompt');

  // Test keyword matching
  const res4 = checkRequestRisk('tools/call', 'delete_user_data', null, config);
  assert.strictEqual(res4.action, 'prompt');

  // Test argument security scan (safe params)
  const res5 = checkRequestRisk('tools/call', 'arbitrary_tool', { arguments: { val: 42 } }, config);
  assert.strictEqual(res5.action, 'prompt'); // defaults to prompt because defaultPolicy is prompt

  // Test argument security scan (dangerous params)
  config.defaultPolicy = 'allow'; // set default policy to allow for testing parameter rules
  const res6 = checkRequestRisk('tools/call', 'arbitrary_tool', { arguments: { path: '/etc/passwd' } }, config);
  assert.strictEqual(res6.action, 'prompt'); // promoted to prompt because of regex Match
  
  const res7 = checkRequestRisk('tools/call', 'arbitrary_tool', { arguments: { cmd: 'rm -rf /' } }, config);
  assert.strictEqual(res7.action, 'prompt'); // promoted to prompt because of regex Match

  console.log('✅ Risk Checker tests passed.');
}

function runAll() {
  try {
    testConfig();
    testRules();
    console.log('\n🎉 All unit tests passed successfully!');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

runAll();
