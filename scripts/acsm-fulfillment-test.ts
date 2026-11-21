#!/usr/bin/env npx tsx
/**
 * ACSM upload + Protected Content fulfillment through the actual queue,
 * WebSocket uploader, device API and plugin job client. Only native modules
 * and storage are replaced. The mock reader implements the firmware 2.0.0
 * plugin job queue; a Node loop stands in for the hidden /plugins-run WebView
 * and runs the same claim → action → complete cycle as the mock runner page.
 * Run: npm run test:acsm
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import Module from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { DeviceFile, DeviceStatus } from '../types/device';

const projectRoot = path.resolve(__dirname, '..');
const acsmFixture = path.join(projectRoot, 'test-fixtures/acsm/Gettysburg-Loan.acsm');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crosspoint-acsm-'));
const FETCHED_BOOK = 'The Gettysburg Address.epub';

class NativeFile {
  readonly uri: string;
  constructor(uri: string) { this.uri = uri; }
  get size() { return fs.statSync(fileURLToPath(this.uri)).size; }
  get exists() { return fs.existsSync(fileURLToPath(this.uri)); }
  delete() { fs.rmSync(fileURLToPath(this.uri), { force: true }); }
  open() {
    const fd = fs.openSync(fileURLToPath(this.uri), 'r');
    let offset = 0;
    return {
      readBytes(length: number) {
        const buffer = Buffer.alloc(length);
        const read = fs.readSync(fd, buffer, 0, length, offset);
        offset += read;
        return new Uint8Array(buffer.subarray(0, read));
      },
      close() { fs.closeSync(fd); },
    };
  }
}

type Loader = (id: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id, parent, isMain) {
  if (id === 'expo-file-system') return { File: NativeFile, Directory: class {}, Paths: { cache: scratch } };
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === '@react-native-async-storage/async-storage') return {
    getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
  };
  if (id === '@/services/logger' || id === './logger') return { log: () => {} };
  return originalLoad.call(this, id, parent, isMain);
};
let api: typeof import('../services/device-api');
let fulfillment: typeof import('../services/acsm-fulfillment');
let useDeviceStore: typeof import('../stores/device-store').useDeviceStore;
let useUploadStore: typeof import('../stores/upload-store').useUploadStore;
let usePluginRunnerStore: typeof import('../services/plugin-runner').usePluginRunnerStore;
let queue: typeof import('../services/upload-queue');
try {
  ({ useDeviceStore } = require('../stores/device-store'));
  ({ useUploadStore } = require('../stores/upload-store'));
  ({ usePluginRunnerStore } = require('../services/plugin-runner'));
  api = require('../services/device-api');
  fulfillment = require('../services/acsm-fulfillment');
  queue = require('../services/upload-queue');
} finally {
  loader._load = originalLoad;
}

// ─── Mock reader ───

interface Mock { process: ChildProcess; base: string; output: () => string; uploads: () => number }

async function freePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startMock(mode: string, firmware = '2.0.0'): Promise<Mock> {
  const httpPort = await freePort();
  const wsPort = await freePort();
  const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'scripts/mock-device-server.ts',
    '--firmware-version', firmware, '--protected-content', mode,
    '--http-port', String(httpPort), '--ws-port', String(wsPort), '--data-dir', ''],
  { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', chunk => { output += chunk; });
  child.stderr?.on('data', chunk => { output += chunk; });
  const base = `http://127.0.0.1:${httpPort}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${base}/api/status`);
      if (response.ok) {
        const status = await response.json() as DeviceStatus;
        useDeviceStore.getState().connectDevice({ ip: '127.0.0.1', hostname: 'Mock', httpPort, wsPort });
        useDeviceStore.getState().updateDeviceStatus(status);
        return {
          process: child, base, output: () => output,
          uploads: () => output.split('[WS] Upload start').length - 1,
        };
      }
    } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`Mock failed to start: ${output}`);
}

async function stopMock(mock: Mock) {
  useDeviceStore.getState().disconnect();
  if (mock.process.exitCode !== null) return;
  const exited = once(mock.process, 'exit');
  mock.process.kill('SIGTERM');
  await exited;
}

async function listing(mock: Mock, folder: string): Promise<string[]> {
  const files = await (await fetch(`${mock.base}/api/files?path=${encodeURIComponent(folder)}`)).json() as DeviceFile[];
  return files.map(f => f.name);
}

// ─── Stand-in for the hidden /plugins-run WebView ───

let runnerEnabled = true;
// Claim jobs but hold the action, like a long protected download.
let runnerHold = false;
let runnerLoads = 0;
let loadedSession = 0;
let runnerBusy = false;

// Like the mounted WebView: load the page once per runner session, then keep
// claiming protected-content jobs while the app holds the runner open.
async function runnerTick() {
  const { url, sessionId } = usePluginRunnerStore.getState();
  if (!runnerEnabled || !url || runnerBusy) return;
  runnerBusy = true;
  try {
    if (loadedSession !== sessionId) {
      loadedSession = sessionId;
      const page = await fetch(url);
      runnerLoads++;
      if (!page.ok) {
        usePluginRunnerStore.getState().reportLoadError(`Plugin runner page returned HTTP ${page.status}`);
        return;
      }
    }
    const origin = new URL(url).origin;
    const job = await (await fetch(`${origin}/api/plugin-jobs/claim?plugin=protected-content`)).json() as
      { id: number; claim: number; action: string; args: unknown };
    if (!job.id) return;
    while (runnerHold) await new Promise(resolve => setTimeout(resolve, 25));
    const run = await (await fetch(`${origin}/mock/plugins/protected-content/${job.action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.args),
    })).json() as { ok: boolean; result: unknown };
    await fetch(`${origin}/api/plugin-jobs/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, claim: job.claim, ok: run.ok, result: run.result }),
    });
  } catch { /* reader restarting between cases */ } finally {
    runnerBusy = false;
  }
}
const runnerTimer = setInterval(runnerTick, 100);

// ─── Helpers ───

// Replaces plugin job status responses while set, standing in for a reader
// that cannot answer while it streams a book to SD.
let statusOverride: (() => Response | Promise<Response>) | null = null;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (statusOverride && url.includes('/api/plugin-jobs/status')) return Promise.resolve().then(statusOverride);
  return realFetch(input, init);
}) as typeof fetch;

const jobs = () => useUploadStore.getState().jobs;

async function waitUntil(predicate: () => boolean, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(predicate(), 'condition not reached before timeout');
}

function queueAcsm(destinationPath = '/Library') {
  const local = path.join(scratch, `${Date.now()}-Gettysburg-Loan.acsm`);
  fs.copyFileSync(acsmFixture, local);
  useUploadStore.getState().addJob({
    fileName: 'Gettysburg-Loan.acsm',
    fileUri: pathToFileURL(local).href,
    fileSize: fs.statSync(local).size,
    destinationPath,
    jobType: 'book',
  });
  return jobs()[jobs().length - 1].id;
}

const settled = (id: string) => () => {
  const job = jobs().find(j => j.id === id);
  return !!job && ['completed', 'failed', 'cancelled', 'conflict'].includes(job.status);
};

// ─── Tests ───

test('ACSM uploads and Protected Content fulfillment', async t => {
  const stopQueue = queue.startQueueProcessor();
  try {
    await t.test('capabilities gate the plugin job queue at firmware 2.0.0', () => {
      for (const version of [undefined, '1.3.0', '1.6.5', '2.0.0rc']) {
        assert.equal(require('../services/firmware-version').getDeviceCapabilities(version).pluginJobs, version === '2.0.0rc');
      }
      assert.equal(require('../services/firmware-version').getDeviceCapabilities('2.0.0-rc+abc').pluginJobs, true);
      assert.equal(fulfillment.remoteFilePath('/', 'a.acsm'), '/a.acsm');
      assert.equal(fulfillment.remoteFilePath('/Library/', 'a.acsm'), '/Library/a.acsm');
      assert.equal(fulfillment.hasProtectedContentPlugin([{ name: 'Protected-Content', hasPluginJs: true }]), true);
      assert.equal(fulfillment.hasProtectedContentPlugin([{ name: 'protected-content', hasPluginJs: false }]), false);
    });

    await t.test('activated plugin: queue uploads the .acsm, the reader fetches the EPUB beside it', async () => {
      const mock = await startMock('activated');
      const phases: string[] = [];
      const unsubscribe = useUploadStore.subscribe(state => {
        const phase = state.jobs.find(j => j.fileName === 'Gettysburg-Loan.acsm')?.fulfillment?.phase;
        if (phase && phases[phases.length - 1] !== phase) phases.push(phase);
      });
      try {
        const id = queueAcsm();
        await waitUntil(() => jobs().find(j => j.id === id)?.fulfillment?.state === 'running');
        const active = jobs().find(j => j.id === id)!;
        assert.equal(active.status, 'uploading', 'the job holds the queue while the reader fetches');
        assert.equal(active.fulfillment?.remotePath, '/Library/Gettysburg-Loan.acsm');
        await waitUntil(() => !!usePluginRunnerStore.getState().url?.endsWith('/plugins-run'));

        await waitUntil(settled(id));
        unsubscribe();
        // The mock can finish between two polls, so 'fetching' is not always observed.
        const order = ['requesting', 'waiting', 'fetching'];
        assert.deepEqual(phases.slice(0, 2), ['requesting', 'waiting'], `phases seen: ${phases.join(', ')}`);
        assert.deepEqual(phases, order.slice(0, phases.length), 'phases only move forward');
        const job = jobs().find(j => j.id === id)!;
        assert.equal(job.status, 'completed', job.error);
        assert.equal(job.fulfillment?.state, 'done');
        assert.equal(job.fulfillment?.phase, undefined, 'a finished job carries no running phase');
        assert.equal(job.fulfillment?.message, `Fetched “The Gettysburg Address” to /Library/${FETCHED_BOOK}`);
        assert.deepEqual(await listing(mock, '/Library'), [FETCHED_BOOK], 'the plugin replaces the .acsm with the book');
        assert.equal(usePluginRunnerStore.getState().url, null, 'the runner page closes after the job');
        assert.match(mock.output(), /job 1 queued: protected-content\/fulfill \{"path":"\/Library\/Gettysburg-Loan\.acsm"\}/);
      } finally { unsubscribe(); useUploadStore.setState({ jobs: [] }); await stopMock(mock); }
    });

    await t.test('unactivated plugin: actionable failure, retry fulfils again without re-uploading', async () => {
      const mock = await startMock('unactivated');
      try {
        const id = queueAcsm('/');
        await waitUntil(settled(id));
        let job = jobs().find(j => j.id === id)!;
        assert.equal(job.status, 'failed');
        assert.equal(job.fulfillment?.state, 'failed');
        assert.match(job.error!, /^Uploaded, but the reader could not fetch the book: Protected Content is not signed in/);
        assert.ok((await listing(mock, '/')).includes('Gettysburg-Loan.acsm'), 'a failed fulfillment keeps the .acsm');
        assert.equal(mock.uploads(), 1);

        useUploadStore.getState().retryJob(id);
        await waitUntil(() => jobs().find(j => j.id === id)?.status === 'uploading');
        await waitUntil(settled(id));
        job = jobs().find(j => j.id === id)!;
        assert.equal(job.status, 'failed', 'not a conflict: the existing .acsm is reused');
        assert.equal(mock.uploads(), 1, 'retry must not upload the .acsm again');
        assert.match(mock.output(), /job 2 queued: protected-content\/fulfill/);
      } finally { useUploadStore.setState({ jobs: [] }); await stopMock(mock); }
    });

    for (const [mode, firmware, reason] of [
      ['absent', '2.0.0', /install Protected Content from Plugin Hub/],
      // 2.0.0 lists no plugins while disabled, so this cannot be told apart from absent.
      ['disabled', '2.0.0', /turn on Settings → Connectivity → Plugins/],
      ['activated', '1.6.5', /firmware 2\.0\.0 or later/],
    ] as const) {
      await t.test(`${mode} plugin on ${firmware}: the .acsm is uploaded and the job explains the next step`, async () => {
        const mock = await startMock(mode, firmware);
        const loads = runnerLoads;
        try {
          const id = queueAcsm();
          await waitUntil(settled(id));
          const job = jobs().find(j => j.id === id)!;
          assert.equal(job.status, 'completed', job.error);
          assert.equal(job.fulfillment?.state, 'skipped');
          assert.match(job.fulfillment!.message!, reason);
          assert.deepEqual(await listing(mock, '/Library'), ['Gettysburg-Loan.acsm']);
          assert.equal(runnerLoads, loads, 'no runner page without a job');
          assert.doesNotMatch(mock.output(), /queued: protected-content/);
          if (firmware === '1.6.5') assert.doesNotMatch(mock.output(), /\/api\/plugins/, 'no plugin requests before 2.0.0');
        } finally { useUploadStore.setState({ jobs: [] }); await stopMock(mock); }
      });
    }

    await t.test('service: a runner that never claims the job, a failed runner page, and long paths', async () => {
      const mock = await startMock('activated');
      const ip = '127.0.0.1';
      const missing = '/Stage/missing.acsm';
      try {
        runnerEnabled = false;
        await assert.rejects(
          fulfillment.fulfillUploadedAcsm(ip, missing, '2.0.0', { pollIntervalMs: 50, startTimeoutMs: 300 }),
          /did not start fetching the book/,
        );
        // Once a poll shows the reader never claimed the job, the runner closes.
        await waitUntil(() => usePluginRunnerStore.getState().users === 0);
        assert.equal(usePluginRunnerStore.getState().url, null);

        const pending = fulfillment.fulfillUploadedAcsm(ip, missing, '2.0.0', { pollIntervalMs: 50 });
        await waitUntil(() => usePluginRunnerStore.getState().url !== null);
        usePluginRunnerStore.getState().reportLoadError('net::ERR_CONNECTION_REFUSED');
        await assert.rejects(pending, /plugin page did not open: net::ERR_CONNECTION_REFUSED/);
        assert.equal(usePluginRunnerStore.getState().loadError, null, 'a released runner forgets its load error');

        await assert.rejects(
          fulfillment.fulfillUploadedAcsm(ip, `/${'x'.repeat(200)}.acsm`, '2.0.0'),
          /too long for a plugin job/,
        );
        assert.doesNotMatch(mock.output(), /queued: protected-content\/fulfill \{"path":"\/x/);

        runnerEnabled = true;
        // The two abandoned jobs are still pending on the reader. This run
        // executes them too; its own job reports the plugin's error.
        await assert.rejects(
          fulfillment.fulfillUploadedAcsm(ip, missing, '2.0.0', { pollIntervalMs: 50 }),
          /could not read \/Stage\/missing\.acsm \(HTTP 404\)/,
        );
        assert.match(mock.output(), /job 3 error/);
      } finally {
        runnerEnabled = true;
        await stopMock(mock);
      }
    });

    await t.test('cancel stops waiting, keeps the job id and lets the next upload start', async () => {
      const mock = await startMock('activated');
      runnerEnabled = false; // keep the first job waiting on the reader
      try {
        const first = queueAcsm('/One');
        await waitUntil(() => jobs().find(j => j.id === first)?.fulfillment?.jobId !== undefined);
        const second = queueAcsm('/Two');
        queue.cancelCurrentUploadJob();
        assert.equal(jobs().find(j => j.id === first)?.status, 'cancelled');
        await waitUntil(() => jobs().find(j => j.id === first)?.fulfillment?.state === 'failed');
        const stopped = jobs().find(j => j.id === first)!;
        assert.equal(stopped.status, 'cancelled', 'a late poll does not revive it');
        assert.equal(stopped.fulfillment?.jobId, 1, 'Retry can follow the job the reader still holds');
        assert.equal(stopped.fulfillment?.remotePath, '/One/Gettysburg-Loan.acsm');
        await waitUntil(() => jobs().find(j => j.id === second)?.fulfillment?.state === 'running');
        runnerEnabled = true;
        await waitUntil(settled(second));
        assert.equal(jobs().find(j => j.id === second)?.status, 'completed');
        await waitUntil(() => usePluginRunnerStore.getState().users === 0);
        // The reader finished the abandoned job as well once a runner was open.
        assert.deepEqual(await listing(mock, '/One'), [FETCHED_BOOK]);
        assert.deepEqual(await listing(mock, '/Two'), [FETCHED_BOOK]);

        // Retry follows job 1, which already fetched the book, instead of
        // uploading the .acsm again or submitting a job that cannot find it.
        useUploadStore.getState().retryJob(first);
        await waitUntil(settled(first));
        const retried = jobs().find(j => j.id === first)!;
        assert.equal(retried.status, 'completed', retried.error);
        assert.equal(retried.fulfillment?.state, 'done');
        assert.equal(mock.uploads(), 2);
        assert.doesNotMatch(mock.output(), /job 3 queued/);
      } finally {
        runnerEnabled = true;
        useUploadStore.setState({ jobs: [] });
        await stopMock(mock);
      }
    });

    await t.test('stopping while the reader runs the action keeps the runner open until it finishes', async () => {
      const mock = await startMock('activated');
      runnerHold = true;
      try {
        const id = queueAcsm('/Held');
        await waitUntil(() => jobs().find(j => j.id === id)?.fulfillment?.phase === 'fetching');
        queue.cancelCurrentUploadJob();
        await waitUntil(() => jobs().find(j => j.id === id)?.fulfillment?.state === 'failed');
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.ok(usePluginRunnerStore.getState().url, 'the claimed action keeps its runner');
        runnerHold = false;
        await waitUntil(() => usePluginRunnerStore.getState().users === 0);
        assert.deepEqual(await listing(mock, '/Held'), [FETCHED_BOOK]);
      } finally {
        runnerHold = false;
        useUploadStore.setState({ jobs: [] });
        await stopMock(mock);
      }
    });

    await t.test('status timeouts during a download do not abort it', async () => {
      const mock = await startMock('activated');
      runnerHold = true;
      try {
        const id = queueAcsm('/Slow');
        await waitUntil(() => jobs().find(j => j.id === id)?.fulfillment?.phase === 'fetching');
        let failures = 0;
        statusOverride = () => { failures++; throw new TypeError('Network request failed'); };
        await waitUntil(() => failures >= 8, 30000);
        assert.equal(jobs().find(j => j.id === id)?.status, 'uploading', 'still waiting after repeated timeouts');
        statusOverride = null;
        runnerHold = false;
        await waitUntil(settled(id));
        assert.equal(jobs().find(j => j.id === id)?.status, 'completed', jobs().find(j => j.id === id)?.error);
      } finally {
        statusOverride = null;
        runnerHold = false;
        useUploadStore.setState({ jobs: [] });
        await stopMock(mock);
      }
    });

    await t.test('a retry on another reader uploads normally instead of reusing its token', async () => {
      const mock = await startMock('unactivated');
      try {
        const id = queueAcsm('/');
        await waitUntil(settled(id));
        assert.equal(jobs().find(j => j.id === id)?.fulfillment?.state, 'failed');
        const { connectedDevice, deviceStatus } = useDeviceStore.getState();
        useDeviceStore.getState().connectDevice({ ...connectedDevice!, hostname: 'Another reader' });
        useDeviceStore.getState().updateDeviceStatus(deviceStatus!);
        useUploadStore.getState().retryJob(id);
        await waitUntil(settled(id));
        const job = jobs().find(j => j.id === id)!;
        assert.equal(job.status, 'conflict', 'the same-named file there is a conflict, not this token');
        assert.equal(job.fulfillment, undefined);
        assert.doesNotMatch(mock.output(), /job 2 queued/);
      } finally { useUploadStore.setState({ jobs: [] }); await stopMock(mock); }
    });

    await t.test('service: an unknown job after running, a result read after the deadline, UTF-8 limits', async () => {
      const mock = await startMock('activated');
      const ip = '127.0.0.1';
      try {
        runnerHold = true;
        const vanished = fulfillment.fulfillUploadedAcsm(ip, '/Stage/missing.acsm', '2.0.0', { pollIntervalMs: 50 });
        const rejected = assert.rejects(vanished, /without a result the app could read/);
        // Let the runner claim the job and the service observe it running.
        await waitUntil(() => usePluginRunnerStore.getState().url !== null);
        await new Promise(resolve => setTimeout(resolve, 400));
        statusOverride = () => new Response(JSON.stringify({ id: 1, state: 'unknown', result: null }), {
          headers: { 'Content-Type': 'application/json' },
        });
        await rejected;
        statusOverride = null;
        runnerHold = false;

        // The job finishes before the first poll, which is already past both
        // deadlines; its result is still reported.
        await assert.rejects(
          fulfillment.fulfillUploadedAcsm(ip, '/Stage/missing.acsm', '2.0.0', {
            pollIntervalMs: 1500, startTimeoutMs: 1, timeoutMs: 1,
          }),
          /could not read \/Stage\/missing\.acsm/,
        );

        // 90 two-byte characters fit in 191 UTF-16 units but not 191 bytes.
        assert.equal(fulfillment.utf8ByteLength('é'), 2);
        assert.equal(fulfillment.utf8ByteLength('📚'), 4);
        await assert.rejects(
          fulfillment.fulfillUploadedAcsm(ip, `/${'é'.repeat(90)}.acsm`, '2.0.0'),
          /too long for a plugin job/,
        );
        const tooLong = await fetch(`${mock.base}/api/plugin-jobs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plugin: 'protected-content', action: 'fulfill', args: { path: `/${'é'.repeat(90)}.acsm` } }),
        });
        assert.equal(tooLong.status, 400, 'the mock measures args in bytes like the firmware');
      } finally {
        statusOverride = null;
        runnerHold = false;
        await waitUntil(() => usePluginRunnerStore.getState().users === 0);
        await stopMock(mock);
      }
    });
  } finally {
    stopQueue();
    clearInterval(runnerTimer);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('persistence keeps fetching .acsm jobs and their results across relaunches', () => {
  const partialize = useUploadStore.persist.getOptions().partialize!;
  const base = {
    fileName: 'Loan.acsm', fileUri: 'file:///x', fileSize: 1, destinationPath: '/P', progress: 1, bytesTransferred: 1, createdAt: 1,
  };
  const target = { remotePath: '/P/Loan.acsm', readerKey: 'Mock@127.0.0.1', jobId: 4, readerBootedAt: 10 };
  const state = {
    ...useUploadStore.getState(),
    jobs: [
      { ...base, id: 'fetching', status: 'uploading' as const, fulfillment: { ...target, state: 'running' as const, phase: 'fetching' as const, phaseStartedAt: 5 } },
      { ...base, id: 'fetched', status: 'completed' as const, fulfillment: { state: 'done' as const, message: 'Fetched “Book”' } },
      { ...base, id: 'notice', status: 'completed' as const, fulfillment: { state: 'skipped' as const, message: 'Install' } },
      { ...base, fileName: 'Book.epub', id: 'book', status: 'completed' as const },
      { ...base, fileName: 'Book.epub', id: 'sending', status: 'uploading' as const },
    ],
  };
  const persisted = (partialize(state) as { jobs: import('../types/upload').UploadJob[] }).jobs;
  assert.deepEqual(persisted.map(j => [j.id, j.status]), [['fetching', 'pending'], ['fetched', 'completed'], ['notice', 'completed']]);
  assert.deepEqual(persisted[0].fulfillment, { ...target, state: 'running', phase: undefined, phaseStartedAt: undefined });
  assert.equal(persisted[1].fulfillment?.message, 'Fetched “Book”');
});

test('ACSM job card progress advances through both steps without finishing early', () => {
  const { acsmJobProgress, formatElapsed } = require('../utils/fulfillment-progress') as typeof import('../utils/fulfillment-progress');
  const t0 = 1_000_000;
  const base = {
    id: 'j', fileName: 'Loan.acsm', fileUri: 'file:///x', fileSize: 1800, destinationPath: '/Protected Content',
    status: 'uploading' as const, progress: 1, bytesTransferred: 1800, createdAt: t0,
  };
  const running = (phase: 'requesting' | 'waiting' | 'fetching') =>
    ({ ...base, fulfillment: { state: 'running' as const, phase, phaseStartedAt: t0 } });

  assert.equal(acsmJobProgress({ ...base, fileName: 'Book.epub' }, t0), undefined, 'only .acsm jobs');
  assert.equal(acsmJobProgress({ ...base, status: 'completed' }, t0), undefined, 'only while active');

  const steps = [
    acsmJobProgress({ ...base, progress: 0.5 }, t0)!,
    acsmJobProgress(base, t0)!,
    acsmJobProgress(running('requesting'), t0)!,
    acsmJobProgress(running('waiting'), t0 + 10_000)!,
    acsmJobProgress(running('fetching'), t0)!,
    acsmJobProgress(running('fetching'), t0 + 30_000)!,
    acsmJobProgress(running('fetching'), t0 + 120_000)!,
    acsmJobProgress(running('fetching'), t0 + 60 * 60_000)!,
  ];
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].value >= steps[i - 1].value, `step ${i} moves forward (${steps[i - 1].value} → ${steps[i].value})`);
  }
  assert.ok(steps.every(s => s.value < 0.96), 'the bar waits for the reader before it completes');
  assert.deepEqual(steps.map(s => s.label), [
    'Sending', 'Sending', 'Requesting', 'Starting', 'Fetching Book', 'Fetching Book', 'Fetching Book', 'Fetching Book',
  ]);
  assert.match(steps[0].detail, /^Step 1 of 2/);
  assert.match(steps[5].detail, /^Step 2 of 2: The reader is downloading the book/);
  assert.equal(formatElapsed(steps[5].elapsedSeconds!), '0:30');
  assert.equal(formatElapsed(125.9), '2:05');
});

test('Android share intents accept .acsm files shared as generic binary data', async () => {
  let shared: Array<Record<string, unknown>> = [];
  const intercept: Loader = function (this: unknown, id, parent, isMain) {
    if (id === 'react-native') return { Platform: { OS: 'android' } };
    if (id === 'expo-file-system') return { File: NativeFile };
    if (id === '@/modules/share-intent-receiver') return {
      getSharedItems: () => shared, clearIntent: () => { shared = []; }, addShareIntentListener: () => null,
    };
    if (id === '@/services/url-article-extractor') return {};
    if (id === '@/services/webview-article-extractor') return {};
    if (id === '@/services/epub-generator') return {};
    if (id === '@react-native-async-storage/async-storage') return {
      getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
    };
    if (id === '@/services/logger' || id === './logger') return { log: () => {} };
    return originalLoad.call(this, id, parent, isMain);
  };
  loader._load = intercept;
  let androidImport: typeof import('../services/android-share-import');
  try { androidImport = require('../services/android-share-import'); } finally { loader._load = originalLoad; }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crosspoint-android-share-'));
  const cached = (name: string) => {
    const file = path.join(dir, `${Date.now()}-${name}`);
    fs.writeFileSync(file, 'x');
    return pathToFileURL(file).href;
  };
  try {
    useUploadStore.setState({ jobs: [] });
    const rejected = cached('archive.zip');
    shared = [
      { type: 'file', name: 'Novel.epub', uri: cached('Novel.epub'), size: 1, mimeType: 'application/epub+zip' },
      { type: 'file', name: 'Loan.acsm', uri: cached('Loan.acsm'), size: 1, mimeType: 'application/octet-stream' },
      { type: 'file', name: 'Loan2.ACSM', uri: cached('Loan2.ACSM'), size: 1, mimeType: 'application/vnd.adobe.adept+xml' },
      { type: 'file', name: 'archive.zip', uri: rejected, size: 1, mimeType: 'application/octet-stream' },
      // Some providers omit the extension from an EPUB's display name.
      { type: 'file', name: 'Untitled', uri: cached('Untitled'), size: 1, mimeType: 'application/epub+zip' },
    ];
    assert.equal(await androidImport.importAndroidSharedFiles(), 4);
    assert.deepEqual(jobs().map(j => [j.fileName, j.destinationPath]), [
      ['Novel.epub', '/'], ['Loan.acsm', '/Protected Content'], ['Loan2.ACSM', '/Protected Content'], ['Untitled', '/'],
    ]);
    assert.equal(fs.existsSync(fileURLToPath(rejected)), false, 'an ignored share leaves no cached copy');
  } finally {
    useUploadStore.setState({ jobs: [] });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
