import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { log } from '@/services/logger';
import {
  getSharedItems,
  clearIntent,
  addShareIntentListener,
  type SharedItem,
} from '@/modules/share-intent-receiver';
import { extractArticleFromUrl, downloadImagesFromUrls } from '@/services/url-article-extractor';
import { extractArticleViaWebView } from '@/services/webview-article-extractor';
import { generateEpub } from '@/services/epub-generator';

/**
 * Processes files shared via Android's share intent.
 * Copies content:// URIs to app cache and adds them to the upload queue.
 */
export async function importAndroidSharedFiles(): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  const items = getSharedItems();
  if (items.length === 0) return 0;

  // Clear immediately so concurrent calls (AppState + onShareIntent listener)
  // don't re-process the same items
  clearIntent();

  let imported = 0;

  for (const item of items) {
    try {
      if (item.type === 'file' && item.uri) {
        imported += await importFileItem(item);
      } else if (item.type === 'text' && item.text) {
        await handleTextItem(item.text);
      }
    } catch (e) {
      log('queue', `Failed to import Android shared item: ${e}`);
    }
  }

  if (imported > 0) {
    log('queue', `Imported ${imported} file(s) from Android share intent`);
  }

  return imported;
}

async function importFileItem(item: SharedItem): Promise<number> {
  if (!item.uri || !item.name) return 0;

  // Native module already copied content:// to a file:// path in app cache
  const sourceFile = new File(item.uri);
  if (!sourceFile.exists) {
    log('queue', `Android share: cached file missing at ${item.uri}`);
    return 0;
  }

  const { defaultUploadPath } = useSettingsStore.getState();

  log('queue', `Android share import: ${item.name} (${item.size ?? 0} bytes)`);

  useUploadStore.getState().addJob({
    fileName: item.name,
    fileUri: item.uri,
    fileSize: item.size ?? 0,
    destinationPath: defaultUploadPath,
    jobType: 'book',
  });

  return 1;
}

function extractDomainForDisplay(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return 'article';
  }
}

async function handleTextItem(text: string): Promise<void> {
  // Check if the text contains a URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) {
    log('queue', 'Android share: received text without URL, ignoring');
    return;
  }

  const url = urlMatch[0];
  log('clip', `Android share: extracting article from ${url}`);

  // Create a processing job immediately so the user sees feedback
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const displayName = extractDomainForDisplay(url);
  useUploadStore.getState().addProcessingJob(jobId, `Clipping ${displayName}...`, 'clip');

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

    // Finalize the processing job → transitions to 'pending'
    useUploadStore.getState().finalizeProcessingJob(jobId, {
      fileName,
      fileUri: epubUri,
      fileSize: epubSize,
      destinationPath,
    });

    log('clip', `Android clip: "${article.title}" → ${fileName} (${epubSize} bytes)`);
  } catch (e) {
    useUploadStore.getState().updateJobStatus(
      jobId,
      'failed',
      `Clip failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    log('clip', `Android clip failed for ${url}: ${e}`);
  }
}

interface ExtractedArticleWithImages {
  title: string;
  author: string;
  sourceUrl: string;
  html: string;
  images: Array<{ originalUrl: string; localPath: string; mimeType: string; data: Uint8Array }>;
}

async function extractViaWebViewWithFallback(url: string): Promise<ExtractedArticleWithImages> {
  // Try WebView extraction first for better quality on JS-rendered pages
  try {
    log('clip', `Trying WebView extraction for ${url}`);
    const webViewResult = await extractArticleViaWebView(url);

    // Download images from the pre-extracted URLs
    const images = await downloadImagesFromUrls(webViewResult.images);
    log('clip', `WebView extraction complete: "${webViewResult.title}" (${images.length} images)`);

    return {
      title: webViewResult.title,
      author: webViewResult.author,
      sourceUrl: webViewResult.sourceUrl,
      html: webViewResult.html,
      images,
    };
  } catch (e) {
    log('clip', `WebView extraction failed, falling back to fetch+regex: ${e}`);
    return extractArticleFromUrl(url);
  }
}

/**
 * Subscribes to share intent events that fire when the app receives
 * a new intent while already running.
 */
export function subscribeToAndroidShareIntent(): () => void {
  if (Platform.OS !== 'android') return () => {};

  const sub = addShareIntentListener(async () => {
    await importAndroidSharedFiles();
  });

  return () => sub?.remove();
}
