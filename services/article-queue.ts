import NetInfo from '@react-native-community/netinfo';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { log } from '@/services/logger';
import { extractViaWebViewWithFallback } from '@/services/article-extraction';
import { generateEpub } from '@/services/epub-generator';

/**
 * True when there is no *confirmed* internet connection. This deliberately treats the
 * "unknown" state (isInternetReachable === null) as offline: NetInfo.fetch() commonly
 * returns null before its reachability probe finishes, and on the X4's isolated Wi-Fi
 * hotspot isConnected is true while the internet is unreachable. Classifying unknown as
 * offline parks the share as retryable rather than hard-failing it. Genuine extraction
 * failures that occur while internet is confirmed reachable still fall through to 'failed'.
 */
export async function isOffline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !state.isConnected || state.isInternetReachable !== true;
}

/**
 * Drives an existing queue job (by id) from a source URL through
 * extract -> EPUB -> finalize. On failure, no-connectivity errors are parked as
 * 'pending-fetch' (retried when online); genuine errors become 'failed'.
 * Shared by the Android share handler and the pending-fetch retry listener.
 */
export async function runArticleExtractionJob(jobId: string, url: string): Promise<void> {
  const store = useUploadStore.getState();
  store.updateJobStatus(jobId, 'processing');
  try {
    const article = await extractViaWebViewWithFallback(url);

    const { uri: epubUri, size: epubSize } = await generateEpub({
      title: article.title,
      author: article.author,
      sourceUrl: article.sourceUrl,
      html: article.html,
      images: article.images,
      clippedAt: Date.now(),
    });

    const safeTitle = article.title
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'article';
    const fileName = `${safeTitle}.epub`;
    const destinationPath = useSettingsStore.getState().clipUploadPath;

    store.finalizeProcessingJob(jobId, {
      fileName,
      fileUri: epubUri,
      fileSize: epubSize,
      destinationPath,
    });

    log('clip', `Article clip: "${article.title}" -> ${fileName} (${epubSize} bytes)`);
  } catch (e) {
    if (await isOffline()) {
      store.updateJobStatus(jobId, 'pending-fetch', 'Waiting for connectivity');
      log('clip', `Article clip deferred (offline): ${url}`);
    } else {
      store.updateJobStatus(jobId, 'failed', `Clip failed: ${e instanceof Error ? e.message : String(e)}`);
      log('clip', `Article clip failed for ${url}: ${e}`);
    }
  }
}
