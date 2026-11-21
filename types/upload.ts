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
/**
 * Progress through a running fulfillment. The plugin reports no byte counts,
 * so these stages and their start times are all the app can show.
 * - requesting: checking for the plugin and submitting the job
 * - waiting: job queued; the reader has not started it
 * - fetching: the reader is downloading the book
 */
export type UploadJobFulfillmentPhase = 'requesting' | 'waiting' | 'fetching';

export interface UploadJobFulfillment {
  state: 'running' | 'done' | 'skipped' | 'failed';
  phase?: UploadJobFulfillmentPhase;
  /** Epoch ms when the current phase began. */
  phaseStartedAt?: number;
  message?: string;
  /** Absolute reader path of the uploaded .acsm. */
  remotePath?: string;
  /** The reader that received the .acsm; its token is reused only there. */
  readerKey?: string;
  /** Firmware plugin job id, so Retry or a relaunch resumes it instead of submitting another. */
  jobId?: number;
  /** Estimated reader boot time (epoch ms) when the job was submitted; job ids restart after a reboot. */
  readerBootedAt?: number;
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
