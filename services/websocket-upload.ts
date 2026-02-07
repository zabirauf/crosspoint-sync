import { File } from 'expo-file-system';
import { CHUNK_SIZE, CHUNK_DELAY_MS, UPLOAD_TIMEOUT_MS } from '@/constants/Protocol';

interface UploadCallbacks {
  onProgress: (bytesTransferred: number, totalBytes: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export function uploadFileViaWebSocket(
  deviceIp: string,
  wsPort: number,
  fileUri: string,
  fileName: string,
  fileSize: number,
  destPath: string,
  callbacks: UploadCallbacks,
): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;

  async function run() {
    let handle: ReturnType<File['open']> | null = null;
    try {
      ws = new WebSocket(`ws://${deviceIp}:${wsPort}/`);
      ws.binaryType = 'arraybuffer';

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          ws!.onopen = () => resolve();
          ws!.onerror = (e) =>
            reject(new Error(`WebSocket connect failed: ${(e as any).message || 'unknown'}`));
          ws!.onclose = () => reject(new Error('WebSocket closed before connection opened'));
        }),
        UPLOAD_TIMEOUT_MS,
        'Timed out waiting for WebSocket connection',
      );

      if (cancelled) return;

      // Send START command
      ws.send(`START:${fileName}:${fileSize}:${destPath}`);

      // Wait for READY
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          ws!.onmessage = (event) => {
            const msg = typeof event.data === 'string' ? event.data : '';
            if (msg === 'READY') {
              resolve();
            } else if (msg.startsWith('ERROR:')) {
              reject(new Error(msg.slice(6)));
            }
          };
          ws!.onerror = (e) =>
            reject(new Error(`WebSocket error: ${(e as any).message || 'unknown'}`));
          ws!.onclose = () => reject(new Error('WebSocket closed while waiting for READY'));
        }),
        UPLOAD_TIMEOUT_MS,
        'Timed out waiting for device READY response',
      );

      if (cancelled) return;

      // Set up progress/completion listener with resettable timeout
      let uploadResolve: () => void;
      let uploadReject: (err: Error) => void;
      const uploadPromise = new Promise<void>((resolve, reject) => {
        uploadResolve = resolve;
        uploadReject = reject;
      });

      let uploadTimeoutId: ReturnType<typeof setTimeout>;
      const resetUploadTimeout = () => {
        clearTimeout(uploadTimeoutId);
        uploadTimeoutId = setTimeout(() => {
          uploadReject(new Error('Timed out waiting for upload completion'));
        }, UPLOAD_TIMEOUT_MS);
      };
      resetUploadTimeout();

      ws.onmessage = (event) => {
        const msg = typeof event.data === 'string' ? event.data : '';
        if (msg.startsWith('PROGRESS:')) {
          resetUploadTimeout();
          const parts = msg.split(':');
          const received = parseInt(parts[1], 10);
          const total = parseInt(parts[2], 10);
          callbacks.onProgress(received, total);
        } else if (msg === 'DONE') {
          clearTimeout(uploadTimeoutId);
          uploadResolve();
        } else if (msg.startsWith('ERROR:')) {
          clearTimeout(uploadTimeoutId);
          uploadReject(new Error(msg.slice(6)));
        }
      };

      ws.onerror = (e) => {
        clearTimeout(uploadTimeoutId);
        uploadReject(
          new Error(`WebSocket error during upload: ${(e as any).message || 'unknown'}`),
        );
      };

      ws.onclose = () => {
        clearTimeout(uploadTimeoutId);
        uploadReject(new Error('WebSocket closed during upload'));
      };

      // Read file in chunks using FileHandle and send as binary
      const file = new File(fileUri);
      handle = file.open();
      let offset = 0;

      while (offset < fileSize && !cancelled) {
        const readLength = Math.min(CHUNK_SIZE, fileSize - offset);
        const chunk = handle.readBytes(readLength);
        ws.send(chunk.buffer);
        offset += readLength;
        await delay(CHUNK_DELAY_MS);
      }

      handle.close();
      handle = null;

      if (cancelled) return;

      // Wait for DONE or ERROR from device
      await uploadPromise;
      callbacks.onComplete();
    } catch (err) {
      if (!cancelled) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (handle) {
        try {
          handle.close();
        } catch {
          // handle may already be closed
        }
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }

  run();

  return () => {
    cancelled = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}
