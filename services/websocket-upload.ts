import { File } from 'expo-file-system';
import { CHUNK_SIZE, CHUNK_DELAY_MS } from '@/constants/Protocol';

interface UploadCallbacks {
  onProgress: (bytesTransferred: number, totalBytes: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => resolve();
        ws!.onerror = (e) =>
          reject(new Error(`WebSocket connect failed: ${(e as any).message || 'unknown'}`));
      });

      if (cancelled) return;

      // Send START command
      ws.send(`START:${fileName}:${fileSize}:${destPath}`);

      // Wait for READY
      await new Promise<void>((resolve, reject) => {
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
      });

      if (cancelled) return;

      // Set up progress/completion listener
      let uploadResolve: () => void;
      let uploadReject: (err: Error) => void;
      const uploadPromise = new Promise<void>((resolve, reject) => {
        uploadResolve = resolve;
        uploadReject = reject;
      });

      ws.onmessage = (event) => {
        const msg = typeof event.data === 'string' ? event.data : '';
        if (msg.startsWith('PROGRESS:')) {
          const parts = msg.split(':');
          const received = parseInt(parts[1], 10);
          const total = parseInt(parts[2], 10);
          callbacks.onProgress(received, total);
        } else if (msg === 'DONE') {
          uploadResolve();
        } else if (msg.startsWith('ERROR:')) {
          uploadReject(new Error(msg.slice(6)));
        }
      };

      ws.onerror = (e) => {
        uploadReject(
          new Error(`WebSocket error during upload: ${(e as any).message || 'unknown'}`),
        );
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
