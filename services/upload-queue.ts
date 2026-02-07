import { useDeviceStore } from '@/stores/device-store';
import { useUploadStore } from '@/stores/upload-store';
import { uploadFileViaWebSocket } from './websocket-upload';

let cancelCurrentUpload: (() => void) | null = null;

function processNextJob() {
  const { jobs } = useUploadStore.getState();
  const { connectedDevice, connectionStatus } = useDeviceStore.getState();

  if (connectionStatus !== 'connected' || !connectedDevice) return;

  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (activeJob) return; // already processing

  const nextJob = jobs.find((j) => j.status === 'pending');
  if (!nextJob) return;

  const { updateJobStatus, updateJobProgress } = useUploadStore.getState();
  updateJobStatus(nextJob.id, 'uploading');

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
        updateJobStatus(nextJob.id, 'completed');
        processNextJob();
      },
      onError: (error) => {
        cancelCurrentUpload = null;
        updateJobStatus(nextJob.id, 'failed', error.message);
        processNextJob();
      },
    },
  );
}

export function startQueueProcessor(): () => void {
  // Subscribe to both stores to react to changes
  const unsubUpload = useUploadStore.subscribe(() => {
    processNextJob();
  });
  const unsubDevice = useDeviceStore.subscribe(() => {
    processNextJob();
  });

  // Process any pending jobs immediately
  processNextJob();

  return () => {
    unsubUpload();
    unsubDevice();
  };
}

export function cancelCurrentUploadJob(): void {
  if (cancelCurrentUpload) {
    cancelCurrentUpload();
    cancelCurrentUpload = null;
  }

  const { jobs, updateJobStatus } = useUploadStore.getState();
  const activeJob = jobs.find((j) => j.status === 'uploading');
  if (activeJob) {
    updateJobStatus(activeJob.id, 'cancelled');
  }
}
