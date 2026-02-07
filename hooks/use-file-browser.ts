import { useState, useCallback, useEffect } from 'react';
import { DeviceFile } from '@/types/device';
import { getFiles, createFolder, deleteItem } from '@/services/device-api';
import { useDeviceStore } from '@/stores/device-store';
import { DEFAULT_UPLOAD_PATH } from '@/constants/Protocol';

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
      setIsLoading(true);
      setError(null);
      try {
        const result = await getFiles(connectedDevice.ip, targetPath);
        // Sort: directories first, then alphabetically
        result.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
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
      setCurrentPath(newPath);
      loadFiles(newPath);
    },
    [currentPath, loadFiles],
  );

  const navigateUp = useCallback(() => {
    if (currentPath === '/') return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    setCurrentPath(parent);
    loadFiles(parent);
  }, [currentPath, loadFiles]);

  const createNewFolder = useCallback(
    async (name: string) => {
      if (!connectedDevice) return;
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
  };
}
