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
import { runArticleExtractionJob } from '@/services/article-queue';

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

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const displayName = extractDomainForDisplay(url);
  useUploadStore.getState().addProcessingJob(jobId, `Clipping ${displayName}...`, 'clip', {
    source: 'share',
    sourceLabel: displayName,
    originalUrl: url,
  });

  await runArticleExtractionJob(jobId, url);
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
