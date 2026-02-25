import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Sharing from 'expo-sharing';
import { DeviceFile } from '@/types/device';
import { getFiles, createFolder, deleteItem, downloadFile, renameFile, moveFile } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { DEFAULT_UPLOAD_PATH } from '@/constants/Protocol';
import { log } from '@/services/logger';
import { getDeviceCapabilities } from '@/services/firmware-version';

export function useFileBrowser() {
  const [currentPath, setCurrentPath] = useState(DEFAULT_UPLOAD_PATH);
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connectedDevice, connectionStatus, deviceStatus } = useDeviceStore();
  const lastCompletionEvent = useUploadStore((s) => s.lastCompletionEvent);
  const hasPendingUploadsToPath = useUploadStore((s) =>
    s.jobs.some(
      (j) => j.status === 'pending' && j.destinationPath === currentPath,
    ),
  );
  const loadingPathRef = useRef<string | null>(null);
  const capabilities = useMemo(
    () => getDeviceCapabilities(deviceStatus?.version),
    [deviceStatus?.version],
  );

  const loadFiles = useCallback(
    async (path?: string) => {
      if (!connectedDevice || connectionStatus !== 'connected') return;
      const targetPath = path ?? currentPath;
      if (loadingPathRef.current === targetPath) return; // already loading this path
      loadingPathRef.current = targetPath;
      log('api', `Loading files: ${targetPath}`);
      setIsLoading(true);
      setError(null);
      try {
        const result = await getFiles(connectedDevice.ip, targetPath);
        // Sort: directories first, then alphabetically
        result.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        log('api', `Loaded ${result.length} items from ${targetPath}`);
        setFiles(result);
      } catch (err) {
        log('api', `Load files error: ${err instanceof Error ? err.message : String(err)}`);
        setError("Couldn't load files. Pull down to retry.");
        setFiles([]);
      } finally {
        loadingPathRef.current = null;
        setIsLoading(false);
      }
    },
    [connectedDevice, connectionStatus, currentPath],
  );

  const navigateToFolder = useCallback(
    (folderName: string) => {
      const newPath =
        currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
      log('api', `Navigate to: ${newPath}`);
      setCurrentPath(newPath);
      loadFiles(newPath);
    },
    [currentPath, loadFiles],
  );

  const navigateUp = useCallback(() => {
    if (currentPath === '/') return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    log('api', `Navigate up to: ${parent}`);
    setCurrentPath(parent);
    loadFiles(parent);
  }, [currentPath, loadFiles]);

  const navigateToPath = useCallback(
    (absolutePath: string) => {
      log('api', `Navigate to path: ${absolutePath}`);
      setCurrentPath(absolutePath);
      loadFiles(absolutePath);
    },
    [loadFiles],
  );

  const createNewFolder = useCallback(
    async (name: string) => {
      if (!connectedDevice) return;
      log('api', `Create folder: ${name} at ${currentPath}`);
      try {
        await createFolder(connectedDevice.ip, name, currentPath);
        await loadFiles();
      } catch (err) {
        log('api', `Create folder error: ${err instanceof Error ? err.message : String(err)}`);
        setError("Couldn't create folder. Please try again.");
      }
    },
    [connectedDevice, currentPath, loadFiles],
  );

  const deleteFileOrFolder = useCallback(
    async (file: DeviceFile) => {
      if (!connectedDevice) return;
      const fullPath =
        currentPath === '/'
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;
      log('api', `Delete ${file.isDirectory ? 'folder' : 'file'}: ${fullPath}`);
      try {
        await deleteItem(
          connectedDevice.ip,
          fullPath,
          file.isDirectory ? 'folder' : 'file',
        );
        await loadFiles();
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        log('api', `Delete error: ${raw}`);
        if (raw.toLowerCase().includes('not empty')) {
          setError("This folder isn't empty. Delete the files inside it first.");
        } else {
          setError(`Couldn't delete "${file.name}". Please try again.`);
        }
      }
    },
    [connectedDevice, currentPath, loadFiles],
  );

  const renameFileOnDevice = useCallback(
    async (file: DeviceFile, newName: string) => {
      if (!connectedDevice) return;
      if (/[/\\]/.test(newName)) {
        setError('File names cannot contain / or \\ characters.');
        return;
      }
      const fullPath =
        currentPath === '/'
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;
      log('api', `Rename: ${fullPath} → ${newName}`);
      try {
        await renameFile(connectedDevice.ip, fullPath, newName);
        await loadFiles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('api', `Rename error: ${msg}`);
        setError(msg);
      }
    },
    [connectedDevice, currentPath, loadFiles],
  );

  const moveFileOnDevice = useCallback(
    async (file: DeviceFile, destFolder: string) => {
      if (!connectedDevice) return;
      const fullPath =
        currentPath === '/'
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;
      log('api', `Move: ${fullPath} → ${destFolder}`);
      try {
        await moveFile(connectedDevice.ip, fullPath, destFolder);
        await loadFiles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('api', `Move error: ${msg}`);
        setError(msg);
      }
    },
    [connectedDevice, currentPath, loadFiles],
  );

  const createFolderAtPath = useCallback(
    async (name: string, parentPath: string) => {
      if (!connectedDevice) return;
      log('api', `Create folder: ${name} at ${parentPath}`);
      try {
        await createFolder(connectedDevice.ip, name, parentPath);
      } catch (err) {
        log('api', `Create folder error: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },
    [connectedDevice],
  );

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [queuedDownloads, setQueuedDownloads] = useState<string[]>([]);
  const isProcessingRef = useRef(false);
  // Refs to read latest state inside the processing loop without re-creating the callback
  const connectedDeviceRef = useRef(connectedDevice);
  const currentPathRef = useRef(currentPath);
  connectedDeviceRef.current = connectedDevice;
  currentPathRef.current = currentPath;

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      while (true) {
        // Shift next item from the queue
        let nextFile: string | undefined;
        setQueuedDownloads((prev) => {
          if (prev.length === 0) return prev;
          nextFile = prev[0];
          return prev.slice(1);
        });

        // Need to await a tick for the setState to flush so we can read nextFile
        await new Promise((r) => setTimeout(r, 0));
        if (!nextFile) break;

        const device = connectedDeviceRef.current;
        if (!device) break;

        const path = currentPathRef.current;
        const fullPath = path === '/' ? `/${nextFile}` : `${path}/${nextFile}`;

        setDownloadingFile(nextFile);
        log('api', `Download file: ${fullPath}`);

        try {
          const localUri = await downloadFile(device.ip, fullPath);
          const mimeType = nextFile.toLowerCase().endsWith('.epub')
            ? 'application/epub+zip'
            : 'application/octet-stream';
          await Sharing.shareAsync(localUri, { mimeType });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to download file');
        }

        setDownloadingFile(null);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  const queueDownload = useCallback(
    (file: DeviceFile) => {
      if (!connectedDevice) return;
      // Check for duplicates against current downloading + queued
      setQueuedDownloads((prev) => {
        if (downloadingFile === file.name || prev.includes(file.name)) return prev;
        return [...prev, file.name];
      });
      // Kick off processing (no-op if already running)
      setTimeout(() => processQueue(), 0);
    },
    [connectedDevice, downloadingFile, processQueue],
  );

  // Reload when connected or path changes
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh file list after upload completion
  useEffect(() => {
    if (!lastCompletionEvent) return;
    if (lastCompletionEvent.path !== currentPath) return;
    if (hasPendingUploadsToPath) return;

    const timer = setTimeout(() => {
      log('api', `Auto-refresh after upload to ${currentPath}`);
      loadFiles();
    }, 500);

    return () => clearTimeout(timer);
  }, [lastCompletionEvent, currentPath, hasPendingUploadsToPath, loadFiles]);

  return {
    currentPath,
    files,
    isLoading,
    error,
    capabilities,
    loadFiles,
    navigateToFolder,
    navigateUp,
    navigateToPath,
    createNewFolder,
    deleteFileOrFolder,
    renameFileOnDevice,
    moveFileOnDevice,
    createFolderAtPath,
    downloadingFile,
    queuedDownloads,
    queueDownload,
  };
}
