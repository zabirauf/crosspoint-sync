import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import { useUploadStore } from '@/stores/upload-store';
import { log } from '@/services/logger';

export function useDocumentPicker() {
  const addJob = useUploadStore((s) => s.addJob);

  const pickAndQueueFiles = useCallback(
    async (destPath: string) => {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',
          'application/pdf',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        log('queue', 'Picker cancelled');
        return;
      }

      log('queue', `Picked ${result.assets.length} files`);
      for (const asset of result.assets) {
        // Get actual file size from the filesystem
        const file = new FSFile(asset.uri);
        const fileSize = asset.size ?? file.size;

        log('queue', `Queued: ${asset.name} (${fileSize} bytes) → ${destPath}`);
        addJob({
          fileName: asset.name,
          fileUri: asset.uri,
          fileSize,
          destinationPath: destPath,
        });
      }
    },
    [addJob],
  );

  return { pickAndQueueFiles };
}
