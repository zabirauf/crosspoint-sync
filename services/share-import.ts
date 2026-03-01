import { File, Directory, Paths } from 'expo-file-system';
import { getAppGroupPath } from '@/modules/app-group-path';
import { useUploadStore } from '@/stores/upload-store';
import { log } from '@/services/logger';
import { pathToUri } from '@/utils/format';

const APP_GROUP_ID = 'group.com.crosspointsync.app';

interface ShareManifest {
  fileName: string;
  fileUri: string; // absolute path from Swift (e.g. /private/var/...)
  fileSize: number;
  destinationPath: string;
  createdAt: number;
}

export async function importSharedFiles(): Promise<number> {
  const containerPath = getAppGroupPath(APP_GROUP_ID);
  if (!containerPath) {
    return 0;
  }

  const containerUri = pathToUri(containerPath);
  const manifestsDir = new Directory(`${containerUri}/manifests`);
  if (!manifestsDir.exists) {
    return 0;
  }

  const cacheDir = new Directory(Paths.cache, 'shared-imports');
  if (!cacheDir.exists) {
    cacheDir.create();
  }

  let imported = 0;

  for (const entry of manifestsDir.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) {
      continue;
    }

    try {
      const raw = await entry.text();
      const manifest: ShareManifest = JSON.parse(raw);

      // Skip clip manifests — handled by clip-import.ts
      if ((manifest as any).type === 'clip') {
        continue;
      }

      const sharedFile = new File(pathToUri(manifest.fileUri));
      if (!sharedFile.exists) {
        log('queue', `Shared file missing, skipping: ${manifest.fileName}`);
        entry.delete();
        continue;
      }

      // Move file from App Group container to app cache
      const destFile = new File(cacheDir, `${Date.now()}-${manifest.fileName}`);
      sharedFile.move(destFile);

      log('queue', `Shared import: ${manifest.fileName} (${manifest.fileSize} bytes)`);

      useUploadStore.getState().addJob({
        fileName: manifest.fileName,
        fileUri: destFile.uri,
        fileSize: manifest.fileSize,
        destinationPath: manifest.destinationPath,
        jobType: 'book',
      });

      imported++;
      entry.delete();
    } catch (e) {
      log('queue', `Failed to import shared file: ${e}`);
      // Delete broken manifest to avoid retrying forever
      try {
        entry.delete();
      } catch {}
    }
  }

  // Clean up leftover files in shared-files/ that have no manifest
  const sharedFilesDir = new Directory(`${containerUri}/shared-files`);
  if (sharedFilesDir.exists) {
    for (const entry of sharedFilesDir.list()) {
      if (entry instanceof File) {
        try {
          entry.delete();
        } catch {}
      }
    }
  }

  if (imported > 0) {
    log('queue', `Imported ${imported} shared file(s)`);
  }

  return imported;
}
