#!/usr/bin/env npx tsx
/**
 * Runs the app's actual upload queue, WebSocket uploader, device API and
 * plugin-job client against a running CrossPoint firmware simulator. A
 * Puppeteer Chromium page loads the firmware's own /plugins-run page while the app
 * requests a runner, standing in for the native hidden WebView.
 *
 *   npx tsx scripts/acsm-simulator-check.ts --http 18080 --ws 18081 --out <dir> [--expect done|skipped|failed]
 *
 * See docs/testing/firmware-simulator.md and test-fixtures/acsm/README.md.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Module from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { DeviceStatus } from '../types/device';

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const httpPort = Number(arg('--http', '18080'));
const wsPort = Number(arg('--ws', String(httpPort + 1)));
const outDir = path.resolve(arg('--out', fs.mkdtempSync(path.join(os.tmpdir(), 'acsm-sim-'))));
const expected = arg('--expect', 'done');
const base = `http://127.0.0.1:${httpPort}`;
const projectRoot = path.resolve(__dirname, '..');
fs.mkdirSync(outDir, { recursive: true });

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

const logLines: string[] = [];
type Loader = (id: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id, parent, isMain) {
  if (id === 'expo-file-system') return { File: NativeFile, Directory: class {}, Paths: { cache: outDir } };
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === '@react-native-async-storage/async-storage') return {
    getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
  };
  if (id === '@/services/logger' || id === './logger') return {
    log: (category: string, message: string) => logLines.push(`${new Date().toISOString()} [${category}] ${message}`),
  };
  return originalLoad.call(this, id, parent, isMain);
};
const { useDeviceStore } = require('../stores/device-store') as typeof import('../stores/device-store');
const { useUploadStore } = require('../stores/upload-store') as typeof import('../stores/upload-store');
const { usePluginRunnerStore } = require('../services/plugin-runner') as typeof import('../services/plugin-runner');
const queue = require('../services/upload-queue') as typeof import('../services/upload-queue');
loader._load = originalLoad;

async function main() {
  const puppeteer = require('puppeteer') as typeof import('puppeteer');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const runnerConsole: string[] = [];
  page.on('console', (m: { text(): string }) => runnerConsole.push(m.text()));
  let runnerOpened = 0;
  usePluginRunnerStore.subscribe(async (state, prev) => {
    if (state.url && state.sessionId !== prev.sessionId) {
      runnerOpened++;
      const response = await page.goto(state.url);
      if (!response?.ok()) usePluginRunnerStore.getState().reportLoadError(`HTTP ${response?.status()}`);
    } else if (!state.url && prev.url) {
      await page.goto('about:blank');
    }
  });

  const status = await (await fetch(`${base}/api/status`)).json() as DeviceStatus;
  useDeviceStore.getState().connectDevice({ ip: '127.0.0.1', hostname: 'Simulator', httpPort, wsPort });
  useDeviceStore.getState().updateDeviceStatus(status);
  const pluginsBefore = await (await fetch(`${base}/api/plugins`)).json();

  const local = path.join(outDir, 'Gettysburg-Loan.acsm');
  fs.copyFileSync(path.join(projectRoot, 'test-fixtures/acsm/Gettysburg-Loan.acsm'), local);
  const stop = queue.startQueueProcessor();
  useUploadStore.getState().addJob({
    fileName: 'Gettysburg-Loan.acsm', fileUri: pathToFileURL(local).href,
    fileSize: fs.statSync(local).size, destinationPath: '/Library', jobType: 'book',
  });
  const id = useUploadStore.getState().jobs[0].id;
  const job = () => useUploadStore.getState().jobs.find(j => j.id === id)!;
  const deadline = Date.now() + 120_000;
  while (!['completed', 'failed', 'conflict', 'cancelled'].includes(job().status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
  }
  stop();

  const library = await (await fetch(`${base}/api/files?path=/Library`)).json() as Array<{ name: string; size: number }>;
  const book = library.find(f => f.name.endsWith('.epub'));
  let downloadedSha = null;
  if (book) {
    const bytes = Buffer.from(await (await fetch(`${base}/download?path=${encodeURIComponent(`/Library/${book.name}`)}`)).arrayBuffer());
    downloadedSha = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  }
  const report = {
    firmware: status.version, device: status.device, pluginsBefore,
    job: job(), runnerOpened, runnerOpenAfter: usePluginRunnerStore.getState().url,
    library, downloadedSha,
    fixtureSha: require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(projectRoot, 'test-mock-filesystem/Formats/Gettysburg-Address.epub'))).digest('hex'),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'app.log'), logLines.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'runner-console.log'), runnerConsole.join('\n') + '\n');
  await browser.close();
  console.log(JSON.stringify({ status: report.job.status, fulfillment: report.job.fulfillment, error: report.job.error, library }, null, 2));

  if (expected === 'done') {
    assert.equal(report.job.status, 'completed');
    assert.equal(report.job.fulfillment?.state, 'done');
    assert.deepEqual(library.map(f => f.name), ['The Gettysburg Address.epub']);
    assert.equal(downloadedSha, report.fixtureSha);
  } else if (expected === 'skipped') {
    assert.equal(report.job.status, 'completed');
    assert.equal(report.job.fulfillment?.state, 'skipped');
    assert.deepEqual(library.map(f => f.name), ['Gettysburg-Loan.acsm']);
  } else {
    assert.equal(report.job.status, 'failed');
    assert.equal(report.job.fulfillment?.state, 'failed');
  }
  console.log(`OK (${expected}); evidence in ${outDir}`);
}

main().catch(err => { console.error(err); process.exit(1); });
