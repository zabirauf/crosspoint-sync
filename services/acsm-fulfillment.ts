import {
  PLUGIN_JOB_ARGS_MAX_BYTES,
  PLUGIN_JOB_POLL_INTERVAL_MS,
  PLUGIN_JOB_START_TIMEOUT_MS,
  PLUGIN_JOB_TIMEOUT_MS,
  PROTECTED_CONTENT_FULFILL_ACTION,
  PROTECTED_CONTENT_PLUGIN,
} from '@/constants/Protocol';
import {
  getPluginJobStatus,
  getPlugins,
  pluginRunnerUrl,
  PluginsDisabledError,
  submitPluginJob,
} from './device-api';
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
 * `/plugins-run` WebView is kept open while this waits.
 */
export type FulfillmentOutcome =
  | { kind: 'done'; title?: string; dest?: string }
  | { kind: 'skipped'; reason: string };

export interface FulfillmentOptions {
  isCancelled?: () => boolean;
  pollIntervalMs?: number;
  startTimeoutMs?: number;
  timeoutMs?: number;
}

export class FulfillmentCancelledError extends Error {
  constructor() {
    super('Fulfillment cancelled');
    this.name = 'FulfillmentCancelledError';
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
// Status requests can time out while the reader streams the book to SD.
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

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

export async function fulfillUploadedAcsm(
  ip: string,
  remotePath: string,
  firmwareVersion: string | undefined,
  options: FulfillmentOptions = {},
): Promise<FulfillmentOutcome> {
  const {
    isCancelled = () => false,
    pollIntervalMs = PLUGIN_JOB_POLL_INTERVAL_MS,
    startTimeoutMs = PLUGIN_JOB_START_TIMEOUT_MS,
    timeoutMs = PLUGIN_JOB_TIMEOUT_MS,
  } = options;

  if (!getDeviceCapabilities(firmwareVersion).pluginJobs) {
    return { kind: 'skipped', reason: NEEDS_FIRMWARE };
  }

  const args = { path: remotePath };
  if (JSON.stringify(args).length > PLUGIN_JOB_ARGS_MAX_BYTES) {
    throw new Error('The reader path is too long for a plugin job. Use a shorter folder or file name.');
  }

  let jobId: number;
  try {
    if (!hasProtectedContentPlugin(await getPlugins(ip))) {
      return { kind: 'skipped', reason: NEEDS_PLUGIN };
    }
    jobId = await submitPluginJob(ip, PROTECTED_CONTENT_PLUGIN, PROTECTED_CONTENT_FULFILL_ACTION, args);
  } catch (err) {
    if (err instanceof PluginsDisabledError) return { kind: 'skipped', reason: NEEDS_PLUGINS_ENABLED };
    throw err;
  }
  log('plugin', `Queued ${PROTECTED_CONTENT_PLUGIN}/${PROTECTED_CONTENT_FULFILL_ACTION} job ${jobId} for ${remotePath}`);

  const runner = usePluginRunnerStore.getState();
  runner.acquire(pluginRunnerUrl(ip));
  try {
    const startedAt = Date.now();
    let started = false;
    let pollErrors = 0;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (isCancelled()) throw new FulfillmentCancelledError();

      const loadError = usePluginRunnerStore.getState().loadError;
      if (loadError && !started) throw new Error(`The reader's plugin page did not open: ${loadError}`);

      const elapsed = Date.now() - startedAt;
      if (elapsed > timeoutMs) throw new Error('Timed out waiting for the reader to fetch the book.');

      let status;
      try {
        status = await getPluginJobStatus(ip, jobId);
        pollErrors = 0;
      } catch (err) {
        if (err instanceof PluginsDisabledError) throw new Error('Plugins were disabled on the reader.');
        if (++pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw err;
        log('plugin', `Job ${jobId} status unavailable (${errorMessage(err)}); retrying`);
        continue;
      }

      switch (status.state) {
        case 'pending':
          if (!started && elapsed > startTimeoutMs) {
            throw new Error('The reader did not start fetching the book. Check that Protected Content loads on the reader\'s web page.');
          }
          continue;
        case 'running':
          started = true;
          continue;
        case 'done': {
          const title = typeof status.result?.title === 'string' ? status.result.title : undefined;
          const dest = typeof status.result?.dest === 'string' ? status.result.dest : undefined;
          log('plugin', `Job ${jobId} done: ${dest ?? 'no destination reported'}`);
          return { kind: 'done', title, dest };
        }
        case 'error':
          throw new Error(describePluginError(status.result));
        case 'unknown':
          // The firmware recycles finished slots; after we saw the job run,
          // a vanished job finished without a result we could read.
          if (started) return { kind: 'done' };
          throw new Error('The reader lost the fetch job before it ran.');
      }
    }
  } finally {
    usePluginRunnerStore.getState().release();
  }
}
