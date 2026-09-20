import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import { useUploadStore } from '@/stores/upload-store';
import { log } from '@/services/logger';

const SUPPORTED_EXTENSIONS = ['.epub', '.xtc', '.xtch'];

function isSupportedBook(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function useDocumentPicker() {
  const addJob = useUploadStore((s) => s.addJob);

  const pickAndQueueFiles = useCallback(
    async (destPath: string) => {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',
          'application/octet-stream',
          '*/*',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        log('queue', 'Picker cancelled');
        return;
      }

      const validAssets = result.assets.filter((asset) => isSupportedBook(asset.name));

      if (validAssets.length === 0) {
        log('queue', 'Picker: no supported book files selected (.epub, .xtc, .xtch)');
        return;
      }

      log('queue', `Picked ${validAssets.length} files`);
      for (const asset of validAssets) {
        const file = new FSFile(asset.uri);
        const fileSize = asset.size ?? file.size;

        log('queue', `Queued: ${asset.name} (${fileSize} bytes) → ${destPath}`);
        addJob({
          fileName: asset.name,
          fileUri: asset.uri,
          fileSize,
          destinationPath: destPath,
          jobType: 'book',
        });
      }
    },
    [addJob],
  );

  return { pickAndQueueFiles };
}