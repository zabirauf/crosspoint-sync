import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File as FSFile } from 'expo-file-system';
import { Alert } from 'react-native';
import { useUploadStore } from '@/stores/upload-store';
import { useDeviceStore } from '@/stores/device-store';
import { log } from '@/services/logger';
import { isSupportedFile } from '@/constants/FileFormats';
import { getDeviceCapabilities, getFileFirmwareError } from '@/services/firmware-version';

export function useDocumentPicker() {
  const addJob = useUploadStore((s) => s.addJob);

  const pickAndQueueFiles = useCallback(
    async (destPath: string) => {
      const { filePickerMimeType } = getDeviceCapabilities(useDeviceStore.getState().deviceStatus?.version);
      const result = await DocumentPicker.getDocumentAsync({
        // Providers can report bitmap/container files with an unknown or vendor-specific
        // MIME type, so filter by extension afterwards.
        type: filePickerMimeType,
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        log('queue', 'Picker cancelled');
        return;
      }

      // Recheck after the picker closes in case the connected reader changed.
      const version = useDeviceStore.getState().deviceStatus?.version;
      const { supportedFileExtensions } = getDeviceCapabilities(version);
      const validAssets = result.assets.filter((asset) => isSupportedFile(asset.name, supportedFileExtensions));
      const skippedCount = result.assets.length - validAssets.length;

      if (skippedCount > 0) {
        const requirements = result.assets
          .filter((asset) => isSupportedFile(asset.name) && !isSupportedFile(asset.name, supportedFileExtensions))
          .map((asset) => getFileFirmwareError(asset.name, version));
        const message = [`Skipped ${skippedCount} unsupported file(s). Supported formats: ${supportedFileExtensions.join(', ')}.`,
          ...new Set(requirements)].join(' ');
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
