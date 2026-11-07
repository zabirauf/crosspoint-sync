// Exercise the real importer and Zustand settings persistence with in-memory I/O.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { setImmediate: nextTurn } = require('node:timers/promises');

function compile(relativePath) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const importerSource = compile('../services/share-import.ts');
const settingsSource = compile('../stores/settings-store.ts');

function load(source, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports,
    Promise,
    require: id => { assert.ok(id in mocks, `unexpected dependency: ${id}`); return mocks[id]; },
  });
  return module.exports;
}

function setup({ hydrated = true, uploadPath = '/Books', manifestPath = '/', storedValue } = {}) {
  const jobs = [];
  const files = new Map();
  const directories = new Set(['file:///group/manifests', 'file:///group/shared-files']);
  const pendingReads = [];
  let storageReads = 0;
  let savedSettings = storedValue === undefined
    ? JSON.stringify({ state: { defaultUploadPath: uploadPath }, version: 0 })
    : storedValue;
  const settingsModule = load(settingsSource, {
    zustand: require('zustand'),
    'zustand/middleware': require('zustand/middleware'),
    '@react-native-async-storage/async-storage': { default: {
      getItem: () => {
        storageReads++;
        return hydrated ? Promise.resolve(savedSettings) : new Promise((resolve, reject) => {
          pendingReads.push({ resolve, reject });
        });
      },
      setItem: (_key, value) => { savedSettings = value; return Promise.resolve(); },
      removeItem: () => Promise.resolve(),
    } },
    '@/constants/Protocol': { DEFAULT_UPLOAD_PATH: '/', DEFAULT_CLIP_UPLOAD_PATH: '/Articles' },
  });
  const settings = settingsModule.useSettingsStore;
  const uriOf = (base, name) => `${typeof base === 'string' ? base : base.uri}${name ? `/${name}` : ''}`;

  class File {
    constructor(base, name) { this.uri = uriOf(base, name); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return files.has(this.uri); }
    async text() { return files.get(this.uri); }
    move(destination) {
      assert.ok(this.exists, 'shared file must exist before it is moved');
      files.set(destination.uri, files.get(this.uri));
      files.delete(this.uri);
    }
    delete() { files.delete(this.uri); }
  }

  class Directory {
    constructor(base, name) { this.uri = uriOf(base, name); }
    get exists() { return directories.has(this.uri); }
    create() { directories.add(this.uri); }
    list() {
      return [...files.keys()]
        .filter(uri => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/'))
        .map(uri => new File(uri));
    }
  }

  function addManifest(name = 'book.epub') {
    files.set(`file:///group/shared-files/${name}`, 'epub bytes');
    files.set(`file:///group/manifests/${name}.json`, JSON.stringify({
      fileName: name,
      fileUri: `/group/shared-files/${name}`,
      fileSize: 10,
      destinationPath: manifestPath,
      createdAt: 1,
    }));
  }
  addManifest();

  const mocks = {
    'expo-file-system': { File, Directory, Paths: { cache: 'file:///cache' } },
    '@/modules/app-group-path': { getAppGroupPath: () => '/group' },
    '@/stores/upload-store': { useUploadStore: { getState: () => ({ addJob: job => jobs.push(job) }) } },
    '@/stores/settings-store': settingsModule,
    '@/services/logger': { log: () => {} },
    '@/utils/format': { pathToUri: value => value.startsWith('file://') ? value : `file://${value}` },
  };
  const importer = load(importerSource, mocks);
  return {
    jobs, settings, files, directories, addManifest,
    get storageReads() { return storageReads; },
    importFiles: importer.importSharedFiles,
    finishHydration(savedPath) {
      const read = pendingReads.shift();
      assert.ok(read, 'a settings read must be pending');
      savedSettings = JSON.stringify({ state: { defaultUploadPath: savedPath }, version: 0 });
      read.resolve(savedSettings);
    },
    failHydration() {
      const read = pendingReads.shift();
      assert.ok(read, 'a settings read must be pending');
      read.reject(new Error('AsyncStorage read failed'));
    },
  };
}

test('iOS shares use Upload Path instead of the extension root', async () => {
  const app = setup();
  assert.equal(await app.importFiles(), 1);
  assert.equal(app.jobs[0].destinationPath, '/Books');
  assert.equal(app.jobs[0].jobType, 'book');
  assert.equal(app.files.has('file:///group/manifests/book.epub.json'), false);
});

test('cold launch waits for persisted settings before moving or queuing the file', async () => {
  const app = setup({ hydrated: false, uploadPath: '/' });
  const importing = app.importFiles();
  await Promise.resolve();
  assert.equal(app.jobs.length, 0);
  assert.equal(app.files.has('file:///group/shared-files/book.epub'), true);
  app.finishHydration('/Books/');
  assert.equal(await importing, 1);
  assert.equal(app.jobs[0].destinationPath, '/Books/');
  assert.equal(app.settings.persist.hasHydrated(), true);
  assert.equal(app.storageReads, 1, 'import should reuse the in-flight settings read');
});

test('subsequent imports use changed settings and keep existing destinations', async () => {
  const app = setup();
  await app.importFiles();
  app.settings.getState().setDefaultUploadPath('/Reading');
  app.addManifest('second.epub');
  await app.importFiles();
  assert.equal(app.jobs[0].destinationPath, '/Books');
  assert.equal(app.jobs[1].destinationPath, '/Reading');
});

test('root remains a valid configured upload destination', async () => {
  const app = setup({ uploadPath: '/', manifestPath: '/OldFolder' });
  await app.importFiles();
  assert.equal(app.jobs[0].destinationPath, '/');
});

async function assertDeferred(importing, app) {
  // Let all hydration microtasks finish; a failed read must settle the import.
  assert.equal(await Promise.race([importing, nextTurn().then(() => 'still waiting')]), 0);
  assert.equal(app.jobs.length, 0);
  assert.equal(app.files.has('file:///group/shared-files/book.epub'), true);
  assert.equal(app.files.has('file:///group/manifests/book.epub.json'), true);
  assert.equal(app.directories.has('file:///cache/shared-imports'), false);
}

test('a settings read failure releases an in-flight import without moving or deleting files', async () => {
  const app = setup({ hydrated: false });
  const importing = app.importFiles();
  app.failHydration();
  await assertDeferred(importing, app);
});

test('an earlier settings failure can be retried and a failed retry preserves files', async () => {
  const app = setup({ hydrated: false });
  app.failHydration();
  await nextTurn();
  const importing = app.importFiles();
  assert.equal(app.storageReads, 2);
  app.failHydration();
  await assertDeferred(importing, app);
});

test('a later import retries failed hydration and uses the recovered path', async () => {
  const app = setup({ hydrated: false });
  const firstImport = app.importFiles();
  app.failHydration();
  await assertDeferred(firstImport, app);

  const retry = app.importFiles();
  assert.equal(app.storageReads, 2);
  app.finishHydration('/Recovered');
  assert.equal(await retry, 1);
  assert.equal(app.jobs[0].destinationPath, '/Recovered');
  assert.equal(app.files.has('file:///group/manifests/book.epub.json'), false);
});

test('malformed persisted settings preserve shares instead of uploading to the default root', async () => {
  const app = setup({ storedValue: '{invalid json' });
  await assertDeferred(app.importFiles(), app);
});

test('a fresh install with no persisted settings uses the default root', async () => {
  const app = setup({ storedValue: null });
  assert.equal(await app.importFiles(), 1);
  assert.equal(app.jobs[0].destinationPath, '/');
});
