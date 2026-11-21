import { File, Directory, Paths } from 'expo-file-system';
import { DeviceStatus, DeviceFile } from '@/types/device';
import { HTTP_PORT, PLUGIN_RUNNER_PATH, REQUEST_TIMEOUT_MS } from '@/constants/Protocol';
import { log } from './logger';
import { deviceScheduler, type RequestPriority } from './device-request-scheduler';
import { getDeviceCapabilities } from './firmware-version';
import { useDeviceStore } from '@/stores/device-store';

const validatedPaths = new Set<string>();

export function clearValidatedPaths(): void {
  validatedPaths.clear();
}

function invalidatePath(path: string): void {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  for (const cached of validatedPaths) {
    if (cached === normalized || cached.startsWith(normalized + '/')) {
      validatedPaths.delete(cached);
    }
  }
}

function baseUrl(ip: string): string {
  const port = useDeviceStore.getState().connectedDevice?.httpPort ?? HTTP_PORT;
  return `http://${ip}:${port}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const method = options.method ?? 'GET';
  log('api', `${method} ${url}`);
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    log('api', `${method} ${url} → ${res.status} (${Date.now() - start}ms)`);
    return res;
  } catch (err) {
    log('api', `${method} ${url} → Error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getDeviceStatus(
  ip: string,
  opts?: { priority?: RequestPriority; droppable?: boolean; httpPort?: number },
): Promise<DeviceStatus> {
  return deviceScheduler.schedule({
    priority: opts?.priority,
    droppable: opts?.droppable,
    execute: async () => {
      const port = opts?.httpPort ?? useDeviceStore.getState().connectedDevice?.httpPort ?? HTTP_PORT;
      const url = `http://${ip}:${port}/api/status`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
      return res.json();
    },
  });
}

// Called inside a scheduled request, so conflict verification must not enqueue
// another request behind itself on the single-request device scheduler.
async function fetchFileListing(endpoint: string, path: string): Promise<DeviceFile[]> {
  const res = await fetchWithTimeout(
    `${endpoint}/api/files?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) throw new Error(`File listing failed: ${res.status}`);
  const data: Array<{ name: string; size: number; isDirectory: boolean }> = await res.json();
  return data.map((f) => ({
    name: f.name,
    size: f.size,
    isDirectory: f.isDirectory,
    isEpub: !f.isDirectory && f.name.toLowerCase().endsWith('.epub'),
  }));
}

export async function getFiles(ip: string, path: string): Promise<DeviceFile[]> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: () => fetchFileListing(baseUrl(ip), path),
  });
}

export async function createFolder(
  ip: string,
  name: string,
  path: string,
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('path', path);
      const endpoint = baseUrl(ip);
      const res = await fetchWithTimeout(`${endpoint}/mkdir`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) return;

      const detail = (await res.text().catch(() => '')).trim();
      // CrossPoint returns 400 both for invalid names and for existing items
      // (including files). A conflict is safe only after verifying a directory.
      const mayExist = res.status === 409 ||
        (res.status === 400 && detail.toLowerCase() === 'folder already exists');
      let verification = '';
      if (mayExist) {
        try {
          const files = await fetchFileListing(endpoint, path);
          const existing = files.find((file) => file.name.toLowerCase() === name.toLowerCase());
          if (existing?.isDirectory) {
            log('api', `Verified existing folder: ${name} at ${path}`);
            return;
          }
          verification = existing ? '; an existing file is not a directory' : '; existing directory could not be verified';
        } catch (err) {
          verification = `; existing directory could not be verified: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      throw new Error(`Create folder failed (${res.status}): ${detail || res.statusText || 'Unknown error'}${verification}`);
    },
  });
}

export async function deleteItem(
  ip: string,
  path: string,
  type: 'file' | 'folder',
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const version = useDeviceStore.getState().deviceStatus?.version;
      const caps = getDeviceCapabilities(version);

      const formData = new FormData();
      if (caps.batchDelete) {
        // Firmware >= 1.2.0: /delete reads a `paths` form field whose value is
        // a JSON-encoded array string (ESP32 WebServer arg, not a JSON body).
        formData.append('paths', JSON.stringify([path]));
      } else {
        // Firmware < 1.2.0: single `path` form field plus item `type`.
        formData.append('path', path);
        formData.append('type', type);
      }

      const res = await fetchWithTimeout(`${baseUrl(ip)}/delete`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        log('api', `Delete failed (${res.status}): ${text}`);
        throw new Error(text || 'Failed to delete item');
      }
      if (type === 'folder') invalidatePath(path);
    },
  });
}

export async function renameFile(
  ip: string,
  filePath: string,
  newName: string,
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const formData = new FormData();
      formData.append('path', filePath);
      formData.append('name', newName);
      const res = await fetchWithTimeout(`${baseUrl(ip)}/rename`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        log('api', `Rename failed (${res.status}): ${text}`);
        if (res.status === 409) throw new Error('A file with that name already exists');
        if (res.status === 403) throw new Error('This file is protected and cannot be renamed');
        if (res.status === 404) throw new Error('File not found');
        throw new Error(text || 'Failed to rename file');
      }
    },
  });
}

export async function moveFile(
  ip: string,
  filePath: string,
  destFolder: string,
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const formData = new FormData();
      formData.append('path', filePath);
      formData.append('dest', destFolder);
      const res = await fetchWithTimeout(`${baseUrl(ip)}/move`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        log('api', `Move failed (${res.status}): ${text}`);
        if (res.status === 409) throw new Error('A file with that name already exists in the destination');
        if (res.status === 404) throw new Error('File not found');
        throw new Error(text || 'Failed to move file');
      }
    },
  });
}

export async function ensureRemotePath(ip: string, remotePath: string): Promise<void> {
  if (!remotePath || remotePath === '/') return;

  const normalized = remotePath.replace(/\/+$/, '');
  if (validatedPaths.has(normalized)) {
    log('api', `Path already validated: ${normalized}`);
    return;
  }

  const segments = normalized.split('/').filter(Boolean);
  let currentPath = '/';

  for (const segment of segments) {
    const segmentPath = currentPath === '/' ? `/${segment}` : `${currentPath}/${segment}`;

    if (validatedPaths.has(segmentPath)) {
      currentPath = segmentPath;
      continue;
    }

    let exists = false;
    try {
      const files = await getFiles(ip, currentPath);
      exists = files.some((f) => f.isDirectory && f.name.toLowerCase() === segment.toLowerCase());
    } catch (err) {
      // Some firmware cannot list a missing parent. Creation still has to
      // succeed or verify an existing directory before this path is cached.
      log('api', `Parent listing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!exists) {
      await createFolder(ip, segment, currentPath);
      log('api', `Created folder: ${segment} at ${currentPath}`);
    }

    validatedPaths.add(segmentPath);
    currentPath = segmentPath;
  }
}

export async function downloadFile(
  ip: string,
  remotePath: string,
): Promise<string> {
  return deviceScheduler.schedule({
    execute: async () => {
      const file = await File.downloadFileAsync(
        `${baseUrl(ip)}/download?path=${encodeURIComponent(remotePath)}`,
        new Directory(Paths.cache),
        { idempotent: true },
      );
      return file.uri;
    },
  });
}

// ── SD-plugin job queue (firmware 2.0.0+) ──────────────────────────────────

export interface DevicePlugin {
  name: string;
  title?: string;
  version?: string;
  /** False for device.json-only plugins, which cannot run browser actions. */
  hasPluginJs?: boolean;
}

export type PluginJobState = 'pending' | 'running' | 'done' | 'error' | 'unknown';

export interface PluginJobStatus {
  id: number;
  state: PluginJobState;
  result: Record<string, unknown> | null;
}

/** Settings → Connectivity → Plugins is disabled on the reader (HTTP 403). */
export class PluginsDisabledError extends Error {
  constructor() {
    super('Plugins are disabled on the reader');
    this.name = 'PluginsDisabledError';
  }
}

async function readError(res: Response): Promise<string> {
  const text = (await res.text().catch(() => '')).trim();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {}
  return text || res.statusText || `HTTP ${res.status}`;
}

// Plugin job traffic runs while the queue holds the device busy, so these
// requests bypass the external-busy gate that pauses status polling.
export async function getPlugins(ip: string): Promise<DevicePlugin[]> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: async () => {
      const res = await fetchWithTimeout(`${baseUrl(ip)}/api/plugins`);
      // Firmware without the plugin system has no such route.
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`Plugin list failed (${res.status}): ${await readError(res)}`);
      const data: unknown = await res.json();
      return Array.isArray(data) ? data.filter((p): p is DevicePlugin => typeof p?.name === 'string') : [];
    },
  });
}

export async function submitPluginJob(
  ip: string,
  plugin: string,
  action: string,
  args: Record<string, unknown>,
): Promise<number> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: async () => {
      const res = await fetchWithTimeout(`${baseUrl(ip)}/api/plugin-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin, action, args }),
      });
      if (res.status === 403) throw new PluginsDisabledError();
      if (!res.ok) throw new Error(`Plugin job rejected (${res.status}): ${await readError(res)}`);
      const { id } = (await res.json()) as { id?: unknown };
      if (typeof id !== 'number' || id <= 0) throw new Error('Plugin job response had no id');
      return id;
    },
  });
}

export async function getPluginJobStatus(ip: string, id: number): Promise<PluginJobStatus> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: async () => {
      const res = await fetchWithTimeout(`${baseUrl(ip)}/api/plugin-jobs/status?id=${id}`);
      if (res.status === 403) throw new PluginsDisabledError();
      if (!res.ok) throw new Error(`Plugin job status failed (${res.status}): ${await readError(res)}`);
      const data = (await res.json()) as Partial<PluginJobStatus>;
      const states: PluginJobState[] = ['pending', 'running', 'done', 'error', 'unknown'];
      return {
        id,
        state: states.includes(data.state as PluginJobState) ? (data.state as PluginJobState) : 'unknown',
        result: data.result && typeof data.result === 'object' ? data.result : null,
      };
    },
  });
}

export function pluginRunnerUrl(ip: string): string {
  return `${baseUrl(ip)}${PLUGIN_RUNNER_PATH}`;
}
