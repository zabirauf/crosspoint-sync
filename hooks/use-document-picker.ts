import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import { Alert } from 'react-native';
import { useUploadStore } from '@/stores/upload-store';
import { log } from '@/services/logger';
import { isSupportedBook, SUPPORTED_EXTENSIONS } from '@/constants/BookFormats';

export function useDocumentPicker() {
  const addJob = useUploadStore((s) => s.addJob);

  const pickAndQueueFiles = useCallback(
    async (destPath: string) => {
      const result = await DocumentPicker.getDocumentAsync({
        // Providers can report XTC/XTCH with an unknown or vendor-specific
        // MIME type, so filter by extension afterwards.
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        log('queue', 'Picker cancelled');
        return;
      }

      const validAssets = result.assets.filter((asset) => isSupportedBook(asset.name));
      const skippedCount = result.assets.length - validAssets.length;

      if (skippedCount > 0) {
        const message = `Skipped ${skippedCount} unsupported file(s). Supported book formats: ${SUPPORTED_EXTENSIONS.join(', ')}.`;
        log('queue', `Picker: ${message}`);
        Alert.alert('Unsupported files', message);
      }

      if (validAssets.length === 0) {
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
