#!/usr/bin/env npx tsx
/**
 * Mock CrossPoint Device Server — simulates an XTEink X4 e-ink reader
 * for connected-state Maestro testing.
 *
 * Provides:
 *   - HTTP REST API on port 80 (status, files, mkdir, delete, rename, move, upload, download, settings)
 *   - WebSocket upload endpoint on port 81
 *
 * Usage:
 *   npx tsx scripts/mock-device-server.ts
 *   npx tsx scripts/mock-device-server.ts --http-port 8080 --ws-port 8081
 *   npx tsx scripts/mock-device-server.ts --firmware-version 0.9.0
 *   npx tsx scripts/mock-device-server.ts --data-dir ~/my-epubs
 */

import * as http from 'http';
import * as fs from 'fs';
import * as nodePath from 'path';
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
const HOSTNAME = 'crosspoint-mock';
const FIRMWARE_VERSION = getArg('--firmware-version', '1.1.0');
const DATA_DIR = getArg('--data-dir', '');

// ─── Firmware Version Helper ───

function firmwareAtLeast(major: number, minor: number, patch: number): boolean {
  const match = FIRMWARE_VERSION.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, fwMaj, fwMin, fwPat] = match.map(Number);
  if (fwMaj !== major) return fwMaj > major;
  if (fwMin !== minor) return fwMin > minor;
  return fwPat >= patch;
}

const CAPABILITIES = {
  rename: firmwareAtLeast(1, 0, 0),
  move: firmwareAtLeast(1, 0, 0),
  settingsApi: firmwareAtLeast(1, 1, 0),
  batchDelete: firmwareAtLeast(1, 2, 0),
};

// ─── Protected Paths ───

const PROTECTED_PREFIXES = ['.', 'System Volume Information', 'XTCache'];

function isProtectedName(name: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(prefix + '/'),
  );
}

function isProtectedPath(filePath: string): boolean {
  const name = filePath.split('/').filter(Boolean).pop() || '';
  return isProtectedName(name);
}

// ─── FormData Parser ───

function collectBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

interface ParsedFormData {
  fields: Record<string, string>;
  files: { fieldName: string; fileName: string; contentType: string; data: Buffer }[];
}

function parseFormData(contentType: string, body: Buffer): ParsedFormData {
  const result: ParsedFormData = { fields: {}, files: [] };
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) return result;

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const endBuf = Buffer.from(`--${boundary}--`);

  // Split body by boundary
  let start = body.indexOf(boundaryBuf);
  if (start === -1) return result;

  while (true) {
    start += boundaryBuf.length;
    // Skip \r\n after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    const nextBoundary = body.indexOf(boundaryBuf, start);
    if (nextBoundary === -1) break;

    const part = body.subarray(start, nextBoundary);

    // Check for end boundary
    if (part.indexOf(endBuf) !== -1) break;

    // Find header/body separator (\r\n\r\n)
    const headerEnd = findDoubleCRLF(part);
    if (headerEnd === -1) continue;

    const headerStr = part.subarray(0, headerEnd).toString('utf-8');
    // Body starts after \r\n\r\n, ends before trailing \r\n
    let partBody = part.subarray(headerEnd + 4);
    // Trim trailing \r\n before next boundary
    if (partBody.length >= 2 && partBody[partBody.length - 2] === 0x0d && partBody[partBody.length - 1] === 0x0a) {
      partBody = partBody.subarray(0, partBody.length - 2);
    }

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    const fileNameMatch = headerStr.match(/filename="([^"]+)"/);
    if (fileNameMatch) {
      const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
      result.files.push({
        fieldName,
        fileName: fileNameMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: Buffer.from(partBody),
      });
    } else {
      result.fields[fieldName] = partBody.toString('utf-8');
    }

    start = nextBoundary;
    // Reset start to before the loop increment
    start -= boundaryBuf.length;
    start = nextBoundary;
  }

  return result;
}

function findDoubleCRLF(buf: Buffer): number {
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
      return i;
    }
  }
  return -1;
}

// ─── File Backend Interface ───

interface FileEntry {
  name: string;
  size: number;
  isDirectory: boolean;
  isEpub: boolean;
}

interface FileBackend {
  listFiles(path: string): FileEntry[];
  createFolder(parentPath: string, name: string): void;
  deleteItem(filePath: string): void;
  renameItem(filePath: string, newName: string): void;
  moveItem(filePath: string, destFolder: string): void;
  writeFile(destPath: string, fileName: string, data: Buffer): void;
  readFile(filePath: string): Buffer;
  exists(filePath: string): boolean;
  isDirectory(filePath: string): boolean;
  isEmpty(filePath: string): boolean;
}

// ─── Memory Backend ───

class MemoryBackend implements FileBackend {
  private files: Map<string, FileEntry[]> = new Map();

  constructor() {
    this.seed();
  }

  private seed() {
    this.files.set('/', [
      { name: 'Books', size: 0, isDirectory: true, isEpub: false },
      { name: 'Articles', size: 0, isDirectory: true, isEpub: false },
      { name: 'sleep', size: 0, isDirectory: true, isEpub: false },
    ]);

    this.files.set('/Books', [
      { name: 'The Great Gatsby.epub', size: 2_450_000, isDirectory: false, isEpub: true },
      { name: 'Dune.epub', size: 1_890_000, isDirectory: false, isEpub: true },
      { name: 'Clean Code.epub', size: 5_120_000, isDirectory: false, isEpub: true },
      { name: 'Fiction', size: 0, isDirectory: true, isEpub: false },
    ]);

    this.files.set('/Books/Fiction', [
      { name: '1984.epub', size: 980_000, isDirectory: false, isEpub: true },
    ]);

    this.files.set('/Articles', [
      { name: 'How to Build a CLI.epub', size: 350_000, isDirectory: false, isEpub: true },
    ]);

    this.files.set('/sleep', []);
  }

  private normalizePath(p: string): string {
    return p === '' ? '/' : p.replace(/\/+$/, '') || '/';
  }

  private parentPath(p: string): string {
    const normalized = this.normalizePath(p);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalized.substring(0, lastSlash);
  }

  private fileName(p: string): string {
    return p.substring(p.lastIndexOf('/') + 1);
  }

  listFiles(path: string): FileEntry[] {
    return this.files.get(this.normalizePath(path)) || [];
  }

  createFolder(parentPath: string, name: string): void {
    const parent = this.normalizePath(parentPath);
    const fullPath = parent === '/' ? `/${name}` : `${parent}/${name}`;
    const parentFiles = this.files.get(parent) || [];

    if (!parentFiles.find((f) => f.name.toLowerCase() === name.toLowerCase())) {
      parentFiles.push({ name, size: 0, isDirectory: true, isEpub: false });
      this.files.set(parent, parentFiles);
    }
    if (!this.files.has(fullPath)) {
      this.files.set(fullPath, []);
    }
  }

  deleteItem(filePath: string): void {
    const parent = this.parentPath(filePath);
    const name = this.fileName(filePath);
    const parentFiles = this.files.get(parent) || [];
    const idx = parentFiles.findIndex((f) => f.name.toLowerCase() === name.toLowerCase());
    if (idx !== -1) {
      parentFiles.splice(idx, 1);
      this.files.set(parent, parentFiles);
    }
    // Remove directory entries recursively
    for (const key of this.files.keys()) {
      if (key === filePath || key.startsWith(filePath + '/')) {
        this.files.delete(key);
      }
    }
  }

  renameItem(filePath: string, newName: string): void {
    const parent = this.parentPath(filePath);
    const oldName = this.fileName(filePath);
    const parentFiles = this.files.get(parent) || [];
    const entry = parentFiles.find((f) => f.name.toLowerCase() === oldName.toLowerCase());
    if (!entry) throw { status: 404, message: 'Not found' };

    // Check conflict
    if (parentFiles.find((f) => f.name.toLowerCase() === newName.toLowerCase() && f !== entry)) {
      throw { status: 409, message: 'Name conflict' };
    }

    const newPath = parent === '/' ? `/${newName}` : `${parent}/${newName}`;

    // If directory, update all child paths
    if (entry.isDirectory) {
      const oldPrefix = filePath;
      const newPrefix = newPath;
      const keysToUpdate: [string, string][] = [];
      for (const key of this.files.keys()) {
        if (key === oldPrefix) {
          keysToUpdate.push([key, newPrefix]);
        } else if (key.startsWith(oldPrefix + '/')) {
          keysToUpdate.push([key, newPrefix + key.substring(oldPrefix.length)]);
        }
      }
      for (const [oldKey, newKey] of keysToUpdate) {
        const entries = this.files.get(oldKey)!;
        this.files.delete(oldKey);
        this.files.set(newKey, entries);
      }
    }

    entry.name = newName;
    if (!entry.isDirectory) {
      entry.isEpub = newName.toLowerCase().endsWith('.epub');
    }
  }

  moveItem(filePath: string, destFolder: string): void {
    const srcParent = this.parentPath(filePath);
    const name = this.fileName(filePath);
    const srcParentFiles = this.files.get(srcParent) || [];
    const entryIdx = srcParentFiles.findIndex((f) => f.name.toLowerCase() === name.toLowerCase());
    if (entryIdx === -1) throw { status: 404, message: 'Not found' };

    const dest = this.normalizePath(destFolder);
    if (!this.files.has(dest)) throw { status: 404, message: 'Destination not found' };

    const destFiles = this.files.get(dest)!;
    if (destFiles.find((f) => f.name.toLowerCase() === name.toLowerCase())) {
      throw { status: 409, message: 'Name conflict in destination' };
    }

    const entry = srcParentFiles[entryIdx];
    const oldPath = filePath;
    const newPath = dest === '/' ? `/${name}` : `${dest}/${name}`;

    // If directory, move child entries
    if (entry.isDirectory) {
      const keysToUpdate: [string, string][] = [];
      for (const key of this.files.keys()) {
        if (key === oldPath) {
          keysToUpdate.push([key, newPath]);
        } else if (key.startsWith(oldPath + '/')) {
          keysToUpdate.push([key, newPath + key.substring(oldPath.length)]);
        }
      }
      for (const [oldKey, newKey] of keysToUpdate) {
        const entries = this.files.get(oldKey)!;
        this.files.delete(oldKey);
        this.files.set(newKey, entries);
      }
    }

    // Remove from source parent, add to dest
    srcParentFiles.splice(entryIdx, 1);
    this.files.set(srcParent, srcParentFiles);
    destFiles.push(entry);
    this.files.set(dest, destFiles);
  }

  writeFile(destPath: string, fileName: string, data: Buffer): void {
    const dest = this.normalizePath(destPath);
    const parentFiles = this.files.get(dest) || [];
    const existing = parentFiles.findIndex((f) => f.name.toLowerCase() === fileName.toLowerCase());
    const entry: FileEntry = {
      name: fileName,
      size: data.length,
      isDirectory: false,
      isEpub: fileName.toLowerCase().endsWith('.epub'),
    };
    if (existing !== -1) {
      parentFiles[existing] = entry;
    } else {
      parentFiles.push(entry);
    }
    this.files.set(dest, parentFiles);
  }

  readFile(_filePath: string): Buffer {
    return Buffer.alloc(1024, 0x42);
  }

  exists(filePath: string): boolean {
    const parent = this.parentPath(filePath);
    const name = this.fileName(filePath);
    const parentFiles = this.files.get(parent) || [];
    return (
      filePath === '/' ||
      parentFiles.some((f) => f.name.toLowerCase() === name.toLowerCase())
    );
  }

  isDirectory(filePath: string): boolean {
    if (filePath === '/') return true;
    const parent = this.parentPath(filePath);
    const name = this.fileName(filePath);
    const parentFiles = this.files.get(parent) || [];
    const entry = parentFiles.find((f) => f.name.toLowerCase() === name.toLowerCase());
    return entry?.isDirectory ?? false;
  }

  isEmpty(filePath: string): boolean {
    const entries = this.files.get(this.normalizePath(filePath));
    return !entries || entries.length === 0;
  }
}

// ─── Disk Backend ───

class DiskBackend implements FileBackend {
  private root: string;

  constructor(dataDir: string) {
    this.root = nodePath.resolve(dataDir);
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root, { recursive: true });
    }
  }

  private resolve(p: string): string {
    const resolved = nodePath.resolve(this.root, '.' + (p.startsWith('/') ? p : '/' + p));
    if (!resolved.startsWith(this.root)) {
      throw { status: 403, message: 'Path traversal rejected' };
    }
    return resolved;
  }

  listFiles(path: string): FileEntry[] {
    const dir = this.resolve(path);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs.readdirSync(dir).map((name) => {
      const full = nodePath.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        size: stat.isDirectory() ? 0 : stat.size,
        isDirectory: stat.isDirectory(),
        isEpub: !stat.isDirectory() && name.toLowerCase().endsWith('.epub'),
      };
    });
  }

  createFolder(parentPath: string, name: string): void {
    const dir = nodePath.join(this.resolve(parentPath), name);
    if (!dir.startsWith(this.root)) throw { status: 403, message: 'Path traversal rejected' };
    fs.mkdirSync(dir, { recursive: true });
  }

  deleteItem(filePath: string): void {
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) return;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true });
    } else {
      fs.unlinkSync(resolved);
    }
  }

  renameItem(filePath: string, newName: string): void {
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) throw { status: 404, message: 'Not found' };
    const dir = nodePath.dirname(resolved);
    const newPath = nodePath.join(dir, newName);
    if (!newPath.startsWith(this.root)) throw { status: 403, message: 'Path traversal rejected' };
    if (fs.existsSync(newPath)) throw { status: 409, message: 'Name conflict' };
    fs.renameSync(resolved, newPath);
  }

  moveItem(filePath: string, destFolder: string): void {
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) throw { status: 404, message: 'Not found' };
    const destDir = this.resolve(destFolder);
    if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
      throw { status: 404, message: 'Destination not found' };
    }
    const name = nodePath.basename(resolved);
    const newPath = nodePath.join(destDir, name);
    if (fs.existsSync(newPath)) throw { status: 409, message: 'Name conflict in destination' };
    fs.renameSync(resolved, newPath);
  }

  writeFile(destPath: string, fileName: string, data: Buffer): void {
    const dir = this.resolve(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileFull = nodePath.join(dir, fileName);
    if (!fileFull.startsWith(this.root)) throw { status: 403, message: 'Path traversal rejected' };
    fs.writeFileSync(fileFull, data);
  }

  readFile(filePath: string): Buffer {
    return fs.readFileSync(this.resolve(filePath));
  }

  exists(filePath: string): boolean {
    try {
      return fs.existsSync(this.resolve(filePath));
    } catch {
      return false;
    }
  }

  isDirectory(filePath: string): boolean {
    try {
      const resolved = this.resolve(filePath);
      return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
    } catch {
      return false;
    }
  }

  isEmpty(filePath: string): boolean {
    try {
      const resolved = this.resolve(filePath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return true;
      return fs.readdirSync(resolved).length === 0;
    } catch {
      return true;
    }
  }
}

// ─── Initialize Backend ───

const backend: FileBackend = DATA_DIR
  ? new DiskBackend(DATA_DIR)
  : new MemoryBackend();

// ─── Device Status ───

const deviceStatus = {
  version: FIRMWARE_VERSION,
  freeHeap: 128000,
  uptime: 345000,
  rssi: -52,
  mode: 'STA',
  ip: '192.168.1.100',
};

// ─── Mock Device Settings (always in-memory) ───

const deviceSettings: Record<string, string | number | boolean> = {
  auto_sleep: true,
  sleep_timeout: 300,
  refresh_mode: 'balanced',
  device_name: HOSTNAME,
  wifi_power_save: false,
  screen_rotation: 0,
};

// ─── JSON Response Helpers ───

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── HTTP REST API ───

const httpServer = http.createServer(async (req, res) => {
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

  try {
    // GET /api/status
    if (pathname === '/api/status' && req.method === 'GET') {
      deviceStatus.uptime += 1000;
      deviceStatus.rssi = -50 + Math.floor(Math.random() * 10) - 5;
      jsonResponse(res, 200, deviceStatus);
      return;
    }

    // GET /api/files?path=
    if (pathname === '/api/files' && req.method === 'GET') {
      const path = url.searchParams.get('path') || '/';
      const files = backend.listFiles(path);
      jsonResponse(res, 200, files);
      return;
    }

    // POST /mkdir — FormData with 'name' and 'path' fields
    if (pathname === '/mkdir' && req.method === 'POST') {
      const body = await collectBody(req);
      const ct = req.headers['content-type'] || '';
      let name: string;
      let parentPath: string;

      if (ct.includes('multipart/form-data')) {
        const form = parseFormData(ct, body);
        name = form.fields['name'] || '';
        parentPath = form.fields['path'] || '/';
      } else {
        // Fallback: JSON body (legacy)
        const json = JSON.parse(body.toString());
        const fullPath: string = json.path || '';
        parentPath = fullPath.substring(0, fullPath.lastIndexOf('/')) || '/';
        name = fullPath.substring(fullPath.lastIndexOf('/') + 1);
      }

      if (!name) {
        jsonResponse(res, 400, { error: 'Missing folder name' });
        return;
      }

      backend.createFolder(parentPath, name);
      jsonResponse(res, 200, { success: true });
      return;
    }

    // POST /delete — FormData (legacy) or JSON (batch)
    if (pathname === '/delete' && req.method === 'POST') {
      const body = await collectBody(req);
      const ct = req.headers['content-type'] || '';

      if (ct.includes('application/json')) {
        // Batch delete: { paths: ["/Books/file.epub", ...] }
        if (!CAPABILITIES.batchDelete) {
          jsonResponse(res, 404, { error: 'Not found' });
          return;
        }
        const json = JSON.parse(body.toString());
        const paths: string[] = json.paths || [];
        for (const p of paths) {
          if (isProtectedPath(p)) {
            jsonResponse(res, 403, { error: 'Protected path' });
            return;
          }
          if (backend.isDirectory(p) && !backend.isEmpty(p)) {
            jsonResponse(res, 400, { error: 'Folder not empty' });
            return;
          }
          backend.deleteItem(p);
        }
        jsonResponse(res, 200, { success: true });
      } else if (ct.includes('multipart/form-data')) {
        // Legacy FormData: path + type
        const form = parseFormData(ct, body);
        const filePath = form.fields['path'] || '';
        if (isProtectedPath(filePath)) {
          jsonResponse(res, 403, { error: 'Protected path' });
          return;
        }
        if (backend.isDirectory(filePath) && !backend.isEmpty(filePath)) {
          jsonResponse(res, 400, { error: 'Folder not empty' });
          return;
        }
        backend.deleteItem(filePath);
        jsonResponse(res, 200, { success: true });
      } else {
        // Fallback: try JSON
        try {
          const json = JSON.parse(body.toString());
          const filePath: string = json.path || '';
          if (isProtectedPath(filePath)) {
            jsonResponse(res, 403, { error: 'Protected path' });
            return;
          }
          backend.deleteItem(filePath);
          jsonResponse(res, 200, { success: true });
        } catch {
          jsonResponse(res, 400, { error: 'Invalid request body' });
        }
      }
      return;
    }

    // POST /rename — FormData with 'path' and 'name' (version-gated ≥1.0.0)
    if (pathname === '/rename' && req.method === 'POST') {
      if (!CAPABILITIES.rename) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }
      const body = await collectBody(req);
      const ct = req.headers['content-type'] || '';
      let filePath: string;
      let newName: string;

      if (ct.includes('multipart/form-data')) {
        const form = parseFormData(ct, body);
        filePath = form.fields['path'] || '';
        newName = form.fields['name'] || '';
      } else {
        const json = JSON.parse(body.toString());
        filePath = json.path || '';
        newName = json.name || '';
      }

      if (!filePath || !newName) {
        jsonResponse(res, 400, { error: 'Missing path or name' });
        return;
      }
      if (isProtectedPath(filePath)) {
        jsonResponse(res, 403, { error: 'Protected path' });
        return;
      }
      if (!backend.exists(filePath)) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }

      try {
        backend.renameItem(filePath, newName);
        jsonResponse(res, 200, { success: true });
      } catch (err: any) {
        jsonResponse(res, err.status || 500, { error: err.message || 'Rename failed' });
      }
      return;
    }

    // POST /move — FormData with 'path' and 'dest' (version-gated ≥1.0.0)
    if (pathname === '/move' && req.method === 'POST') {
      if (!CAPABILITIES.move) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }
      const body = await collectBody(req);
      const ct = req.headers['content-type'] || '';
      let filePath: string;
      let dest: string;

      if (ct.includes('multipart/form-data')) {
        const form = parseFormData(ct, body);
        filePath = form.fields['path'] || '';
        dest = form.fields['dest'] || '';
      } else {
        const json = JSON.parse(body.toString());
        filePath = json.path || '';
        dest = json.dest || '';
      }

      if (!filePath || !dest) {
        jsonResponse(res, 400, { error: 'Missing path or dest' });
        return;
      }
      if (isProtectedPath(filePath)) {
        jsonResponse(res, 403, { error: 'Protected path' });
        return;
      }
      if (!backend.exists(filePath)) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }

      try {
        backend.moveItem(filePath, dest);
        jsonResponse(res, 200, { success: true });
      } catch (err: any) {
        jsonResponse(res, err.status || 500, { error: err.message || 'Move failed' });
      }
      return;
    }

    // POST /upload — HTTP multipart upload, query param 'path' for dest folder
    if (pathname === '/upload' && req.method === 'POST') {
      const destPath = url.searchParams.get('path') || '/';
      const body = await collectBody(req);
      const ct = req.headers['content-type'] || '';

      if (!ct.includes('multipart/form-data')) {
        jsonResponse(res, 400, { error: 'Expected multipart/form-data' });
        return;
      }

      const form = parseFormData(ct, body);
      if (form.files.length === 0) {
        jsonResponse(res, 400, { error: 'No file uploaded' });
        return;
      }

      const file = form.files[0];
      backend.writeFile(destPath, file.fileName, file.data);
      console.log(`[HTTP] Upload: ${file.fileName} (${file.data.length} bytes) → ${destPath}`);
      jsonResponse(res, 200, { success: true });
      return;
    }

    // GET /api/settings (version-gated ≥1.1.0)
    if (pathname === '/api/settings' && req.method === 'GET') {
      if (!CAPABILITIES.settingsApi) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }
      jsonResponse(res, 200, deviceSettings);
      return;
    }

    // POST /api/settings (version-gated ≥1.1.0)
    if (pathname === '/api/settings' && req.method === 'POST') {
      if (!CAPABILITIES.settingsApi) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }
      const body = await collectBody(req);
      try {
        const updates = JSON.parse(body.toString());
        for (const [key, value] of Object.entries(updates)) {
          if (key in deviceSettings) {
            deviceSettings[key] = value as string | number | boolean;
          }
        }
        jsonResponse(res, 200, deviceSettings);
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
      return;
    }

    // GET /download?path=
    if (pathname === '/download' && req.method === 'GET') {
      const filePath = url.searchParams.get('path') || '';
      if (!filePath || !backend.exists(filePath)) {
        jsonResponse(res, 404, { error: 'Not found' });
        return;
      }

      const fileName = filePath.split('/').pop() || 'file';
      const isEpub = fileName.toLowerCase().endsWith('.epub');
      const contentType = isEpub ? 'application/epub+zip' : 'application/octet-stream';

      try {
        const data = backend.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': data.length.toString(),
          'Content-Disposition': `attachment; filename="${fileName}"`,
        });
        res.end(data);
      } catch {
        jsonResponse(res, 500, { error: 'Failed to read file' });
      }
      return;
    }

    // 404 for everything else
    jsonResponse(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[HTTP] Error:', err);
    jsonResponse(res, 500, { error: 'Internal server error' });
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[HTTP] REST API listening on port ${HTTP_PORT}`);
});

// ─── WebSocket Upload Server ───

// @ts-expect-error — ws types use `export =` which hides the Server constructor at runtime
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  let fileName = '';
  let fileSize = 0;
  let destPath = '';
  let received = 0;
  const chunks: Buffer[] = [];

  ws.on('message', (data: Buffer | string) => {
    const msg = typeof data === 'string' ? data : data.toString('utf-8', 0, Math.min(data.length, 200));

    // START:filename:size:path
    if (msg.startsWith('START:')) {
      const parts = msg.split(':');
      fileName = parts[1] || 'unknown';
      fileSize = parseInt(parts[2] || '0', 10);
      destPath = parts[3] || '/';
      received = 0;
      chunks.length = 0;
      console.log(`[WS] Upload start: ${fileName} (${fileSize} bytes) → ${destPath}`);
      ws.send('READY');
      return;
    }

    // Binary data chunk
    if (typeof data !== 'string' && Buffer.isBuffer(data)) {
      received += data.length;
      chunks.push(data);

      // Send PROGRESS every ~64KB
      if (received % (64 * 1024) < (4 * 1024) || received >= fileSize) {
        ws.send(`PROGRESS:${received}:${fileSize}`);
      }

      // Upload complete
      if (received >= fileSize) {
        console.log(`[WS] Upload complete: ${fileName}`);
        ws.send('DONE');

        const fullData = Buffer.concat(chunks);
        backend.writeFile(destPath, fileName, fullData);
        chunks.length = 0;
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
  httpServer.close();
  wss.close();
  process.exit(0);
});

// ─── Startup Banner ───

const capList = Object.entries(CAPABILITIES)
  .filter(([, v]) => v)
  .map(([k]) => k);

console.log('');
console.log('[Mock Device Server]');
console.log(`  Firmware:      ${FIRMWARE_VERSION}`);
console.log(`  Data dir:      ${DATA_DIR ? `${DATA_DIR} (disk-backed)` : 'in-memory'}`);
console.log(`  Capabilities:  ${capList.length ? capList.join(', ') : 'none (pre-1.0.0)'}`);
console.log(`  HTTP API:      port ${HTTP_PORT}`);
console.log(`  WebSocket:     port ${WS_PORT}`);
console.log(`  Hostname:      ${HOSTNAME}`);
console.log('');
console.log('Press Ctrl+C to stop');
console.log('');
