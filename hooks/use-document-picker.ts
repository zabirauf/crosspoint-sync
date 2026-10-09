import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import { Alert } from 'react-native';
import { useUploadStore } from '@/stores/upload-store';
import { useDeviceStore } from '@/stores/device-store';
import { log } from '@/services/logger';
import { isSupportedBook } from '@/constants/BookFormats';
import { getDeviceCapabilities, XTC_MIN_FIRMWARE } from '@/services/firmware-version';

export function useDocumentPicker() {
  const addJob = useUploadStore((s) => s.addJob);

  const pickAndQueueFiles = useCallback(
    async (destPath: string) => {
      const { bookPickerMimeType } = getDeviceCapabilities(useDeviceStore.getState().deviceStatus?.version);
      const result = await DocumentPicker.getDocumentAsync({
        // Providers can report XTC/XTCH with an unknown or vendor-specific
        // MIME type, so filter by extension afterwards.
        type: bookPickerMimeType,
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        log('queue', 'Picker cancelled');
        return;
      }

      // Recheck after the picker closes in case the connected reader changed.
      const version = useDeviceStore.getState().deviceStatus?.version;
      const { supportedBookExtensions } = getDeviceCapabilities(version);
      const validAssets = result.assets.filter((asset) => isSupportedBook(asset.name, supportedBookExtensions));
      const skippedCount = result.assets.length - validAssets.length;

      if (skippedCount > 0) {
        let message = `Skipped ${skippedCount} unsupported file(s). Supported book formats: ${supportedBookExtensions.join(', ')}.`;
        if (result.assets.some((asset) => isSupportedBook(asset.name) && !isSupportedBook(asset.name, supportedBookExtensions))) {
          message += ` XTC/XTCH require firmware ${XTC_MIN_FIRMWARE.join('.')} or later; connected version: ${version || 'unknown'}.`;
        }
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
