import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { log } from '@/services/logger';
import {
  getSharedItems,
  clearIntent,
  addShareIntentListener,
  type SharedItem,
} from '@/modules/share-intent-receiver';
import { extractArticleFromUrl } from '@/services/url-article-extractor';
import { generateEpub } from '@/services/epub-generator';

/**
 * Processes files shared via Android's share intent.
 * Copies content:// URIs to app cache and adds them to the upload queue.
 */
export async function importAndroidSharedFiles(): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  const items = getSharedItems();
  if (items.length === 0) return 0;

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

  clearIntent();

  if (imported > 0) {
    log('queue', `Imported ${imported} file(s) from Android share intent`);
  }

  return imported;
}

async function importFileItem(item: SharedItem): Promise<number> {
  if (!item.uri || !item.name) return 0;

  const cacheDir = new Directory(Paths.cache, 'android-shared-imports');
  if (!cacheDir.exists) {
    cacheDir.create();
  }

  const destFile = new File(cacheDir, `${Date.now()}-${item.name}`);

  // Copy from content:// URI to app cache
  const sourceFile = new File(item.uri);
  sourceFile.copy(destFile);

  const { defaultUploadPath } = useSettingsStore.getState();

  log('queue', `Android share import: ${item.name} (${item.size ?? 0} bytes)`);

  useUploadStore.getState().addJob({
    fileName: item.name,
    fileUri: destFile.uri,
    fileSize: item.size ?? 0,
    destinationPath: defaultUploadPath,
    jobType: 'book',
  });

  return 1;
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

  try {
    const article = await extractArticleFromUrl(url);

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

    useUploadStore.getState().addJob({
      fileName,
      fileUri: epubUri,
      fileSize: epubSize,
      destinationPath,
      jobType: 'clip',
    });

    log('clip', `Android clip: "${article.title}" → ${fileName} (${epubSize} bytes)`);
  } catch (e) {
    log('clip', `Android clip failed for ${url}: ${e}`);
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
