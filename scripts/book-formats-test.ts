#!/usr/bin/env npx tsx
/** Tests real picker, file rows, device API, and WebSocket uploader.
 * Only native modules/storage are replaced; HTTP/WS use a real mock server.
 * Run: npm run test:books
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
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import WebSocket from 'ws';
import { isSupportedBook } from '../constants/BookFormats';
import type { DeviceFile } from '../types/device';
import type { DocumentPickerOptions, DocumentPickerResult } from 'expo-document-picker';

const projectRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(projectRoot, 'test-mock-filesystem/Formats');
const fixtureNames = ['Gettysburg-Address.epub', 'Gettysburg-Address.xtc', 'Gettysburg-Address.xtch'];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crosspoint-book-formats-'));
const jobs: Array<{ fileName: string; fileUri: string; fileSize: number; destinationPath: string }> = [];
const alerts: string[] = [];
let pickerResult: DocumentPickerResult = { canceled: true, assets: null };
let pickerOptions: DocumentPickerOptions | undefined;
let httpPort = 0;
let isDark = false;

class NativeFile {
  readonly uri: string;
  constructor(uri: string) { this.uri = uri; }
  get size() { return fs.statSync(fileURLToPath(this.uri)).size; }
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
  static async downloadFileAsync(url: string) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const name = path.basename(new URL(url).searchParams.get('path')!);
    const destination = path.join(scratch, name);
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    return new NativeFile(pathToFileURL(destination).href);
  }
}

// tsx loads application TS through CommonJS. Intercept only native boundaries
// while importing the actual code, then restore Node's module loader.
type Loader = (id: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Loader };
const originalLoad = loader._load;
loader._load = function (id, parent, isMain) {
  if (id === 'expo-document-picker') return {
    getDocumentAsync: async (options: DocumentPickerOptions) => { pickerOptions = options; return pickerResult; },
  };
  if (id === 'expo-file-system') return { File: NativeFile, Directory: class {}, Paths: { cache: scratch } };
  if (id === 'react-native') return {
    Alert: { alert: (_title: string, message: string) => alerts.push(message) },
    Platform: { OS: 'android' },
    useColorScheme: () => isDark ? 'dark' : 'light',
    Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  };
  if (id === 'tamagui') return { XStack: 'XStack', YStack: 'YStack', Text: 'Text' };
  if (id === '@expo/vector-icons') return { FontAwesome: 'FontAwesome' };
  if (id === '@/stores/upload-store') return {
    useUploadStore: (select: (state: unknown) => unknown) => select({ addJob: (job: typeof jobs[number]) => jobs.push(job) }),
  };
  if (id === '@/stores/device-store') return {
    useDeviceStore: { getState: () => ({ connectedDevice: { httpPort }, deviceStatus: { version: '1.3.0' } }) },
  };
  if (id === '@/services/logger' || id === './logger') return { log: () => {} };
  return originalLoad.call(this, id, parent, isMain);
};
let useDocumentPicker: typeof import('../hooks/use-document-picker').useDocumentPicker;
let FileRow: typeof import('../components/FileRow').FileRow;
let api: typeof import('../services/device-api');
let uploadFileViaWebSocket: typeof import('../services/websocket-upload').uploadFileViaWebSocket;
try {
  ({ useDocumentPicker } = require('../hooks/use-document-picker'));
  ({ FileRow } = require('../components/FileRow'));
  api = require('../services/device-api');
  ({ uploadFileViaWebSocket } = require('../services/websocket-upload'));
} finally {
  loader._load = originalLoad;
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// tsx follows Expo's jsx: react setting; Metro normally supplies React via Babel.
(globalThis as Record<string, unknown>).React = React;

async function freePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startMock(dataDir: string): Promise<{ process: ChildProcess; wsPort: number }> {
  httpPort = await freePort();
  const wsPort = await freePort();
  const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'scripts/mock-device-server.ts',
    '--http-port', String(httpPort), '--ws-port', String(wsPort), '--data-dir', dataDir],
  { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', chunk => { output += chunk; });
  child.stderr?.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      if ((await fetch(`http://127.0.0.1:${httpPort}/api/status`)).ok) return { process: child, wsPort };
    } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`Mock failed to start: ${output}`);
}

async function stopMock(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('supported book formats', async t => {
  try {
    await t.test('case-insensitive extensions reject unsupported and misleading suffixes', () => {
      for (const name of ['novel.epub', 'novel.XTC', 'novel.XtCh']) assert.ok(isSupportedBook(name), name);
      for (const name of ['novel.pdf', 'novel.xtc.zip', 'novel.epub.exe', 'xtch', 'novel.xtch.backup', '']) {
        assert.equal(isSupportedBook(name), false, name);
      }
    });

    let pick!: ReturnType<typeof useDocumentPicker>['pickAndQueueFiles'];
    let harness!: ReactTestRenderer;
    function PickerHarness() { pick = useDocumentPicker().pickAndQueueFiles; return null; }
    await act(async () => { harness = create(React.createElement(PickerHarness)); });
    await t.test('picker cancellation leaves the queue untouched', async () => {
      await pick('/Books');
      assert.equal(jobs.length, 0);
      assert.equal(alerts.length, 0);
    });
    await t.test('picker accepts EPUB/XTC/XTCH regardless of MIME and reports skipped files', async () => {
      pickerResult = { canceled: false, assets: [
        ...fixtureNames.map((name, index) => ({
          name: index === 1 ? name.toUpperCase() : name,
          uri: pathToFileURL(path.join(fixturesDir, name)).href,
          mimeType: ['application/epub+zip', 'application/x-xtc', 'application/octet-stream'][index],
          lastModified: 0,
        })),
        { name: 'notes.pdf', uri: 'file:///must-not-be-read.pdf', lastModified: 0 },
      ] };
      await pick('/Books');
      assert.equal(pickerOptions?.type, '*/*');
      assert.equal(pickerOptions?.multiple, true);
      assert.equal(pickerOptions?.copyToCacheDirectory, true);
      assert.equal(jobs.length, 3);
      jobs.forEach((job, index) => {
        assert.equal(job.fileName.toLowerCase(), fixtureNames[index].toLowerCase());
        assert.equal(job.destinationPath, '/Books');
        assert.equal(job.fileSize, fs.statSync(path.join(fixturesDir, fixtureNames[index])).size);
      });
      assert.match(alerts[0], /Skipped 1/);
      assert.match(alerts[0], /\.epub, \.xtc, \.xtch/);
    });
    await t.test('picker rejects an entirely unsupported selection visibly', async () => {
      pickerResult = { canceled: false, assets: [{ name: 'notes.pdf', uri: 'file:///must-not-be-read.pdf', lastModified: 0 }] };
      await pick('/Books');
      assert.equal(jobs.length, 3);
      assert.equal(alerts.length, 2);
    });
    await act(async () => { harness.unmount(); });

    await t.test('real file rows use book icons in both themes while extension-named folders stay folders', async () => {
      for (const dark of [false, true]) {
        isDark = dark;
        for (const file of [
          ...fixtureNames.map(name => ({ name, size: 10, isDirectory: false, isEpub: name.endsWith('.epub') })),
          { name: 'Folder.xtc', size: 0, isDirectory: true, isEpub: false },
          { name: 'notes.txt', size: 10, isDirectory: false, isEpub: false },
        ]) {
          let row!: ReactTestRenderer;
          await act(async () => { row = create(React.createElement(FileRow, { file, onPress: () => {} })); });
          const icon = row.root.findByProps({ testID: `Library.FileRow.${file.name}.Icon` });
          assert.equal(icon.props.name, file.isDirectory ? 'folder' : file.name.endsWith('.txt') ? 'file-o' : 'book');
          if (isSupportedBook(file.name) && !file.isDirectory) assert.equal(icon.props.color, dark ? '#81d4fa' : '#1a73e8');
          await act(async () => { row.unmount(); });
        }
      }
    });

    // Validate fixture structure against firmware XtcTypes.h, not just filenames.
    await t.test('XTC/XTCH fixtures contain real pages and complete page tables', () => {
      for (const extension of ['xtc', 'xtch']) {
        const data = fs.readFileSync(path.join(fixturesDir, `Gettysburg-Address.${extension}`));
        assert.equal(data.subarray(0, 4).toString(), extension === 'xtc' ? 'XTC\0' : 'XTCH');
        const count = data.readUInt16LE(6);
        assert.ok(count > 0);
        const table = Number(data.readBigUInt64LE(24));
        for (let i = 0; i < count; i++) {
          const entry = table + i * 16;
          const offset = Number(data.readBigUInt64LE(entry));
          const size = data.readUInt32LE(entry + 8);
          assert.ok(offset + size <= data.length);
          assert.equal(data.subarray(offset, offset + 4).toString(), extension === 'xtc' ? 'XTG\0' : 'XTH\0');
          assert.equal(data.readUInt16LE(entry + 12), 480);
          assert.equal(data.readUInt16LE(entry + 14), 800);
          assert.equal(size, 22 + (extension === 'xtc' ? 48000 : 96000));
        }
      }
    });

    const diskRoot = path.join(scratch, 'device');
    fs.mkdirSync(diskRoot);
    fs.cpSync(fixturesDir, path.join(diskRoot, 'Formats'), { recursive: true });
    fs.mkdirSync(path.join(diskRoot, 'Formats/Folder.xtc'));
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
    try {
      for (const [backend, dataDir] of [['disk', diskRoot], ['memory', '']]) {
        await t.test(`${backend}: actual API lists, uploads, downloads, renames and moves every format`, async () => {
          const mock = await startMock(dataDir);
          try {
            const files = await api.getFiles('127.0.0.1', '/Formats');
            for (const name of fixtureNames) {
              const fixture = fs.readFileSync(path.join(fixturesDir, name));
              const entry = files.find(file => file.name === name)!;
              assert.ok(entry, `${backend} missing ${name}`);
              assert.equal(entry.size, fixture.length);
              assert.equal(entry.isEpub, name.endsWith('.epub'), 'preserve firmware EPUB-only meaning');
              const response = await fetch(`http://127.0.0.1:${httpPort}/download?path=${encodeURIComponent(`/Formats/${name}`)}`);
              assert.equal(response.headers.get('content-type'), name.endsWith('.epub') ? 'application/epub+zip' : 'application/octet-stream');
              assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture);

              // Exercise the actual app uploader with multi-window binary data.
              let progress = 0;
              await new Promise<void>((resolve, reject) => {
                uploadFileViaWebSocket('127.0.0.1', mock.wsPort, pathToFileURL(path.join(fixturesDir, name)).href,
                  `uploaded-${name}`, fixture.length, '/Formats', {
                    onProgress: received => { progress = received; }, onComplete: resolve, onError: reject,
                  });
              });
              assert.equal(progress, fixture.length);
              const uploadedPath = `/Formats/uploaded-${name}`;
              const downloaded = await api.downloadFile('127.0.0.1', uploadedPath);
              assert.deepEqual(fs.readFileSync(fileURLToPath(downloaded)), fixture);
              const renamed = `renamed-${name}`;
              await api.renameFile('127.0.0.1', uploadedPath, renamed);
              await api.createFolder('127.0.0.1', 'Moved', '/');
              await api.moveFile('127.0.0.1', `/Formats/${renamed}`, '/Moved');
              const moved = await api.downloadFile('127.0.0.1', `/Moved/${renamed}`);
              assert.deepEqual(fs.readFileSync(fileURLToPath(moved)), fixture);
              await api.deleteItem('127.0.0.1', `/Moved/${renamed}`, 'file');
              assert.equal((await api.getFiles('127.0.0.1', '/Moved')).length, 0);
            }
            const folder: DeviceFile | undefined = files.find(file => file.name === 'Folder.xtc');
            if (backend === 'disk') assert.equal(folder?.isEpub, false);
          } finally { await stopMock(mock.process); }
        });
      }
    } finally { globalThis.WebSocket = originalWebSocket; }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
