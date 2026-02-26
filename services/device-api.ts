import { File, Directory, Paths } from 'expo-file-system';
import { DeviceStatus, DeviceFile } from '@/types/device';
import { HTTP_PORT, REQUEST_TIMEOUT_MS } from '@/constants/Protocol';
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

export async function getFiles(ip: string, path: string): Promise<DeviceFile[]> {
  return deviceScheduler.schedule({
    ignoreExternalBusy: true,
    execute: async () => {
      const res = await fetchWithTimeout(
        `${baseUrl(ip)}/api/files?path=${encodeURIComponent(path)}`,
      );
      if (!res.ok) throw new Error(`File listing failed: ${res.status}`);
      const data: Array<{ name: string; size: number; isDirectory: boolean }> = await res.json();
      return data.map((f) => ({
        name: f.name,
        size: f.size,
        isDirectory: f.isDirectory,
        isEpub: !f.isDirectory && f.name.toLowerCase().endsWith('.epub'),
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
  type: 'file' | 'folder',
): Promise<void> {
  return deviceScheduler.schedule({
    execute: async () => {
      const version = useDeviceStore.getState().deviceStatus?.version;
      const caps = getDeviceCapabilities(version);

      let body: FormData | string;
      let headers: Record<string, string> | undefined;

      if (caps.batchDelete) {
        body = JSON.stringify({ paths: [path] });
        headers = { 'Content-Type': 'application/json' };
      } else {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('type', type);
        body = formData;
      }

      const res = await fetchWithTimeout(`${baseUrl(ip)}/delete`, {
        method: 'POST',
        body,
        headers,
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

    try {
      const files = await getFiles(ip, currentPath);
      const exists = files.some((f) => f.isDirectory && f.name.toLowerCase() === segment.toLowerCase());
      if (!exists) {
        await createFolder(ip, segment, currentPath);
        log('api', `Created folder: ${segment} at ${currentPath}`);
      }
    } catch {
      // Listing failed (parent may not exist yet on some firmwares) — try creating
      await createFolder(ip, segment, currentPath);
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
