import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import Module from 'node:module';
import { test } from 'node:test';

// Real application API and scheduler, with only native/storage boundaries stubbed.
const loader = Module as any;
const originalLoad = loader._load;
loader._load = function(id: string, parent: unknown, isMain: boolean) {
  if (id === 'react-native') return { Platform: { OS: 'ios' } };
  if (id === 'expo-file-system') return {};
  if (id === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
  if (id === './logger' || id === '@/services/logger') return { log: () => {} };
  return originalLoad.call(this, id, parent, isMain);
};
let api: typeof import('../services/device-api');
let store: typeof import('../stores/device-store').useDeviceStore;
try {
  api = require('../services/device-api');
  store = require('../stores/device-store').useDeviceStore;
} finally { loader._load = originalLoad; }

type Call = { pathname: string; path: string | null; form: Record<string, string> };
type Reply = { status: number; body: unknown } | 'disconnect';
const directory = (name = 'BOOKS') => ({ name, size: 0, isDirectory: true });

test('folder creation follows CrossPoint 1.1.1 and 2.0.0 response contracts', async t => {
  let calls: Call[] = [];
  let respond: (call: Call) => Reply = () => ({ status: 500, body: 'Unexpected request' });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://reader');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const form: Record<string, string> = {};
    if (body.length) {
      // React Native's global FormData omits the browser/Node iteration API.
      const data = await new Response(body, { headers: { 'content-type': req.headers['content-type']! } }).formData() as unknown as {
        forEach(callback: (value: unknown, key: string) => void): void;
      };
      data.forEach((value, key) => { form[key] = String(value); });
    }
    const call = { pathname: url.pathname, path: url.searchParams.get('path'), form };
    calls.push(call);
    const reply = respond(call);
    if (reply === 'disconnect') { req.socket.destroy(); return; }
    const json = typeof reply.body !== 'string';
    res.writeHead(reply.status, { 'content-type': json ? 'application/json' : 'text/plain' });
    res.end(json ? JSON.stringify(reply.body) : reply.body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as import('node:net').AddressInfo).port;
  store.getState().connectDevice({ ip: '127.0.0.1', hostname: 'Test reader', httpPort: port, wsPort: port + 1 });
  function reset(handler: typeof respond) { calls = []; respond = handler; api.clearValidatedPaths(); }
  const create = (name = 'Books') => api.createFolder('127.0.0.1', name, '/Library');
  try {
    await t.test('successful mkdir sends exact form fields without an extra listing', async () => {
      reset(() => ({ status: 200, body: 'Folder created: Books' }));
      await create();
      assert.deepEqual(calls, [{ pathname: '/mkdir', path: null, form: { name: 'Books', path: '/Library' } }]);
    });
    for (const status of [400, 409]) {
      await t.test(`${status} conflict succeeds only for a verified directory (FAT32 case-insensitive)`, async () => {
        reset(call => call.pathname === '/mkdir' ? { status, body: 'Folder already exists' } : { status: 200, body: [directory()] });
        await create();
        assert.equal(calls.length, 2, 'verification completes on the single-request scheduler without deadlock');
        assert.equal(calls[1].path, '/Library');
      });
      await t.test(`${status} existing file collision is rejected`, async () => {
        reset(call => call.pathname === '/mkdir' ? { status, body: 'Folder already exists' } : { status: 200, body: [{ ...directory(), isDirectory: false }] });
        await assert.rejects(create(), /existing file is not a directory/);
      });
    }
    for (const detail of ['Missing folder name', 'Folder name cannot be empty', 'Invalid folder name']) {
      await t.test(`400 ${detail} is preserved even if a same-named directory exists`, async () => {
        reset(call => call.pathname === '/mkdir' ? { status: 400, body: detail } : { status: 200, body: [directory()] });
        await assert.rejects(create(), error => error instanceof Error && error.message.includes('(400)') && error.message.includes(detail));
        assert.equal(calls.length, 1, 'validation errors are not mistaken for conflicts');
      });
    }
    for (const [status, detail] of [[403, 'Cannot create protected item'], [500, 'Failed to create folder']] as const) {
      await t.test(`${status} firmware errors retain their response text`, async () => {
        reset(() => ({ status, body: detail }));
        await assert.rejects(create(), error => error instanceof Error && error.message.includes(String(status)) && error.message.includes(detail));
        assert.equal(calls.length, 1);
      });
    }
    for (const listing of [{ status: 200, body: [] }, { status: 503, body: 'SD card unavailable' }, { status: 200, body: 'not JSON' }, 'disconnect'] as const) {
      await t.test(`unverified conflict is rejected when listing is ${JSON.stringify(listing)}`, async () => {
        reset(call => call.pathname === '/mkdir' ? { status: 400, body: 'Folder already exists' } : listing);
        await assert.rejects(create(), /Create folder failed \(400\).*could not be verified/);
      });
    }
    await t.test('mkdir network failures propagate', async () => {
      reset(() => 'disconnect');
      await assert.rejects(create(), /fetch failed/);
    });
    await t.test('ensureRemotePath does not retry a rejected mkdir or cache its path', async () => {
      let fail = true;
      reset(call => call.pathname === '/api/files' ? { status: 200, body: [] } : fail ? { status: 400, body: 'Invalid folder name' } : { status: 200, body: 'Created' });
      await assert.rejects(api.ensureRemotePath('127.0.0.1', '/Books/Articles'), /Invalid folder name/);
      assert.equal(calls.filter(call => call.pathname === '/mkdir').length, 1);
      assert.ok(!calls.some(call => call.form.name === 'Articles'));
      fail = false;
      calls = [];
      await api.ensureRemotePath('127.0.0.1', '/Books/Articles');
      assert.deepEqual(calls.filter(call => call.pathname === '/mkdir').map(call => call.form), [
        { name: 'Books', path: '/' }, { name: 'Articles', path: '/Books' },
      ]);
      calls = [];
      await api.ensureRemotePath('127.0.0.1', '/Books/Articles');
      assert.equal(calls.length, 0, 'only successfully ensured paths are cached');
    });
    await t.test('failed parent listing permits one create attempt but still propagates its failure', async () => {
      reset(call => call.pathname === '/api/files' ? { status: 503, body: 'SD card unavailable' } : { status: 500, body: 'Failed to create folder' });
      await assert.rejects(api.ensureRemotePath('127.0.0.1', '/Books'), /500.*Failed to create folder/);
      assert.equal(calls.filter(call => call.pathname === '/mkdir').length, 1);
    });
    await t.test('an existing mixed-case directory needs no mkdir', async () => {
      reset(() => ({ status: 200, body: [directory()] }));
      await api.ensureRemotePath('127.0.0.1', '/Books');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].pathname, '/api/files');
    });
  } finally {
    store.getState().disconnect();
    api.clearValidatedPaths();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
