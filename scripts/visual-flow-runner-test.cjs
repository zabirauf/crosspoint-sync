#!/usr/bin/env node
// Test recovery decisions with local fake tools; never boot or reset a device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const simulator = '11111111-1111-4111-8111-111111111111';
const axFailure = 'The test runner failed to initialize for UI testing. Failed call to AXDisableAccessibilityOnTermination: kAXErrorCannotComplete';

function run(scenario, platform = 'ios', device = simulator) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crosspoint-visual-runner-'));
  try {
    for (const directory of ['scripts', 'bin', '.maestro', 'test-screenshots']) fs.mkdirSync(path.join(root, directory));
    for (const name of ['test-visual-flows.sh', 'collect-visual-screenshots.cjs']) {
      fs.copyFileSync(path.join(__dirname, name), path.join(root, 'scripts', name));
    }
    fs.symlinkSync(process.execPath, path.join(root, 'bin/node'));
    fs.writeFileSync(path.join(root, 'bin/xcrun'), `#!/usr/bin/env node
const fs = require('fs');
const root = process.env.RUNNER_TEST_ROOT, args = process.argv.slice(2);
fs.appendFileSync(root + '/simctl.jsonl', JSON.stringify(args) + '\\n');
if (args[1] === 'list') console.log(JSON.stringify({devices: {runtime: [{udid: '${simulator}', state: 'Booted', isAvailable: true}]}}));
`, { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'bin/maestro'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const root = process.env.RUNNER_TEST_ROOT, args = process.argv.slice(2);
const attempt = fs.existsSync(root + '/calls') ? Number(fs.readFileSync(root + '/calls')) + 1 : 1;
fs.writeFileSync(root + '/calls', String(attempt));
const output = args[args.indexOf('--test-output-dir') + 1];
fs.mkdirSync(output, {recursive: true});
const scenario = process.env.RUNNER_TEST_SCENARIO;
if (scenario === 'assertion') {
  console.log('Waiting for flows to complete...');
  console.log('Assertion failed: Library.FileList is visible');
  fs.writeFileSync(path.join(output, 'xctest_runner.log'), ${JSON.stringify(axFailure)});
  process.exit(1);
}
if (scenario === 'other-startup') {console.log('Driver connection refused'); process.exit(1);}
if (scenario === 'always-ax' || (scenario === 'recover-ax' && attempt === 1)) {
  console.log('iOS driver not ready in time');
  fs.writeFileSync(path.join(output, 'xctest_runner.log'), ${JSON.stringify(axFailure)});
  process.exit(1);
}
console.log('Waiting for flows to complete...');
console.log('[Passed] App Launch');
fs.mkdirSync(path.join(output, 'takeScreenshot'));
fs.writeFileSync(path.join(output, 'takeScreenshot/app-launch.png'), 'test capture');
`, { mode: 0o755 });
    const output = path.join(root, 'results');
    const result = spawnSync('bash', [path.join(root, 'scripts/test-visual-flows.sh'), '--platform', platform, '--device', device], {
      env: { ...process.env, PATH: `${path.join(root, 'bin')}:${process.env.PATH}`, CROSSPOINT_VISUAL_OUTPUT: output,
        RUNNER_TEST_ROOT: root, RUNNER_TEST_SCENARIO: scenario, MAESTRO_BINARY: 'maestro' },
      encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    const simctl = fs.existsSync(path.join(root, 'simctl.jsonl'))
      ? fs.readFileSync(path.join(root, 'simctl.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
    return {
      status: result.status,
      calls: Number(fs.readFileSync(path.join(root, 'calls'))),
      resets: simctl.filter(args => ['shutdown', 'boot'].includes(args[1])),
      originalLog: fs.existsSync(path.join(output, 'xctest_runner.log')),
      retryLog: fs.existsSync(path.join(output, 'startup-retry/xctest_runner.log')),
      screenshot: fs.existsSync(path.join(output, 'screenshots/app-launch.png')),
      simctl,
    };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('successful startup runs once without restarting the simulator', () => {
  const result = run('success');
  assert.equal(result.status, 0);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.resets, []);
  assert.ok(result.screenshot);
});

test('known accessibility startup failure reboots only the selected simulator once and preserves evidence', () => {
  const result = run('recover-ax');
  assert.equal(result.status, 0);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.resets, [['simctl', 'shutdown', simulator], ['simctl', 'boot', simulator]]);
  assert.ok(result.originalLog);
  assert.ok(result.screenshot);
});

test('application assertion failures are never retried, even if an AX error also appears', () => {
  const result = run('assertion');
  assert.equal(result.status, 1);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.resets, []);
});

test('other driver startup errors are not treated as accessibility failures', () => {
  const result = run('other-startup');
  assert.equal(result.status, 1);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.resets, []);
});

test('a repeated accessibility failure remains failed after the single recovery attempt', () => {
  const result = run('always-ax');
  assert.equal(result.status, 1);
  assert.equal(result.calls, 2);
  assert.equal(result.resets.length, 2);
  assert.ok(result.originalLog && result.retryLog);
});

test('Android failures never touch iOS simulators', () => {
  const result = run('always-ax', 'android', 'emulator-5554');
  assert.equal(result.status, 1);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.simctl, []);
});

test('an unknown or physical iOS device is not rebooted', () => {
  const result = run('always-ax', 'ios', 'physical-device');
  assert.equal(result.status, 1);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.resets, []);
});
