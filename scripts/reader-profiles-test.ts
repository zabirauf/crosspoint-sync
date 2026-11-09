import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import UPNG from 'upng-js';
import { getReaderProfile, getReaderName } from '../constants/ReaderProfiles';
import { fitCropFrame, getSourceCrop } from '../utils/crop-geometry';
import type { DeviceFile, DeviceStatus } from '../types/device';

const written = new Map<string, Uint8Array>();
const actions: any[] = [];
class MemoryFile {
  uri: string;
  constructor(...parts: any[]) { this.uri = parts.map(p => p.uri ?? p).join('/'); }
  get exists() { return written.has(this.uri); }
  write(data: Uint8Array) { written.set(this.uri, data); }
}
const pending: { ip: string; path: string; resolve: (files: DeviceFile[]) => void; reject: (error: Error) => void }[] = [];
const loader = Module as any;
const originalLoad = loader._load;
loader._load = function(id: string, parent: unknown, isMain: boolean) {
  if (id === 'react-native') return {
    Platform: { OS: 'ios' }, StyleSheet: { create: (styles: unknown) => styles },
    Image: { getSize: (_uri: string, loaded: (width: number, height: number) => void) => loaded(1600, 1200) },
    ActivityIndicator: 'ActivityIndicator', View: 'View', Alert: { alert: (...args: unknown[]) => assert.fail(JSON.stringify(args)) },
  };
  if (id === 'tamagui') return { YStack: 'YStack', XStack: 'XStack', Text: 'Text', Button: 'Button' };
  if (id === 'expo-router') return { router: { back: () => {} }, useLocalSearchParams: () => ({ imageUri: 'file:///image.png' }) };
  if (id === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' };
  if (id === 'expo-status-bar') return { StatusBar: 'StatusBar' };
  if (id === 'react-native-gesture-handler') {
    const gesture = () => { const chain = { onUpdate: () => chain, onEnd: () => chain, onChange: () => chain }; return chain; };
    return { Gesture: { Pinch: gesture, Pan: gesture, Simultaneous: () => ({}) }, GestureDetector: 'GestureDetector' };
  }
  if (id === 'react-native-reanimated') return {
    __esModule: true, default: { Image: 'AnimatedImage' },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => unknown) => style(),
  };
  if (id === 'expo-sharing') return {};
  if (id === 'expo-file-system') return { File: MemoryFile, Paths: { document: 'memory:' }, Directory: class {
    uri: string; exists = true;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
  } };
  if (id === 'expo-image-manipulator') return {
    SaveFormat: { PNG: 'png' },
    manipulateAsync: async (_uri: string, requested: any[]) => {
      actions.push(requested);
      const { width, height } = requested[1].resize;
      const rgba = new Uint8Array(width * height * 4).fill(200);
      const png = UPNG.encode([rgba.buffer], width, height, 0);
      return { width, height, base64: Buffer.from(png).toString('base64') };
    },
  };
  if (id === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  if (id === '@/services/device-api') return { getFiles: (ip: string, path: string) => new Promise((resolve, reject) => pending.push({ ip, path, resolve, reject })) };
  if (id === '@/services/logger' || id === './logger') return { log: () => {} };
  return originalLoad.call(this, id, parent, isMain);
};
let store: typeof import('../stores/device-store').useDeviceStore;
let uploads: typeof import('../stores/upload-store').useUploadStore;
let useBrowser: typeof import('../hooks/use-file-browser').useFileBrowser;
let processSleep: typeof import('../services/sleep-background').processAndQueueSleepBackground;
let SleepPreview: typeof import('../app/sleep-preview').default;
(globalThis as any).React = React;
try {
  store = require('../stores/device-store').useDeviceStore;
  uploads = require('../stores/upload-store').useUploadStore;
  useBrowser = require('../hooks/use-file-browser').useFileBrowser;
  processSleep = require('../services/sleep-background').processAndQueueSleepBackground;
  SleepPreview = require('../app/sleep-preview').default;
} finally { loader._load = originalLoad; }
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const file = (name: string): DeviceFile => ({ name, size: 10, isDirectory: false, isEpub: true });
const connect = (ip: string) => store.getState().connectDevice({ ip, hostname: ip, httpPort: 80, wsPort: 81 });

test('reader profiles preserve legacy X4 and never guess another reported model', () => {
  assert.deepEqual(getReaderProfile('X3'), { model: 'X3', width: 528, height: 792 });
  assert.deepEqual(getReaderProfile(' x4 '), { model: 'X4', width: 480, height: 800 });
  assert.equal(getReaderProfile(undefined), getReaderProfile('X4'));
  assert.equal(getReaderProfile('X4 Pro'), null);
  assert.equal(getReaderName('X3', 'crosspoint.local'), 'XTEink X3');
  assert.equal(getReaderName(undefined, 'Legacy reader'), 'Legacy reader');
  assert.equal(getReaderName('Other', 'crosspoint.local'), 'CrossPoint (Other)');
});

test('both reader crops survive resizing and queue real BMPs at native portrait dimensions', async () => {
  for (const model of ['X3', 'X4']) {
    uploads.setState({ jobs: [] });
    const profile = getReaderProfile(model)!;
    const image = { width: 1600, height: 1200 };
    const frames = [{ width: 390, height: 640 }, { width: 900, height: 400 }].map(canvas => fitCropFrame(canvas, profile.width / profile.height));
    const crops = frames.map(frame => getSourceCrop(image, frame, 1.6, { x: 0.1, y: 0.05 }));
    for (const key of ['originX', 'originY', 'width', 'height'] as const) assert.ok(Math.abs(crops[0][key] - crops[1][key]) < 0.0001, key);
    await processSleep('file:///image.png', crops[0], profile);
    assert.deepEqual(actions.at(-1)[1], { resize: { width: profile.width, height: profile.height } });
    const job = uploads.getState().jobs.at(-1)!;
    assert.equal(job.destinationPath, '/sleep');
    assert.equal(job.jobType, 'sleep-background');
    const bmp = Buffer.from(written.get(job.fileUri)!);
    assert.equal(bmp.toString('ascii', 0, 2), 'BM');
    assert.equal(bmp.readInt32LE(18), profile.width);
    assert.equal(Math.abs(bmp.readInt32LE(22)), profile.height);
    assert.equal(bmp.readUInt16LE(28), 24);
    const pixel = bmp.readUInt32LE(10);
    assert.equal(bmp[pixel], bmp[pixel + 1]);
    assert.equal(bmp[pixel + 1], bmp[pixel + 2]);
    assert.equal(bmp.length, job.fileSize);
  }
});

async function mountPreview(status: DeviceStatus | null) {
  let root!: ReactTestRenderer;
  await act(async () => {
    store.setState({ deviceStatus: status });
    uploads.setState({ jobs: [] });
    root = create(React.createElement(SleepPreview));
  });
  await act(async () => root.root.findByProps({ testID: 'SleepPreview.Canvas' }).props.onLayout({
    nativeEvent: { layout: { width: 390, height: 620 } },
  }));
  return root;
}

async function confirmBmp(root: ReactTestRenderer, model: 'X3' | 'X4') {
  const done = root.root.findByProps({ testID: 'SleepPreview.Done' });
  assert.equal(done.props.disabled, false);
  await act(async () => done.props.onPress());
  const job = uploads.getState().jobs.at(-1)!;
  const bmp = Buffer.from(written.get(job.fileUri)!);
  const profile = getReaderProfile(model)!;
  assert.equal(bmp.readInt32LE(18), profile.width);
  assert.equal(Math.abs(bmp.readInt32LE(22)), profile.height);
}

test('offline preview waits for a target and adopts a delayed X3 status before generating its BMP', async () => {
  const root = await mountPreview(null);
  assert.equal(root.root.findByProps({ testID: 'SleepPreview.Done' }).props.disabled, true);
  assert.equal(root.root.findAllByProps({ testID: 'SleepPreview.CropFrame' }).length, 0);
  await act(async () => root.root.findByProps({ testID: 'SleepPreview.Done' }).props.onPress());
  assert.equal(uploads.getState().jobs.length, 0);
  await act(async () => store.getState().updateDeviceStatus({ device: 'X3' } as DeviceStatus));
  assert.equal(root.root.findByProps({ testID: 'SleepPreview.OutputFormat' }).props.children, '528 x 792 · Grayscale output');
  await confirmBmp(root, 'X3');
  await act(async () => root.unmount());
});

test('explicit offline targets keep the chosen crop and BMP when another reader connects', async () => {
  for (const model of ['X3', 'X4'] as const) {
    const root = await mountPreview(null);
    await act(async () => root.root.findByProps({ testID: `SleepPreview.Reader.${model}` }).props.onPress());
    const frame = root.root.findByProps({ testID: 'SleepPreview.CropFrame' }).props.style;
    await act(async () => store.getState().updateDeviceStatus({ device: model === 'X3' ? 'X4' : 'X3' } as DeviceStatus));
    assert.deepEqual(root.root.findByProps({ testID: 'SleepPreview.CropFrame' }).props.style, frame);
    await confirmBmp(root, model);
    await act(async () => root.unmount());
  }
});

test('actual legacy status keeps X4 compatibility while an unknown reported model stays blocked', async () => {
  const legacy = await mountPreview({ version: '1.2.0' } as DeviceStatus);
  await confirmBmp(legacy, 'X4');
  await act(async () => legacy.unmount());
  const unknown = await mountPreview({ device: 'Unknown' } as DeviceStatus);
  assert.equal(unknown.root.findByProps({ testID: 'SleepPreview.Done' }).props.disabled, true);
  assert.equal(unknown.root.findAllByProps({ testID: 'SleepPreview.ReaderChoice' }).length, 0);
  await act(async () => unknown.unmount());
});

test('switching readers resets to root and discards old-reader results, errors and loading completion', async () => {
  let browser!: ReturnType<typeof useBrowser>;
  function Harness() { browser = useBrowser(); return null; }
  let root!: ReactTestRenderer;
  await act(async () => { connect('reader-x4'); root = create(React.createElement(Harness)); });
  assert.equal(pending.at(-1)?.path, '/');
  await act(async () => { pending.at(-1)!.resolve([file('X4.epub')]); });
  await act(async () => { browser.navigateToFolder('Books'); });
  const oldRequest = pending.at(-1)!;
  await act(async () => { connect('reader-x3'); });
  const newRequest = pending.at(-1)!;
  assert.equal(newRequest.ip, 'reader-x3');
  assert.equal(newRequest.path, '/');
  assert.equal(browser.currentPath, '/');
  assert.deepEqual(browser.files, []);
  await act(async () => { oldRequest.reject(new Error('old reader disconnected')); });
  assert.equal(browser.error, null);
  assert.equal(browser.isLoading, true);
  await act(async () => { newRequest.resolve([file('X3.epub')]); });
  assert.equal((browser.files as DeviceFile[])[0].name, 'X3.epub');
  assert.equal(browser.isLoading, false);
  await act(async () => { browser.navigateToFolder('First'); });
  const slowRequest = pending.at(-1)!;
  await act(async () => { browser.navigateToPath('/Second'); });
  await act(async () => { pending.at(-1)!.resolve([file('Second.epub')]); });
  await act(async () => { slowRequest.resolve([file('First.epub')]); });
  assert.equal(browser.currentPath, '/Second');
  assert.equal((browser.files as DeviceFile[])[0].name, 'Second.epub');
  await act(async () => { store.getState().disconnect(); });
  assert.equal(browser.currentPath, '/');
  assert.deepEqual(browser.files, []);
  await act(async () => { root.unmount(); });
});
