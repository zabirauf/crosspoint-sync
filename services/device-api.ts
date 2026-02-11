import { File, Directory, Paths } from 'expo-file-system';
import { DeviceStatus, DeviceFile } from '@/types/device';
import { HTTP_PORT, REQUEST_TIMEOUT_MS } from '@/constants/Protocol';
import { log } from './logger';
import { deviceScheduler, type RequestPriority } from './device-request-scheduler';

function baseUrl(ip: string): string {
  return `http://${ip}:${HTTP_PORT}`;
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
  opts?: { priority?: RequestPriority; droppable?: boolean },
): Promise<DeviceStatus> {
  return deviceScheduler.schedule({
    priority: opts?.priority,
    droppable: opts?.droppable,
    execute: async () => {
      const res = await fetchWithTimeout(`${baseUrl(ip)}/api/status`);
      if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
      return res.json();
    },
  });
}

export async function getFiles(ip: string, path: string): Promise<DeviceFile[]> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: async () => {
      const res = await fetchWithTimeout(
        `${baseUrl(ip)}/api/files?path=${encodeURIComponent(path)}`,
      );
      if (!res.ok) throw new Error(`File listing failed: ${res.status}`);
      const data: Array<{ name: string; size: number; dir: boolean }> = await res.json();
      return data.map((f) => ({
        name: f.name,
        size: f.size,
        isDirectory: f.dir,
        isEpub: !f.dir && f.name.toLowerCase().endsWith('.epub'),
      }));
    },
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
      const res = await fetchWithTimeout(`${baseUrl(ip)}/mkdir`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`Create folder failed: ${res.status}`);
    },
  });
}

export async function deleteItem(
  ip: string,
  path: string,
  type: 'file' | 'dir',
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const formData = new FormData();
      formData.append('path', path);
      formData.append('type', type);
      const res = await fetchWithTimeout(`${baseUrl(ip)}/delete`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    },
  });
}

export async function ensureRemotePath(ip: string, remotePath: string): Promise<void> {
  if (!remotePath || remotePath === '/') return;

  const segments = remotePath.replace(/\/+$/, '').split('/').filter(Boolean);
  let currentPath = '/';

  for (const segment of segments) {
    try {
      const files = await getFiles(ip, currentPath);
      const exists = files.some((f) => f.isDirectory && f.name === segment);
      if (!exists) {
        await createFolder(ip, segment, currentPath);
        log('api', `Created folder: ${segment} at ${currentPath}`);
      }
    } catch {
      // Listing failed (parent may not exist yet on some firmwares) — try creating
      await createFolder(ip, segment, currentPath);
    }
    currentPath = currentPath === '/' ? `/${segment}` : `${currentPath}/${segment}`;
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
