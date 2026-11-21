import {
  PLUGIN_JOB_ARGS_MAX_BYTES,
  PLUGIN_JOB_LEASE_MS,
  PLUGIN_JOB_POLL_INTERVAL_MS,
  PLUGIN_JOB_START_TIMEOUT_MS,
  PLUGIN_JOB_TIMEOUT_MS,
  PROTECTED_CONTENT_FULFILL_ACTION,
  PROTECTED_CONTENT_PLUGIN,
} from '@/constants/Protocol';
import {
  getPluginJobStatus,
  getPlugins,
  PluginJobHttpError,
  type PluginJobState,
  pluginRunnerUrl,
  PluginsDisabledError,
  submitPluginJob,
} from './device-api';
import { activeNow } from './active-clock';
import { getDeviceCapabilities } from './firmware-version';
import { usePluginRunnerStore } from './plugin-runner';
import { log } from './logger';

/**
 * Hands an uploaded .acsm to the reader's Protected Content SD plugin.
 *
 * The plugin (Plugin Hub: `protected-content`) is an Adobe ADEPT client that
 * runs in a browser page served by the reader. It registers the job-queue
 * action `fulfill` with `args: {path}`: it reads the .acsm through `/download`,
 * fulfils it with the content account activated in its own UI, streams the
 * EPUB next to the .acsm, stores its key through `/api/book-key`, deletes the
 * .acsm and returns `{title, dest, bytes}`. It throws "device not activated"
 * until the user has signed in once from the reader's web page.
 *
 * Jobs run only while a page hosting the plugin is open, so the hidden
 * `/plugins-run` WebView is kept open while this waits, and after the app
 * stops waiting for as long as the reader reports the claimed job running.
 */
export type FulfillmentOutcome =
  | { kind: 'done'; title?: string; dest?: string }
  | { kind: 'skipped'; reason: string };

export interface FulfillmentOptions {
  isCancelled?: () => boolean;
  /** Called once when the job is queued on the reader and once when it starts running. */
  onPhase?: (phase: 'waiting' | 'fetching') => void;
  /** Called with each firmware job id this run submits or resumes. */
  onJobId?: (jobId: number) => void;
  /** A job submitted earlier for this .acsm; tracked instead of submitting another while it is live. */
  existingJobId?: number;
  /** Whether the .acsm is still on the reader, so a replacement job can be submitted. Defaults to true. */
  tokenOnReader?: boolean;
  pollIntervalMs?: number;
  startTimeoutMs?: number;
  timeoutMs?: number;
  /** Clock for the deadlines; defaults to time the app spends outside the background. */
  now?: () => number;
}

export class FulfillmentCancelledError extends Error {
  constructor() {
    super('Fulfillment cancelled');
    this.name = 'FulfillmentCancelledError';
  }
}

/** The .acsm is gone from the reader and no job for it is live; only a new upload can fetch the book. */
export class FulfillmentTokenMissingError extends Error {
  constructor() {
    super('The reader no longer has this .acsm or its fetch job. If the book is not in the reader\'s library, retry to send the .acsm again.');
    this.name = 'FulfillmentTokenMissingError';
  }
}

// Firmware lists no plugins while Settings → Connectivity → Plugins is off,
// so an empty list can also mean an installed plugin that is disabled.
const NEEDS_PLUGIN =
  'Saved the .acsm. To fetch the book, turn on Settings → Connectivity → Plugins on the reader, install Protected Content from Plugin Hub and sign in from the reader\'s web page.';
const NEEDS_PLUGINS_ENABLED =
  'Saved the .acsm. To fetch the book, turn on Settings → Connectivity → Plugins on the reader and install Protected Content.';
const NEEDS_FIRMWARE =
  'Saved the .acsm. Reader firmware 2.0.0 or later with the Protected Content plugin can fetch the book.';
const RESULT_UNAVAILABLE =
  'The reader finished the fetch job without a result the app could read. Check the reader\'s library for the book before retrying.';
const TIMED_OUT = 'Timed out waiting for the reader to fetch the book.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bytes of UTF-8, which the firmware measures job args in. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function remoteFilePath(folder: string, fileName: string): string {
  const base = folder.replace(/\/+$/, '');
  return `${base}/${fileName}`.replace(/^(?!\/)/, '/');
}

export function hasProtectedContentPlugin(plugins: { name: string; hasPluginJs?: boolean }[]): boolean {
  return plugins.some((p) => p.name.toLowerCase() === PROTECTED_CONTENT_PLUGIN && p.hasPluginJs !== false);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The plugin returns `{error}` for a thrown Error; translate the actionable one. */
function describePluginError(result: Record<string, unknown> | null): string {
  const raw = typeof result?.error === 'string' ? result.error : 'the plugin reported an error';
  if (/not activated/i.test(raw)) {
    return 'Protected Content is not signed in. Open the reader\'s web page, sign in from the Protected Content card, then retry.';
  }
  return raw;
}

/** A status failure worth retrying: transport errors and 5xx, not a definite rejection. */
function isTransientStatusError(err: unknown): boolean {
  if (err instanceof PluginsDisabledError) return false;
  if (err instanceof PluginJobHttpError) return err.status >= 500;
  return true;
}

async function submitFulfillment(
  ip: string,
  args: { path: string },
): Promise<number | Extract<FulfillmentOutcome, { kind: 'skipped' }>> {
  try {
    if (!hasProtectedContentPlugin(await getPlugins(ip))) {
      return { kind: 'skipped', reason: NEEDS_PLUGIN };
    }
    return await submitPluginJob(ip, PROTECTED_CONTENT_PLUGIN, PROTECTED_CONTENT_FULFILL_ACTION, args);
  } catch (err) {
    if (err instanceof PluginsDisabledError) return { kind: 'skipped', reason: NEEDS_PLUGINS_ENABLED };
    throw err;
  }
}

/**
 * Takes over this run's runner reference after the app stops waiting. A
 * runner that has claimed the job is executing the plugin action (fetching,
 * storing the key, deleting the .acsm); unmounting it would interrupt that.
 * The reference is released once the reader no longer reports the job
 * running, or after the firmware's claim lease.
 */
function keepRunnerWhileClaimed(ip: string, jobId: number, pollIntervalMs: number, now: () => number): void {
  const startedAt = now();
  void (async () => {
    try {
      while (now() - startedAt < PLUGIN_JOB_LEASE_MS) {
        await sleep(pollIntervalMs);
        let state: PluginJobState;
        try {
          state = (await getPluginJobStatus(ip, jobId)).state;
        } catch (err) {
          if (isTransientStatusError(err)) continue;
          return;
        }
        if (state !== 'running') {
          log('plugin', `Job ${jobId} is ${state}; closing the plugin runner`);
          return;
        }
      }
      log('plugin', `Job ${jobId} still running after the claim lease; closing the plugin runner`);
    } finally {
      usePluginRunnerStore.getState().release();
    }
  })();
}

export async function fulfillUploadedAcsm(
  ip: string,
  remotePath: string,
  firmwareVersion: string | undefined,
  options: FulfillmentOptions = {},
): Promise<FulfillmentOutcome> {
  const {
    isCancelled = () => false,
    onPhase = () => {},
    onJobId = () => {},
    existingJobId,
    tokenOnReader = true,
    pollIntervalMs = PLUGIN_JOB_POLL_INTERVAL_MS,
    startTimeoutMs = PLUGIN_JOB_START_TIMEOUT_MS,
    timeoutMs = PLUGIN_JOB_TIMEOUT_MS,
    now = activeNow,
  } = options;

  if (!getDeviceCapabilities(firmwareVersion).pluginJobs) {
    return { kind: 'skipped', reason: NEEDS_FIRMWARE };
  }

  const args = { path: remotePath };
  if (utf8ByteLength(JSON.stringify(args)) > PLUGIN_JOB_ARGS_MAX_BYTES) {
    throw new Error('The reader path is too long for a plugin job. Use a shorter folder or file name.');
  }

  // A resumed job is trusted only while the reader still reports it live or
  // done. Anything else gets a replacement, which needs the .acsm on the reader.
  let jobId: number;
  let resumed = existingJobId !== undefined;
  const submit = async (): Promise<number | Extract<FulfillmentOutcome, { kind: 'skipped' }>> => {
    if (!tokenOnReader) throw new FulfillmentTokenMissingError();
    const submitted = await submitFulfillment(ip, args);
    if (typeof submitted !== 'number') return submitted;
    log('plugin', `Queued ${PROTECTED_CONTENT_PLUGIN}/${PROTECTED_CONTENT_FULFILL_ACTION} job ${submitted} for ${remotePath}`);
    onJobId(submitted);
    return submitted;
  };
  if (existingJobId !== undefined) {
    jobId = existingJobId;
    log('plugin', `Resuming job ${jobId} for ${remotePath}`);
    onJobId(jobId);
  } else {
    const submitted = await submit();
    if (typeof submitted !== 'number') return submitted;
    jobId = submitted;
  }
  onPhase('waiting');

  usePluginRunnerStore.getState().acquire(pluginRunnerUrl(ip));
  // Whether the reader may still be running the action when this returns.
  let mayBeRunning = true;
  try {
    let startedAt = now();
    let started = false;
    while (true) {
      await sleep(pollIntervalMs);
      if (isCancelled()) throw new FulfillmentCancelledError();

      const loadError = usePluginRunnerStore.getState().loadError;
      if (loadError && !started) {
        mayBeRunning = false;
        throw new Error(`The reader's plugin page did not open: ${loadError}`);
      }

      // Read the status before applying deadlines, so a job that finished
      // between polls (or while the app was suspended) is still reported.
      let state: PluginJobState;
      let result: Record<string, unknown> | null = null;
      try {
        ({ state, result } = await getPluginJobStatus(ip, jobId));
      } catch (err) {
        if (err instanceof PluginsDisabledError) throw new Error('Plugins were disabled on the reader.');
        // The reader cannot answer while it streams the book to SD; keep
        // trying until the overall deadline.
        if (!isTransientStatusError(err)) throw err;
        if (now() - startedAt > timeoutMs) throw new Error(TIMED_OUT);
        log('plugin', `Job ${jobId} status unavailable (${errorMessage(err)}); retrying`);
        continue;
      }
      const elapsed = now() - startedAt;

      // A resumed job that is no longer live is replaced.
      if (resumed && !started && (state === 'error' || state === 'unknown')) {
        log('plugin', `Earlier job ${jobId} is ${state}; submitting a new one`);
        resumed = false;
        const submitted = await submit();
        if (typeof submitted !== 'number') {
          mayBeRunning = false;
          return submitted;
        }
        jobId = submitted;
        startedAt = now();
        continue;
      }

      switch (state) {
        case 'pending':
          if (elapsed > (started ? timeoutMs : startTimeoutMs)) {
            throw new Error('The reader did not start fetching the book. Check that Protected Content loads on the reader\'s web page.');
          }
          continue;
        case 'running':
          if (!started) onPhase('fetching');
          started = true;
          if (elapsed > timeoutMs) throw new Error(TIMED_OUT);
          continue;
        case 'done': {
          mayBeRunning = false;
          const title = typeof result?.title === 'string' ? result.title : undefined;
          const dest = typeof result?.dest === 'string' ? result.dest : undefined;
          log('plugin', `Job ${jobId} done: ${dest ?? 'no destination reported'}`);
          return { kind: 'done', title, dest };
        }
        case 'error':
          mayBeRunning = false;
          throw new Error(describePluginError(result));
        case 'unknown':
          // The firmware recycles finished slots, successful or not, and a
          // restart drops every job, so a vanished job proves nothing.
          mayBeRunning = false;
          throw new Error(started ? RESULT_UNAVAILABLE : 'The reader lost the fetch job before it ran.');
      }
    }
  } finally {
    if (mayBeRunning) {
      keepRunnerWhileClaimed(ip, jobId, pollIntervalMs, now);
    } else {
      usePluginRunnerStore.getState().release();
    }
  }
}
