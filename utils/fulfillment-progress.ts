import { isAcsmFile } from '@/constants/FileFormats';
import { PLUGIN_JOB_START_TIMEOUT_MS } from '@/constants/Protocol';
import type { UploadJob } from '@/types/upload';

/**
 * What a Protected Content job card shows. An .acsm job has two steps: send
 * the small .acsm, then wait while the reader downloads the book. The plugin
 * reports no byte counts, so the second step's bar is driven by elapsed time
 * and never reaches the end until the reader reports the book is done.
 */
export interface AcsmJobProgress {
  /** Short status in the card header. */
  label: string;
  /** Step description under the file name. */
  detail: string;
  /** 0–1 across both steps. */
  value: number;
  /** Seconds in the current phase, when it is worth showing. */
  elapsedSeconds?: number;
}

// Shares of the bar for each part of the job.
const UPLOAD_END = 0.1;
const REQUEST_END = 0.15;
const WAIT_END = 0.25;
const FETCH_CAP = 0.95;
// Most protected books arrive within a minute or two; the bar covers about
// two-thirds of the remaining fetch share after this long.
const FETCH_TIME_CONSTANT_MS = 60_000;

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Progress for an .acsm job that is uploading or being fetched; otherwise undefined. */
export function acsmJobProgress(job: UploadJob, now: number): AcsmJobProgress | undefined {
  if (job.status !== 'uploading' || !isAcsmFile(job.fileName)) return undefined;

  const fulfillment = job.fulfillment;
  if (fulfillment?.state !== 'running') {
    return {
      label: 'Sending',
      detail: 'Step 1 of 2: Sending the .acsm to the reader',
      value: UPLOAD_END * Math.min(1, Math.max(0, job.progress)),
    };
  }

  const elapsedMs = Math.max(0, now - (fulfillment.phaseStartedAt ?? now));
  switch (fulfillment.phase) {
    case 'waiting':
      return {
        label: 'Starting',
        detail: 'Step 2 of 2: Waiting for the reader to start the download',
        value: REQUEST_END + (WAIT_END - REQUEST_END) * Math.min(1, elapsedMs / PLUGIN_JOB_START_TIMEOUT_MS),
        elapsedSeconds: elapsedMs / 1000,
      };
    case 'fetching':
      return {
        label: 'Fetching Book',
        detail: 'Step 2 of 2: The reader is downloading the book',
        value: WAIT_END + (FETCH_CAP - WAIT_END) * (1 - Math.exp(-elapsedMs / FETCH_TIME_CONSTANT_MS)),
        elapsedSeconds: elapsedMs / 1000,
      };
    case 'requesting':
    default:
      return {
        label: 'Requesting',
        detail: 'Step 2 of 2: Asking the reader to fetch the book',
        value: REQUEST_END,
      };
  }
}
