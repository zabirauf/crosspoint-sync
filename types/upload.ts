export type UploadJobStatus =
  | 'pending'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'conflict';

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
}
