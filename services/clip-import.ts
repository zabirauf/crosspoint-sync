import { File, Directory } from 'expo-file-system';
import { getAppGroupPath } from '@/modules/app-group-path';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { generateEpub } from '@/services/epub-generator';
import { log } from '@/services/logger';
import type { ClipManifest, ClipImage } from '@/types/clip';

const APP_GROUP_ID = 'group.com.zync.app';

function pathToUri(p: string): string {
  return p.startsWith('file://') ? p : `file://${p}`;
}

/**
 * Imports clipped articles from the Safari Web Extension via App Groups.
 * Reads clip manifests, generates EPUBs, and adds them to the upload queue.
 */
export async function importClippedArticles(): Promise<number> {
  const containerPath = getAppGroupPath(APP_GROUP_ID);
  if (!containerPath) {
    return 0;
  }

  const containerUri = pathToUri(containerPath);
  const manifestsDir = new Directory(`${containerUri}/manifests`);
  if (!manifestsDir.exists) {
    return 0;
  }

  let imported = 0;

  for (const entry of manifestsDir.list()) {
    if (!(entry instanceof File) || !entry.name.startsWith('clip-') || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const raw = await entry.text();
      const manifest: ClipManifest = JSON.parse(raw);

      // Verify this is a clip manifest
      if (manifest.type !== 'clip') {
        continue;
      }

      // Read the HTML file
      const htmlFile = new File(`${containerUri}/${manifest.htmlPath}`);
      if (!htmlFile.exists) {
        log('clip', `Clip HTML missing, skipping: ${manifest.title}`);
        entry.delete();
        continue;
      }

      const html = await htmlFile.text();

      // Load images
      const imagesWithData: Array<ClipImage & { data: Uint8Array }> = [];
      for (const img of manifest.images) {
        try {
          const imgFile = new File(`${containerUri}/${img.localPath}`);
          if (imgFile.exists) {
            const data = await imgFile.bytes();
            imagesWithData.push({ ...img, data });
          }
        } catch (e) {
          log('clip', `Failed to load image ${img.originalUrl}: ${e}`);
          // Skip failed images — article text is still readable
        }
      }

      // Generate EPUB
      const { uri: epubUri, size: epubSize } = await generateEpub({
        title: manifest.title,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
        html,
        images: imagesWithData,
        clippedAt: manifest.clippedAt,
      });

      const safeTitle = manifest.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) || 'article';
      const fileName = `${safeTitle}.epub`;
      const destinationPath = useSettingsStore.getState().defaultUploadPath;

      useUploadStore.getState().addJob({
        fileName,
        fileUri: epubUri,
        fileSize: epubSize,
        destinationPath,
      });

      log('clip', `Imported clip: "${manifest.title}" → ${fileName} (${epubSize} bytes)`);
      imported++;

      // Clean up: delete manifest, HTML, and image directory
      entry.delete();
      try { htmlFile.delete(); } catch {}
      const imgDir = new Directory(`${containerUri}/shared-clips/${manifest.id}`);
      if (imgDir.exists) {
        try { imgDir.delete(); } catch {}
      }
    } catch (e) {
      log('clip', `Failed to import clip: ${e}`);
      // Delete broken manifest to avoid retrying forever
      try { entry.delete(); } catch {}
    }
  }

  if (imported > 0) {
    log('clip', `Imported ${imported} clipped article(s)`);
  }

  return imported;
}
