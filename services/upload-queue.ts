import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { File as FSFile } from 'expo-file-system';
import { uploadFileViaWebSocket } from './websocket-upload';
import { getFiles, ensureRemotePath, clearValidatedPaths } from './device-api';
import { log } from './logger';
import { deviceScheduler } from './device-request-scheduler';
import { isSupportedFile } from '@/constants/FileFormats';
import { getDeviceCapabilities, getFileFirmwareError } from './firmware-version';
import {
  DEVICE_RECOVERY_DELAY_MS,
  ENSURE_PATH_MAX_RETRIES,
  ENSURE_PATH_RETRY_DELAY_MS,
} from '@/constants/Protocol';

let cancelCurrentUpload: (() => void) | null = null;
let isProcessing = false;
let earliestProcessTime = 0;

function scheduleDelayedProcessing(delayMs: number): void {
  earliestProcessTime = Date.now() + delayMs;
  setTimeout(() => processNextJob(), delayMs);
}

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

async function processNextJob() {
  if (isProcessing) return;
  if (Date.now() < earliestProcessTime) return;
  isProcessing = true;

  try {
    while (true) {
      const { jobs, updateJobStatus, updateJobProgress } = useUploadStore.getState();
      const { connectedDevice, connectionStatus, deviceStatus } = useDeviceStore.getState();

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

      // Persisted jobs and share imports can bypass the picker. Validate against
      // the current reader before any remote writes or opening the upload socket.
      const { supportedFileExtensions } = getDeviceCapabilities(deviceStatus?.version);
      if (isSupportedFile(nextJob.fileName) && !isSupportedFile(nextJob.fileName, supportedFileExtensions)) {
        if (!deviceStatus) {
          log('queue', `Waiting for firmware status before uploading ${nextJob.fileName}`);
          break;
        }
        updateJobStatus(nextJob.id, 'failed', getFileFirmwareError(nextJob.fileName, deviceStatus.version));
        continue;
      }

      // Conflict check: skip if forceUpload is set
      if (!nextJob.forceUpload) {
        const remoteNames = await getRemoteFileNames(connectedDevice.ip, nextJob.destinationPath);
        if (remoteNames.some((n) => n.toLowerCase() === nextJob.fileName.toLowerCase())) {
          log('queue', `Conflict: ${nextJob.fileName} already exists at ${nextJob.destinationPath}`);
          updateJobStatus(nextJob.id, 'conflict');
          continue; // Check next job
        }
      }

      // Ensure destination folder exists on device (retry with backoff)
      let pathEnsured = false;
      for (let attempt = 0; attempt <= ENSURE_PATH_MAX_RETRIES; attempt++) {
        try {
          await ensureRemotePath(connectedDevice.ip, nextJob.destinationPath);
          pathEnsured = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < ENSURE_PATH_MAX_RETRIES) {
            log('queue', `ensureRemotePath attempt ${attempt + 1} failed (${msg}), retrying in ${ENSURE_PATH_RETRY_DELAY_MS}ms...`);
            await new Promise((r) => setTimeout(r, ENSURE_PATH_RETRY_DELAY_MS));
          } else {
            log('queue', `Failed to ensure path ${nextJob.destinationPath} after ${ENSURE_PATH_MAX_RETRIES + 1} attempts: ${msg}`);
            updateJobStatus(nextJob.id, 'failed', `Folder creation failed: ${msg}`);
          }
        }
      }
      if (!pathEnsured) break; // Stop cascade — remaining jobs would fail for the same reason

      // Start upload
      log('queue', `Processing: ${nextJob.fileName} (job ${nextJob.id})`);
      updateJobStatus(nextJob.id, 'uploading');
      deviceScheduler.setExternalBusy(true);

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
            cancelCurrentUpload = null;
            deviceScheduler.setExternalBusy(false);
            log('queue', `Completed: ${nextJob.fileName}`);
            updateJobStatus(nextJob.id, 'completed');
            // Clean up sleep background BMP after successful upload
            if (nextJob.jobType === 'sleep-background') {
              try {
                const uploadedFile = new FSFile(nextJob.fileUri);
                if (uploadedFile.exists) uploadedFile.delete();
              } catch {}
            }
            dirListingCache.clear();
            scheduleDelayedProcessing(DEVICE_RECOVERY_DELAY_MS);
          },
          onError: (error) => {
            cancelCurrentUpload = null;
            deviceScheduler.setExternalBusy(false);
            log('queue', `Failed: ${nextJob.fileName} — ${error.message}`);
            updateJobStatus(nextJob.id, 'failed', error.message);
            dirListingCache.clear();
            scheduleDelayedProcessing(DEVICE_RECOVERY_DELAY_MS);
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
  // Firmware status can arrive after connection; resume jobs waiting for it.
  let prevConnectionStatus = useDeviceStore.getState().connectionStatus;
  let prevVersion = useDeviceStore.getState().deviceStatus?.version;
  const unsubDevice = useDeviceStore.subscribe((state) => {
    const connectionChanged = state.connectionStatus !== prevConnectionStatus;
    const version = state.deviceStatus?.version;
    if (!connectionChanged && version === prevVersion) return;
    prevConnectionStatus = state.connectionStatus;
    prevVersion = version;

    if (connectionChanged && state.connectionStatus === 'connected') {
      // Reset conflicts on reconnect so they re-check against the new device
      useUploadStore.getState().resetConflicts();
      dirListingCache.clear();
      clearValidatedPaths();
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

export function pauseCurrentUploadJob(): void {
  const { jobs, retryJob } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (!activeJob) return;

  if (cancelCurrentUpload) {
    log('queue', `Pausing upload: ${activeJob.fileName}`);
    cancelCurrentUpload();
    cancelCurrentUpload = null;
  }
  deviceScheduler.setExternalBusy(false);
  retryJob(activeJob.id); // resets to 'pending', progress 0
  scheduleDelayedProcessing(DEVICE_RECOVERY_DELAY_MS);
}

export function cancelCurrentUploadJob(): void {
  if (cancelCurrentUpload) {
    log('queue', 'Cancelling active upload');
    cancelCurrentUpload();
    cancelCurrentUpload = null;
  }
  deviceScheduler.setExternalBusy(false);

  const { jobs, updateJobStatus } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (activeJob) {
    updateJobStatus(activeJob.id, 'cancelled');
  }
  scheduleDelayedProcessing(DEVICE_RECOVERY_DELAY_MS);
}
