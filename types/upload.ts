export type UploadJobStatus =
  | 'processing'
  | 'pending'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'conflict';

export type UploadJobType = 'book' | 'sleep-background' | 'clip';

/**
 * Reader-side processing after an upload: an uploaded .acsm is handed to the
 * reader's Protected Content plugin, which downloads the protected EPUB.
 * The job keeps status 'uploading' while this runs so it still holds the queue.
 */
export interface UploadJobFulfillment {
  state: 'running' | 'done' | 'skipped' | 'failed';
  message?: string;
  /** Absolute reader path of the uploaded .acsm. */
  remotePath?: string;
}

export interface UploadJob {
  id: string;
  fileName: string;
  fileUri: string;
  fileSize: number;
  destinationPath: string;
  status: UploadJobStatus;
  progress: number;
  bytesTransferred: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  forceUpload?: boolean;
  jobType?: UploadJobType;
  fulfillment?: UploadJobFulfillment;
}
