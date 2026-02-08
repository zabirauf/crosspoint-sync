import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { uploadFileViaWebSocket } from './websocket-upload';
import { startHttpBackgroundUpload, type HttpUploadHandle } from './http-upload';
import { getFiles } from './device-api';
import { log } from './logger';
import { deviceScheduler } from './device-request-scheduler';
import { BACKGROUND_UPGRADE_THRESHOLD } from '@/constants/Protocol';

let cancelCurrentUpload: (() => void) | null = null;
let isProcessing = false;

// Background upload state
let currentUploadMethod: 'websocket' | 'http' | null = null;
let httpUploadHandle: HttpUploadHandle | null = null;
let currentUploadJobId: string | null = null;

// Cache directory listings within a processing chain to avoid redundant API calls
const dirListingCache = new Map<string, string[]>();

async function getRemoteFileNames(ip: string, dirPath: string): Promise<string[]> {
  const cached = dirListingCache.get(dirPath);
  if (cached) return cached;

  try {
    const files = await getFiles(ip, dirPath);
    const names = files.map((f) => f.name);
    dirListingCache.set(dirPath, names);
    return names;
  } catch (err) {
    log('queue', `Conflict check failed for ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function clearUploadState() {
  cancelCurrentUpload = null;
  httpUploadHandle = null;
  currentUploadMethod = null;
  currentUploadJobId = null;
  deviceScheduler.setExternalBusy(false);
}

async function processNextJob() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (true) {
      const { jobs, updateJobStatus, updateJobProgress } = useUploadStore.getState();
      const { connectedDevice, connectionStatus } = useDeviceStore.getState();

      if (connectionStatus !== 'connected' || !connectedDevice) {
        log('queue', 'Skip: no device connected');
        break;
      }

      const activeJob = jobs.find((j) => j.status === 'uploading');
      if (activeJob) {
        log('queue', `Skip: job ${activeJob.id} already uploading`);
        break;
      }

      const nextJob = jobs.find((j) => j.status === 'pending');
      if (!nextJob) {
        log('queue', 'No pending jobs');
        break;
      }

      // Conflict check: skip if forceUpload is set
      if (!nextJob.forceUpload) {
        const remoteNames = await getRemoteFileNames(connectedDevice.ip, nextJob.destinationPath);
        if (remoteNames.includes(nextJob.fileName)) {
          log('queue', `Conflict: ${nextJob.fileName} already exists at ${nextJob.destinationPath}`);
          updateJobStatus(nextJob.id, 'conflict');
          continue; // Check next job
        }
      }

      // Start upload
      log('queue', `Processing: ${nextJob.fileName} (job ${nextJob.id})`);
      updateJobStatus(nextJob.id, 'uploading');
      deviceScheduler.setExternalBusy(true);
      currentUploadMethod = 'websocket';
      currentUploadJobId = nextJob.id;

      cancelCurrentUpload = uploadFileViaWebSocket(
        connectedDevice.ip,
        connectedDevice.wsPort,
        nextJob.fileUri,
        nextJob.fileName,
        nextJob.fileSize,
        nextJob.destinationPath,
        {
          onProgress: (bytesTransferred, totalBytes) => {
            updateJobProgress(nextJob.id, bytesTransferred, totalBytes);
          },
          onComplete: () => {
            clearUploadState();
            log('queue', `Completed: ${nextJob.fileName}`);
            updateJobStatus(nextJob.id, 'completed');
            dirListingCache.clear();
            processNextJob();
          },
          onError: (error) => {
            clearUploadState();
            log('queue', `Failed: ${nextJob.fileName} — ${error.message}`);
            updateJobStatus(nextJob.id, 'failed', error.message);
            dirListingCache.clear();
            processNextJob();
          },
        },
      );
      break; // Upload started, exit loop
    }
  } finally {
    isProcessing = false;
  }
}

export function startQueueProcessor(): () => void {
  // Subscribe to upload store — only react to job count or status changes, not progress updates
  let prevJobKey = '';
  const unsubUpload = useUploadStore.subscribe((state) => {
    const jobKey = state.jobs.map((j) => `${j.id}:${j.status}`).join(',');
    if (jobKey === prevJobKey) return;
    prevJobKey = jobKey;
    dirListingCache.clear();
    processNextJob();
  });
  // Subscribe to device store — only react to connection status changes
  let prevConnectionStatus = useDeviceStore.getState().connectionStatus;
  const unsubDevice = useDeviceStore.subscribe((state) => {
    if (state.connectionStatus === prevConnectionStatus) return;
    prevConnectionStatus = state.connectionStatus;

    if (state.connectionStatus === 'connected') {
      // Reset conflicts on reconnect so they re-check against the new device
      useUploadStore.getState().resetConflicts();
      dirListingCache.clear();
    }

    processNextJob();
  });

  log('queue', 'Queue processor started');
  // Process any pending jobs immediately
  processNextJob();

  return () => {
    unsubUpload();
    unsubDevice();
  };
}

export function switchToBackgroundUpload(): void {
  if (currentUploadMethod !== 'websocket' || !currentUploadJobId) {
    log('queue', 'switchToBackgroundUpload: no active WebSocket upload, skipping');
    return;
  }

  const { jobs, updateJobProgress } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.id === currentUploadJobId);
  if (!activeJob || activeJob.status !== 'uploading') {
    log('queue', 'switchToBackgroundUpload: no uploading job found');
    return;
  }

  const { connectedDevice } = useDeviceStore.getState();
  if (!connectedDevice) {
    log('queue', 'switchToBackgroundUpload: no connected device');
    return;
  }

  // Cancel WebSocket upload — device firmware cleans up partial WS file
  if (cancelCurrentUpload) {
    log('queue', `Cancelling WebSocket upload for background switch: ${activeJob.fileName}`);
    cancelCurrentUpload();
    cancelCurrentUpload = null;
  }

  // Start HTTP background upload for same job
  currentUploadMethod = 'http';
  const jobId = currentUploadJobId;
  log('queue', `Starting HTTP background upload: ${activeJob.fileName}`);

  startHttpBackgroundUpload(
    connectedDevice.ip,
    activeJob.fileUri,
    activeJob.fileName,
    activeJob.fileSize,
    activeJob.destinationPath,
    {
      onProgress: (bytesTransferred, totalBytes) => {
        updateJobProgress(jobId, bytesTransferred, totalBytes);
      },
      onComplete: () => {
        log('queue', `HTTP background upload completed: ${activeJob.fileName}`);
        const { updateJobStatus } = useUploadStore.getState();
        clearUploadState();
        updateJobStatus(jobId, 'completed');
        dirListingCache.clear();
        processNextJob();
      },
      onError: (error) => {
        log('queue', `HTTP background upload failed: ${activeJob.fileName} — ${error.message}`);
        const { updateJobStatus } = useUploadStore.getState();
        clearUploadState();
        updateJobStatus(jobId, 'failed', error.message);
        dirListingCache.clear();
        processNextJob();
      },
    },
  ).then((handle) => {
    httpUploadHandle = handle;
  }).catch((error) => {
    log('queue', `Failed to start HTTP background upload: ${error.message}`);
    const { updateJobStatus } = useUploadStore.getState();
    clearUploadState();
    updateJobStatus(jobId, 'failed', error.message);
    dirListingCache.clear();
    processNextJob();
  });
}

export async function handleForegroundReturn(): Promise<void> {
  if (currentUploadMethod !== 'http' || !httpUploadHandle || !currentUploadJobId) {
    log('queue', 'handleForegroundReturn: no active HTTP upload, skipping');
    return;
  }

  const progress = httpUploadHandle.getProgress();
  log('queue', `Foreground return: HTTP upload at ${Math.round(progress * 100)}%`);

  if (progress >= BACKGROUND_UPGRADE_THRESHOLD) {
    // Close to done — let HTTP finish
    log('queue', `HTTP upload at ${Math.round(progress * 100)}% (>= ${BACKGROUND_UPGRADE_THRESHOLD * 100}%), letting it finish`);
    return;
  }

  // Cancel HTTP and switch back to WebSocket
  const { jobs, updateJobProgress } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.id === currentUploadJobId);
  if (!activeJob || activeJob.status !== 'uploading') {
    log('queue', 'handleForegroundReturn: job no longer uploading');
    return;
  }

  const { connectedDevice } = useDeviceStore.getState();
  if (!connectedDevice) {
    log('queue', 'handleForegroundReturn: no connected device');
    return;
  }

  log('queue', `Cancelling HTTP upload, switching back to WebSocket: ${activeJob.fileName}`);
  await httpUploadHandle.cancel();
  httpUploadHandle = null;

  // Restart via WebSocket from scratch
  currentUploadMethod = 'websocket';
  const jobId = currentUploadJobId;

  cancelCurrentUpload = uploadFileViaWebSocket(
    connectedDevice.ip,
    connectedDevice.wsPort,
    activeJob.fileUri,
    activeJob.fileName,
    activeJob.fileSize,
    activeJob.destinationPath,
    {
      onProgress: (bytesTransferred, totalBytes) => {
        updateJobProgress(jobId, bytesTransferred, totalBytes);
      },
      onComplete: () => {
        const { updateJobStatus } = useUploadStore.getState();
        clearUploadState();
        log('queue', `Completed (WS after HTTP switch): ${activeJob.fileName}`);
        updateJobStatus(jobId, 'completed');
        dirListingCache.clear();
        processNextJob();
      },
      onError: (error) => {
        const { updateJobStatus } = useUploadStore.getState();
        clearUploadState();
        log('queue', `Failed (WS after HTTP switch): ${activeJob.fileName} — ${error.message}`);
        updateJobStatus(jobId, 'failed', error.message);
        dirListingCache.clear();
        processNextJob();
      },
    },
  );
}

export function pauseCurrentUploadJob(): void {
  const { jobs, retryJob } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (!activeJob) return;

  if (currentUploadMethod === 'http' && httpUploadHandle) {
    log('queue', `Pausing HTTP upload: ${activeJob.fileName}`);
    httpUploadHandle.cancel();
  } else if (cancelCurrentUpload) {
    log('queue', `Pausing WebSocket upload: ${activeJob.fileName}`);
    cancelCurrentUpload();
  }

  clearUploadState();
  retryJob(activeJob.id); // resets to 'pending', progress 0
}

export function cancelCurrentUploadJob(): void {
  if (currentUploadMethod === 'http' && httpUploadHandle) {
    log('queue', 'Cancelling active HTTP upload');
    httpUploadHandle.cancel();
  } else if (cancelCurrentUpload) {
    log('queue', 'Cancelling active WebSocket upload');
    cancelCurrentUpload();
  }

  const { jobs, updateJobStatus } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (activeJob) {
    updateJobStatus(activeJob.id, 'cancelled');
  }

  clearUploadState();
}
