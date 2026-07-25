import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useUploadStore } from '@/stores/upload-store';
import { log } from '@/services/logger';
import { runArticleExtractionJob } from '@/services/article-queue';

let retrying = false;

async function retryPendingFetchJobs(): Promise<void> {
  if (retrying) return;
  const jobs = useUploadStore
    .getState()
    .jobs.filter((j) => j.status === 'pending-fetch' && j.originalUrl);
  if (jobs.length === 0) return;

  retrying = true;
  log('queue', `Connectivity returned — retrying ${jobs.length} pending-fetch item(s)`);
  try {
    for (const job of jobs) {
      // Re-check: the job may have changed status since the snapshot above.
      const current = useUploadStore.getState().jobs.find((j) => j.id === job.id);
      if (!current || current.status !== 'pending-fetch' || !current.originalUrl) continue;
      await runArticleExtractionJob(current.id, current.originalUrl);
    }
  } finally {
    retrying = false;
  }
}

/**
 * Subscribes to connectivity changes and retries any 'pending-fetch' queue items
 * (shares/RSS items deferred because there was no internet). Android-only for now,
 * matching the article-clipping feature scope. NetInfo emits the current state on
 * subscribe, so this also picks up items left over from a previous session if
 * connectivity is already present at launch.
 */
export function subscribeToPendingFetchRetry(): () => void {
  if (Platform.OS !== 'android') return () => {};
  const unsub = NetInfo.addEventListener((state) => {
    // Only retry once internet is *confirmed* reachable, so we don't re-attempt into the
    // same dead hotspot (isInternetReachable === false) or an unconfirmed (null) state.
    if (state.isConnected && state.isInternetReachable === true) {
      retryPendingFetchJobs();
    }
  });
  return unsub;
}
