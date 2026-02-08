import { useState, useCallback, useEffect } from 'react';
import * as Sharing from 'expo-sharing';
import { DeviceFile } from '@/types/device';
import { getFiles, createFolder, deleteItem, downloadFile } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { DEFAULT_UPLOAD_PATH } from '@/constants/Protocol';
import { log } from '@/services/logger';

export function useFileBrowser() {
  const [currentPath, setCurrentPath] = useState(DEFAULT_UPLOAD_PATH);
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connectedDevice, connectionStatus } = useDeviceStore();

  const loadFiles = useCallback(
    async (path?: string) => {
      if (!connectedDevice || connectionStatus !== 'connected') return;
      const targetPath = path ?? currentPath;
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
        setError(err instanceof Error ? err.message : 'Failed to load files');
        setFiles([]);
      } finally {
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

  const createNewFolder = useCallback(
    async (name: string) => {
      if (!connectedDevice) return;
      log('api', `Create folder: ${name} at ${currentPath}`);
      try {
        await createFolder(connectedDevice.ip, name, currentPath);
        await loadFiles();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create folder');
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
          file.isDirectory ? 'dir' : 'file',
        );
        await loadFiles();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      }
    },
    [connectedDevice, currentPath, loadFiles],
  );

  const downloadFileFromDevice = useCallback(
    async (file: DeviceFile) => {
      if (!connectedDevice) return;
      const fullPath =
        currentPath === '/'
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;
      log('api', `Download file: ${fullPath}`);
      try {
        const localUri = await downloadFile(connectedDevice.ip, fullPath);
        const mimeType = file.name.toLowerCase().endsWith('.epub')
          ? 'application/epub+zip'
          : file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'application/octet-stream';
        await Sharing.shareAsync(localUri, { mimeType });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to download file');
      }
    },
    [connectedDevice, currentPath],
  );

  // Reload when connected or path changes
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadFiles();
    } else {
      setFiles([]);
    }
  }, [connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    currentPath,
    files,
    isLoading,
    error,
    loadFiles,
    navigateToFolder,
    navigateUp,
    createNewFolder,
    deleteFileOrFolder,
    downloadFileFromDevice,
  };
}
