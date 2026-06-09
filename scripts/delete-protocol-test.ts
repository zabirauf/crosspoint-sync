#!/usr/bin/env npx tsx
/**
 * Delete Protocol Contract Test
 *
 * Validates that the app's /delete request format matches what the XTEink X4
 * firmware actually accepts, across firmware versions. This is a *protocol*
 * test, not a visual one — a wrong request format is invisible to screenshots
 * but breaks deletion entirely, so it needs an end-to-end request/response
 * check against the mock device server.
 *
 * Firmware contract (verified against crosspoint-reader handleDelete()):
 *   - <1.2.0  : /delete reads a `path` form field (+ optional `type`). It does
 *               NOT understand `paths`.
 *   - >=1.2.0 : /delete reads a `paths` form field whose value is a JSON-encoded
 *               array string. `path` is still accepted for back-compat, but
 *               supplying BOTH `path` and `paths` is rejected. The firmware reads
 *               request args — it never parses a JSON request body.
 *
 * The request for each version is built with the SAME getDeviceCapabilities()
 * gate the app uses (services/device-api.ts deleteItem), so this test fails if
 * either the gate or the request format drifts from the firmware.
 *
 * Usage:
 *   npm run test:delete
 */

import { spawn, type ChildProcess } from 'child_process';
import { getDeviceCapabilities } from '../services/firmware-version';

// ──────────────────────────────────────────────────────
// Test infrastructure (mirrors scripts/epub-test.ts)
// ──────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
}

const results: TestResult[] = [];
let currentTest: TestResult | null = null;

function startTest(name: string) {
  currentTest = { name, passed: true, errors: [] };
}

function fail(message: string) {
  if (currentTest) {
    currentTest.passed = false;
    currentTest.errors.push(message);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) fail(message);
}

function endTest() {
  if (currentTest) {
    results.push(currentTest);
    const icon = currentTest.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${currentTest.name}`);
    if (!currentTest.passed) {
      for (const err of currentTest.errors) {
        console.log(`    \x1b[31m→ ${err}\x1b[0m`);
      }
    }
    currentTest = null;
  }
}

// ──────────────────────────────────────────────────────
// Mock server lifecycle
// ──────────────────────────────────────────────────────

const HTTP_PORT = 8092;
const WS_PORT = 8093;
const BASE = `http://localhost:${HTTP_PORT}`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Start a fresh mock server at the given firmware version with a seeded
 *  in-memory filesystem, and wait until /api/status is reachable. */
async function startMock(firmwareVersion: string): Promise<ChildProcess> {
  const proc = spawn(
    'npx',
    [
      'tsx',
      'scripts/mock-device-server.ts',
      '--firmware-version',
      firmwareVersion,
      '--http-port',
      String(HTTP_PORT),
      '--ws-port',
      String(WS_PORT),
      '--data-dir',
      '', // empty → seeded in-memory filesystem (fresh every start)
    ],
    { stdio: 'ignore' },
  );

  // Wait for the HTTP server to accept connections.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/status`);
      if (res.ok) {
        const status = (await res.json()) as { version?: string };
        if (status.version !== firmwareVersion) {
          throw new Error(
            `mock reported version ${status.version}, expected ${firmwareVersion}`,
          );
        }
        return proc;
      }
    } catch {
      // not up yet
    }
    await delay(150);
  }
  proc.kill('SIGKILL');
  throw new Error(`mock server did not start for firmware ${firmwareVersion}`);
}

async function stopMock(proc: ChildProcess): Promise<void> {
  if (proc.killed) return;
  proc.kill('SIGTERM');
  // Give the OS a moment to free the port before the next mock starts.
  await delay(300);
}

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  isDirectory: boolean;
}

/** Returns true if `name` exists directly under `folder` on the mock. */
async function fileExists(folder: string, name: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/files?path=${encodeURIComponent(folder)}`);
  const entries = (await res.json()) as FileEntry[];
  return entries.some((e) => e.name === name);
}

/**
 * Build the /delete request body+headers EXACTLY as services/device-api.ts
 * deleteItem() does, gated by the same getDeviceCapabilities(version). Kept in
 * sync with the app deliberately — if device-api.ts changes, change it here too.
 */
function buildAppDeleteRequest(
  version: string,
  path: string,
  type: 'file' | 'folder',
): RequestInit {
  const caps = getDeviceCapabilities(version);
  const formData = new FormData();
  if (caps.batchDelete) {
    formData.append('paths', JSON.stringify([path]));
  } else {
    formData.append('path', path);
    formData.append('type', type);
  }
  return { method: 'POST', body: formData };
}

async function deleteViaApp(
  version: string,
  path: string,
  type: 'file' | 'folder',
): Promise<Response> {
  return fetch(`${BASE}/delete`, buildAppDeleteRequest(version, path, type));
}

// ──────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────

/** Happy path: the app's request for `version` deletes a file and it's gone. */
async function testAppDeleteSucceeds(version: string) {
  const proc = await startMock(version);
  try {
    startTest(`firmware ${version}: app delete removes /Books/Dune.epub`);
    assert(await fileExists('/Books', 'Dune.epub'), 'file missing before delete (seed broken)');

    const res = await deleteViaApp(version, '/Books/Dune.epub', 'file');
    assert(res.ok, `delete returned ${res.status} (${await res.text().catch(() => '')})`);
    assert(!(await fileExists('/Books', 'Dune.epub')), 'file still present after delete');
    endTest();
  } finally {
    await stopMock(proc);
  }
}

/** Folder delete also works (type='folder', empty dir). */
async function testAppDeleteFolder(version: string) {
  const proc = await startMock(version);
  try {
    startTest(`firmware ${version}: app delete removes empty folder /sleep`);
    assert(await fileExists('/', 'sleep'), 'folder missing before delete (seed broken)');

    const res = await deleteViaApp(version, '/sleep', 'folder');
    assert(res.ok, `delete returned ${res.status} (${await res.text().catch(() => '')})`);
    assert(!(await fileExists('/', 'sleep')), 'folder still present after delete');
    endTest();
  } finally {
    await stopMock(proc);
  }
}

/** Regression guards against the modern (>=1.2.0) firmware. */
async function testModernFirmwareRejectsBadFormats() {
  const proc = await startMock('1.3.0');
  try {
    // The pre-fix bug: app sent a JSON *body* with Content-Type application/json.
    // The firmware reads request args, so this populates neither field → 400.
    startTest('firmware 1.3.0: legacy JSON body is rejected (the original bug)');
    {
      const res = await fetch(`${BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/Books/Dune.epub'] }),
      });
      assert(!res.ok, `JSON body unexpectedly accepted (${res.status})`);
      assert(await fileExists('/Books', 'Dune.epub'), 'file deleted despite rejected request');
    }
    endTest();

    // Supplying both `path` and `paths` is rejected by the firmware.
    startTest('firmware 1.3.0: sending both path and paths is rejected');
    {
      const form = new FormData();
      form.append('path', '/Books/Dune.epub');
      form.append('paths', JSON.stringify(['/Books/Dune.epub']));
      const res = await fetch(`${BASE}/delete`, { method: 'POST', body: form });
      assert(!res.ok, `both path+paths unexpectedly accepted (${res.status})`);
      assert(await fileExists('/Books', 'Dune.epub'), 'file deleted despite rejected request');
    }
    endTest();

    // A `paths` value that is not a JSON array is rejected.
    startTest('firmware 1.3.0: malformed paths value is rejected');
    {
      const form = new FormData();
      form.append('paths', '/Books/Dune.epub'); // bare string, not JSON array
      const res = await fetch(`${BASE}/delete`, { method: 'POST', body: form });
      assert(!res.ok, `malformed paths unexpectedly accepted (${res.status})`);
    }
    endTest();
  } finally {
    await stopMock(proc);
  }
}

/** Regression guard for the version gate: old firmware does NOT understand
 *  `paths`, which is exactly why the app must send `path` to it. */
async function testLegacyFirmwareRejectsModernFormat() {
  const proc = await startMock('1.1.1');
  try {
    startTest('firmware 1.1.1: modern paths field is rejected (gate justification)');
    const form = new FormData();
    form.append('paths', JSON.stringify(['/Books/Dune.epub']));
    const res = await fetch(`${BASE}/delete`, { method: 'POST', body: form });
    assert(!res.ok, `paths unexpectedly accepted by <1.2.0 (${res.status})`);
    assert(await fileExists('/Books', 'Dune.epub'), 'file deleted despite rejected request');
    endTest();
  } finally {
    await stopMock(proc);
  }
}

// ──────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1mDelete protocol contract tests\x1b[0m');

  // Happy path across the version boundary: legacy, pre-release, and current.
  // 1.1.1 / 0.9.0 exercise the `path`+`type` form; 1.2.0 / 1.3.0 exercise `paths`.
  console.log('\n\x1b[1mApp request format per firmware version\x1b[0m');
  for (const version of ['0.9.0', '1.1.1', '1.2.0', '1.3.0']) {
    await testAppDeleteSucceeds(version);
  }
  await testAppDeleteFolder('1.1.1');
  await testAppDeleteFolder('1.3.0');

  console.log('\n\x1b[1mRegression guards\x1b[0m');
  await testModernFirmwareRejectsBadFormats();
  await testLegacyFirmwareRejectsModernFormat();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('\n\x1b[1m━━━ Results ━━━\x1b[0m');
  console.log(`  Total:  ${total}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  \x1b[31m✗ ${r.name}\x1b[0m`);
      for (const err of r.errors) {
        console.log(`    → ${err}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll tests passed!\x1b[0m');
  }
}

main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err);
  process.exit(1);
});
