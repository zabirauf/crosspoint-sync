// Exercise the real importer with an in-memory iOS App Group and stores.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../services/share-import.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function setup({ hydrated = true, uploadPath = '/Books', manifestPath = '/' } = {}) {
  const jobs = [];
  const listeners = new Set();
  const files = new Map();
  const directories = new Set(['file:///group/manifests', 'file:///group/shared-files']);
  const settings = { defaultUploadPath: uploadPath };
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
    '@/stores/settings-store': { useSettingsStore: {
      getState: () => settings,
      persist: {
        hasHydrated: () => hydrated,
        onFinishHydration: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      },
    } },
    '@/services/logger': { log: () => {} },
    '@/utils/format': { pathToUri: value => value.startsWith('file://') ? value : `file://${value}` },
  };
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    require: id => { assert.ok(id in mocks, `unexpected dependency: ${id}`); return mocks[id]; },
  });
  return {
    jobs, settings, files, listeners, addManifest,
    importFiles: module.exports.importSharedFiles,
    finishHydration(savedPath) {
      settings.defaultUploadPath = savedPath;
      hydrated = true;
      for (const listener of [...listeners]) listener();
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
  assert.equal(app.listeners.size, 0);
});

test('subsequent imports use changed settings and keep existing destinations', async () => {
  const app = setup();
  await app.importFiles();
  app.settings.defaultUploadPath = '/Reading';
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
