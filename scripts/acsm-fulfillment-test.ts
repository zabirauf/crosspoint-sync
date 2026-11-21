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
      try {
        const id = queueAcsm();
        await waitUntil(() => jobs().find(j => j.id === id)?.fulfillment?.state === 'running');
        const active = jobs().find(j => j.id === id)!;
        assert.equal(active.status, 'uploading', 'the job holds the queue while the reader fetches');
        assert.equal(active.fulfillment?.remotePath, '/Library/Gettysburg-Loan.acsm');
        await waitUntil(() => !!usePluginRunnerStore.getState().url?.endsWith('/plugins-run'));

        await waitUntil(settled(id));
        const job = jobs().find(j => j.id === id)!;
        assert.equal(job.status, 'completed', job.error);
        assert.equal(job.fulfillment?.state, 'done');
        assert.equal(job.fulfillment?.message, `Fetched “The Gettysburg Address” to /Library/${FETCHED_BOOK}`);
        assert.deepEqual(await listing(mock, '/Library'), [FETCHED_BOOK], 'the plugin replaces the .acsm with the book');
        assert.equal(usePluginRunnerStore.getState().url, null, 'the runner page closes after the job');
        assert.match(mock.output(), /job 1 queued: protected-content\/fulfill \{"path":"\/Library\/Gettysburg-Loan\.acsm"\}/);
      } finally { useUploadStore.setState({ jobs: [] }); await stopMock(mock); }
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
        assert.equal(usePluginRunnerStore.getState().users, 0, 'the runner is released after a failure');
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

    await t.test('cancel stops waiting, releases the runner and lets the next upload start', async () => {
      const mock = await startMock('activated');
      runnerEnabled = false; // keep the first job waiting on the reader
      try {
        const first = queueAcsm('/One');
        await waitUntil(() => jobs().find(j => j.id === first)?.fulfillment?.state === 'running');
        const second = queueAcsm('/Two');
        queue.cancelCurrentUploadJob();
        assert.equal(jobs().find(j => j.id === first)?.status, 'cancelled');
        await waitUntil(() => jobs().find(j => j.id === first)?.fulfillment === undefined);
        assert.equal(jobs().find(j => j.id === first)?.status, 'cancelled', 'a late poll does not revive it');
        await waitUntil(() => jobs().find(j => j.id === second)?.fulfillment?.state === 'running');
        runnerEnabled = true;
        await waitUntil(settled(second));
        assert.equal(jobs().find(j => j.id === second)?.status, 'completed');
        assert.equal(usePluginRunnerStore.getState().users, 0);
        // The reader finished the abandoned job as well once a runner was open.
        assert.deepEqual(await listing(mock, '/One'), [FETCHED_BOOK]);
        assert.deepEqual(await listing(mock, '/Two'), [FETCHED_BOOK]);
      } finally {
        runnerEnabled = true;
        useUploadStore.setState({ jobs: [] });
        await stopMock(mock);
      }
    });
  } finally {
    stopQueue();
    clearInterval(runnerTimer);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
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
    assert.deepEqual(jobs().map(j => j.fileName), ['Novel.epub', 'Loan.acsm', 'Loan2.ACSM', 'Untitled']);
    assert.equal(fs.existsSync(fileURLToPath(rejected)), false, 'an ignored share leaves no cached copy');
  } finally {
    useUploadStore.setState({ jobs: [] });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
