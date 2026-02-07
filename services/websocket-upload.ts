import { File } from 'expo-file-system';
import {
  CHUNK_SIZE,
  CHUNKS_PER_WINDOW,
  PROGRESS_ACK_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from '@/constants/Protocol';
import { log } from './logger';

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
      log('upload', `Connecting to ws://${deviceIp}:${wsPort}`);
      ws = new WebSocket(`ws://${deviceIp}:${wsPort}/`);
      ws.binaryType = 'arraybuffer';

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          ws!.onopen = () => {
            log('upload', 'WebSocket connected');
            resolve();
          };
          ws!.onerror = (e) => {
            log('upload', `Connection error: ${(e as any).message || 'unknown'}`);
            reject(new Error(`WebSocket connect failed: ${(e as any).message || 'unknown'}`));
          };
          ws!.onclose = () => {
            log('upload', 'WebSocket closed before open');
            reject(new Error('WebSocket closed before connection opened'));
          };
        }),
        UPLOAD_TIMEOUT_MS,
        'Timed out waiting for WebSocket connection',
      );

      if (cancelled) return;

      // Send START command
      ws.send(`START:${fileName}:${fileSize}:${destPath}`);
      log('upload', `START sent: ${fileName} (${fileSize} bytes) → ${destPath}`);

      // Wait for READY
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          ws!.onmessage = (event) => {
            const msg = typeof event.data === 'string' ? event.data : '';
            if (msg === 'READY') {
              log('upload', 'Device READY, starting transfer');
              resolve();
            } else if (msg.startsWith('ERROR:')) {
              log('upload', `Device error: ${msg.slice(6)}`);
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
      // Suppress unhandled rejection — onclose rejects while chunk loop is still running,
      // but the error propagates correctly when we `await uploadPromise` below.
      uploadPromise.catch(() => {});

      let uploadTimeoutId: ReturnType<typeof setTimeout>;
      const resetUploadTimeout = () => {
        clearTimeout(uploadTimeoutId);
        uploadTimeoutId = setTimeout(() => {
          uploadReject(new Error('Timed out waiting for upload completion'));
        }, UPLOAD_TIMEOUT_MS);
      };
      resetUploadTimeout();

      // Backpressure: wait for device PROGRESS ack before sending next window
      let progressResolve: (() => void) | null = null;
      function waitForProgress(): Promise<void> {
        return new Promise((resolve) => {
          progressResolve = resolve;
        });
      }

      let connectionAlive = true;
      let lastLoggedPercent = 0;
      ws.onmessage = (event) => {
        const msg = typeof event.data === 'string' ? event.data : '';
        if (msg.startsWith('PROGRESS:')) {
          resetUploadTimeout();
          const parts = msg.split(':');
          const received = parseInt(parts[1], 10);
          const total = parseInt(parts[2], 10);
          const percent = Math.floor((received / total) * 100);
          if (percent >= lastLoggedPercent + 10) {
            log('upload', `Progress: ${percent}% (${received}/${total})`);
            lastLoggedPercent = percent - (percent % 10);
          }
          callbacks.onProgress(received, total);
          // Signal the chunk loop that device has consumed data
          if (progressResolve) {
            progressResolve();
            progressResolve = null;
          }
        } else if (msg === 'DONE') {
          clearTimeout(uploadTimeoutId);
          log('upload', `Upload complete: ${fileName}`);
          uploadResolve();
        } else if (msg.startsWith('ERROR:')) {
          clearTimeout(uploadTimeoutId);
          log('upload', `Device error: ${msg.slice(6)}`);
          uploadReject(new Error(msg.slice(6)));
        }
      };

      ws.onerror = (e) => {
        connectionAlive = false;
        clearTimeout(uploadTimeoutId);
        log('upload', `WebSocket error during upload: ${(e as any).message || 'unknown'}`);
        uploadReject(
          new Error(`WebSocket error during upload: ${(e as any).message || 'unknown'}`),
        );
        // Unblock chunk loop so it can exit
        if (progressResolve) {
          progressResolve();
          progressResolve = null;
        }
      };

      ws.onclose = () => {
        connectionAlive = false;
        clearTimeout(uploadTimeoutId);
        log('upload', 'WebSocket closed during upload');
        uploadReject(new Error('WebSocket closed during upload'));
        // Unblock chunk loop so it can exit
        if (progressResolve) {
          progressResolve();
          progressResolve = null;
        }
      };

      // Read file in chunks using FileHandle and send as binary (windowed)
      const file = new File(fileUri);
      handle = file.open();
      const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
      log('upload', `Sending ${chunkCount} chunks (${fileSize} bytes), window=${CHUNKS_PER_WINDOW}`);
      let offset = 0;
      let chunksSinceAck = 0;

      while (offset < fileSize && !cancelled && connectionAlive) {
        if (ws.readyState !== WebSocket.OPEN) {
          log('upload', 'WebSocket no longer open, stopping send loop');
          break;
        }

        const readLength = Math.min(CHUNK_SIZE, fileSize - offset);
        const chunk = handle.readBytes(readLength);
        ws.send(chunk);
        offset += readLength;
        chunksSinceAck++;

        // After sending a full window, wait for device to ack via PROGRESS
        if (chunksSinceAck >= CHUNKS_PER_WINDOW && offset < fileSize) {
          await Promise.race([waitForProgress(), delay(PROGRESS_ACK_TIMEOUT_MS)]);
          chunksSinceAck = 0;

          // Check connection is still alive after waiting
          if (!connectionAlive || ws.readyState !== WebSocket.OPEN) {
            log('upload', 'Connection lost while waiting for progress ack');
            break;
          }
        } else if (chunksSinceAck % 4 === 0) {
          // Yield to event loop every 4 chunks so PROGRESS/error handlers can fire
          await delay(0);
        }
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
    log('upload', `Upload cancelled: ${fileName}`);
    cancelled = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}
