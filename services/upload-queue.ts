import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { uploadFileViaWebSocket } from './websocket-upload';
import { log } from './logger';
import { deviceScheduler } from './device-request-scheduler';

let cancelCurrentUpload: (() => void) | null = null;

function processNextJob() {
  const { jobs } = useUploadStore.getState();
  const { connectedDevice, connectionStatus } = useDeviceStore.getState();

  if (connectionStatus !== 'connected' || !connectedDevice) {
    log('queue', 'Skip: no device connected');
    return;
  }

  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (activeJob) {
    log('queue', `Skip: job ${activeJob.id} already uploading`);
    return;
  }

  const nextJob = jobs.find((j) => j.status === 'pending');
  if (!nextJob) {
    log('queue', 'No pending jobs');
    return;
  }

  const { updateJobStatus, updateJobProgress } = useUploadStore.getState();
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
        processNextJob();
      },
      onError: (error) => {
        cancelCurrentUpload = null;
        deviceScheduler.setExternalBusy(false);
        log('queue', `Failed: ${nextJob.fileName} — ${error.message}`);
        updateJobStatus(nextJob.id, 'failed', error.message);
        processNextJob();
      },
    },
  );
}

export function startQueueProcessor(): () => void {
  // Subscribe to upload store — only react to job count or status changes, not progress updates
  let prevJobKey = '';
  const unsubUpload = useUploadStore.subscribe((state) => {
    const jobKey = state.jobs.map((j) => `${j.id}:${j.status}`).join(',');
    if (jobKey === prevJobKey) return;
    prevJobKey = jobKey;
    processNextJob();
  });
  // Subscribe to device store — only react to connection status changes
  let prevConnectionStatus = useDeviceStore.getState().connectionStatus;
  const unsubDevice = useDeviceStore.subscribe((state) => {
    if (state.connectionStatus === prevConnectionStatus) return;
    prevConnectionStatus = state.connectionStatus;
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
}
