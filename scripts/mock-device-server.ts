#!/usr/bin/env npx tsx
/**
 * Mock CrossPoint Device Server — simulates an XTEink X4 e-ink reader
 * for connected-state Maestro testing.
 *
 * Provides:
 *   - UDP discovery responder on port 8134
 *   - HTTP REST API on port 80 (GET /api/status, GET /api/files, POST /mkdir, POST /delete)
 *   - WebSocket upload endpoint on port 81
 *
 * Usage:
 *   npx tsx scripts/mock-device-server.ts
 *   npx tsx scripts/mock-device-server.ts --http-port 8080 --ws-port 8081
 */

import * as http from 'http';
import * as dgram from 'dgram';
import { URL } from 'url';
import WebSocket from 'ws';

// ─── CLI Args ───

const args = process.argv.slice(2);
function getArg(flag: string, defaultVal: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const HTTP_PORT = parseInt(getArg('--http-port', '80'), 10);
const WS_PORT = parseInt(getArg('--ws-port', '81'), 10);
const UDP_PORT = 8134;
const HOSTNAME = 'crosspoint-mock';

// ─── Mock File System ───

interface MockFile {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isEpub: boolean;
  lastModified: number;
}

const mockFiles: Map<string, MockFile[]> = new Map();

// Seed initial mock file system
function seedFileSystem() {
  mockFiles.set('/', [
    { name: 'Books', path: '/Books', size: 0, isDirectory: true, isEpub: false, lastModified: Date.now() },
    { name: 'Articles', path: '/Articles', size: 0, isDirectory: true, isEpub: false, lastModified: Date.now() },
    { name: 'sleep', path: '/sleep', size: 0, isDirectory: true, isEpub: false, lastModified: Date.now() },
  ]);

  mockFiles.set('/Books', [
    { name: 'The Great Gatsby.epub', path: '/Books/The Great Gatsby.epub', size: 2_450_000, isDirectory: false, isEpub: true, lastModified: Date.now() - 86400000 },
    { name: 'Dune.epub', path: '/Books/Dune.epub', size: 1_890_000, isDirectory: false, isEpub: true, lastModified: Date.now() - 172800000 },
    { name: 'Clean Code.epub', path: '/Books/Clean Code.epub', size: 5_120_000, isDirectory: false, isEpub: true, lastModified: Date.now() - 259200000 },
    { name: 'Fiction', path: '/Books/Fiction', size: 0, isDirectory: true, isEpub: false, lastModified: Date.now() },
  ]);

  mockFiles.set('/Books/Fiction', [
    { name: '1984.epub', path: '/Books/Fiction/1984.epub', size: 980_000, isDirectory: false, isEpub: true, lastModified: Date.now() - 345600000 },
  ]);

  mockFiles.set('/Articles', [
    { name: 'How to Build a CLI.epub', path: '/Articles/How to Build a CLI.epub', size: 350_000, isDirectory: false, isEpub: true, lastModified: Date.now() - 43200000 },
  ]);

  mockFiles.set('/sleep', []);
}

seedFileSystem();

// ─── Device Status ───

const deviceStatus = {
  version: '1.4.2',
  freeHeap: 128000,
  uptime: 345000,
  rssi: -52,
  hostname: HOSTNAME,
  ip: '192.168.1.100',
};

// ─── UDP Discovery Server ───

const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  const text = msg.toString().trim();
  if (text === 'hello') {
    const response = `crosspoint (on ${HOSTNAME});${WS_PORT}`;
    const buf = Buffer.from(response);
    udpServer.send(buf, 0, buf.length, rinfo.port, rinfo.address, (err) => {
      if (err) console.error('UDP send error:', err);
      else console.log(`[UDP] Discovery response sent to ${rinfo.address}:${rinfo.port}`);
    });
  }
});

udpServer.on('listening', () => {
  const addr = udpServer.address();
  console.log(`[UDP] Discovery server listening on port ${addr.port}`);
});

udpServer.bind(UDP_PORT);

// ─── HTTP REST API ───

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${HTTP_PORT}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`[HTTP] ${req.method} ${pathname}${url.search}`);

  // GET /api/status
  if (pathname === '/api/status' && req.method === 'GET') {
    deviceStatus.uptime += 1000; // Simulate uptime increase
    deviceStatus.rssi = -50 + Math.floor(Math.random() * 10) - 5; // Fluctuate RSSI
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(deviceStatus));
    return;
  }

  // GET /api/files?path=
  if (pathname === '/api/files' && req.method === 'GET') {
    const path = url.searchParams.get('path') || '/';
    const files = mockFiles.get(path);
    if (files) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // POST /mkdir
  if (pathname === '/mkdir' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { path } = JSON.parse(body);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const folderName = path.substring(path.lastIndexOf('/') + 1);

        // Add to parent
        const parentFiles = mockFiles.get(parentPath) || [];
        if (!parentFiles.find(f => f.name.toLowerCase() === folderName.toLowerCase())) {
          parentFiles.push({
            name: folderName,
            path,
            size: 0,
            isDirectory: true,
            isEpub: false,
            lastModified: Date.now(),
          });
          mockFiles.set(parentPath, parentFiles);
        }
        // Create empty directory
        if (!mockFiles.has(path)) {
          mockFiles.set(path, []);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // POST /delete
  if (pathname === '/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { path } = JSON.parse(body);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const fileName = path.substring(path.lastIndexOf('/') + 1);

        const parentFiles = mockFiles.get(parentPath) || [];
        const idx = parentFiles.findIndex(f => f.name.toLowerCase() === fileName.toLowerCase());
        if (idx !== -1) {
          parentFiles.splice(idx, 1);
          mockFiles.set(parentPath, parentFiles);
        }
        // Remove directory entries if it was a folder
        mockFiles.delete(path);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // GET /download?path= (returns mock data)
  if (pathname === '/download' && req.method === 'GET') {
    const filePath = url.searchParams.get('path') || '';
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filePath.split('/').pop()}"`,
    });
    // Return some mock bytes
    res.end(Buffer.alloc(1024, 0x42));
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[HTTP] REST API listening on port ${HTTP_PORT}`);
});

// ─── WebSocket Upload Server ───

const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  let fileName = '';
  let fileSize = 0;
  let destPath = '';
  let received = 0;

  ws.on('message', (data: Buffer | string) => {
    const msg = typeof data === 'string' ? data : data.toString('utf-8', 0, Math.min(data.length, 200));

    // START:filename:size:path
    if (msg.startsWith('START:')) {
      const parts = msg.split(':');
      fileName = parts[1] || 'unknown';
      fileSize = parseInt(parts[2] || '0', 10);
      destPath = parts[3] || '/';
      received = 0;
      console.log(`[WS] Upload start: ${fileName} (${fileSize} bytes) → ${destPath}`);
      ws.send('READY');
      return;
    }

    // Binary data chunk
    if (typeof data !== 'string' && Buffer.isBuffer(data)) {
      received += data.length;
      // Send PROGRESS every ~64KB
      if (received % (64 * 1024) < (4 * 1024) || received >= fileSize) {
        ws.send(`PROGRESS:${received}:${fileSize}`);
      }

      // Upload complete
      if (received >= fileSize) {
        console.log(`[WS] Upload complete: ${fileName}`);
        ws.send('DONE');

        // Add file to mock filesystem
        const parentFiles = mockFiles.get(destPath) || [];
        const existingIdx = parentFiles.findIndex(f => f.name.toLowerCase() === fileName.toLowerCase());
        const fileEntry: MockFile = {
          name: fileName,
          path: `${destPath === '/' ? '' : destPath}/${fileName}`,
          size: fileSize,
          isDirectory: false,
          isEpub: fileName.toLowerCase().endsWith('.epub'),
          lastModified: Date.now(),
        };

        if (existingIdx !== -1) {
          parentFiles[existingIdx] = fileEntry;
        } else {
          parentFiles.push(fileEntry);
        }
        mockFiles.set(destPath, parentFiles);
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

console.log(`[WS] Upload server listening on port ${WS_PORT}`);

// ─── Graceful Shutdown ───

process.on('SIGINT', () => {
  console.log('\nShutting down mock device server...');
  udpServer.close();
  httpServer.close();
  wss.close();
  process.exit(0);
});

console.log(`\n✅ Mock device server running`);
console.log(`   UDP discovery: port ${UDP_PORT}`);
console.log(`   HTTP API:      port ${HTTP_PORT}`);
console.log(`   WebSocket:     port ${WS_PORT}`);
console.log(`   Hostname:      ${HOSTNAME}`);
console.log(`\nPress Ctrl+C to stop\n`);
