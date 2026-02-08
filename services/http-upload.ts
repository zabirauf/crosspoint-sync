import Upload from 'react-native-background-upload';
import type { EventSubscription } from 'react-native';
import { HTTP_PORT } from '@/constants/Protocol';
import { log } from './logger';

export interface HttpUploadHandle {
  uploadId: string;
  cancel: () => Promise<void>;
  getProgress: () => number;
}

interface HttpUploadCallbacks {
  onProgress: (bytesTransferred: number, totalBytes: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function startHttpBackgroundUpload(
  deviceIp: string,
  fileUri: string,
  fileName: string,
  fileSize: number,
  destPath: string,
  callbacks: HttpUploadCallbacks,
): Promise<HttpUploadHandle> {
  const url = `http://${deviceIp}:${HTTP_PORT}/upload?path=${encodeURIComponent(destPath)}`;
  let currentProgress = 0;
  const listeners: EventSubscription[] = [];

  log('upload', `Starting HTTP background upload: ${fileName} → ${url}`);

  // Normalize file URI for the native module — strip file:// prefix if present
  const filePath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;

  const uploadId = await Upload.startUpload({
    url,
    path: filePath,
    type: 'multipart',
    method: 'POST',
    field: 'file',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  log('upload', `HTTP upload started with id: ${uploadId}`);

  listeners.push(
    Upload.addListener('progress', uploadId, (data) => {
      currentProgress = data.progress / 100; // progress is 0-100, normalize to 0-1
      const bytesTransferred = Math.round(currentProgress * fileSize);
      callbacks.onProgress(bytesTransferred, fileSize);
    }),
  );

  listeners.push(
    Upload.addListener('completed', uploadId, (data) => {
      cleanup();
      if (data.responseCode >= 200 && data.responseCode < 300) {
        log('upload', `HTTP upload completed: ${fileName}`);
        callbacks.onComplete();
      } else {
        log('upload', `HTTP upload failed with status ${data.responseCode}: ${data.responseBody}`);
        callbacks.onError(new Error(`HTTP upload failed with status ${data.responseCode}`));
      }
    }),
  );

  listeners.push(
    Upload.addListener('error', uploadId, (data) => {
      cleanup();
      log('upload', `HTTP upload error: ${data.error}`);
      callbacks.onError(new Error(data.error));
    }),
  );

  listeners.push(
    Upload.addListener('cancelled', uploadId, () => {
      cleanup();
      log('upload', `HTTP upload cancelled: ${fileName}`);
    }),
  );

  function cleanup() {
    for (const listener of listeners) {
      listener.remove();
    }
    listeners.length = 0;
  }

  return {
    uploadId,
    cancel: async () => {
      cleanup();
      await Upload.cancelUpload(uploadId);
      log('upload', `HTTP upload cancelled: ${uploadId}`);
    },
    getProgress: () => currentProgress,
  };
}
