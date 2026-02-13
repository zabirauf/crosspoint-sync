import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File as FSFile, Paths, Directory } from 'expo-file-system';
import UPNG from 'upng-js';
import { encodeRGBAToBmp } from './bmp-encoder';
import { useUploadStore } from '@/stores/upload-store';
import { SLEEP_SCREEN_WIDTH, SLEEP_SCREEN_HEIGHT, SLEEP_UPLOAD_PATH } from '@/constants/Protocol';
import { log } from './logger';

export interface CropRegion {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Decode a base64 PNG string into raw RGBA pixel data.
 */
function decodePngBase64(base64: string): { rgba: Uint8Array; width: number; height: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const img = UPNG.decode(bytes.buffer);
  const frames = UPNG.toRGBA8(img);
  return {
    rgba: new Uint8Array(frames[0]),
    width: img.width,
    height: img.height,
  };
}

/**
 * Process an image for use as a sleep background:
 * 1. Crop to the specified region
 * 2. Resize to device screen dimensions (480×800)
 * 3. Decode to raw pixels
 * 4. Convert to grayscale BMP
 * 5. Save to cache and queue for upload
 */
export async function processAndQueueSleepBackground(
  imageUri: string,
  cropRegion: CropRegion,
): Promise<void> {
  log('queue', `Processing sleep background: crop=${JSON.stringify(cropRegion)}`);

  // Crop and resize to device screen dimensions
  const result = await manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: Math.round(cropRegion.originX),
          originY: Math.round(cropRegion.originY),
          width: Math.round(cropRegion.width),
          height: Math.round(cropRegion.height),
        },
      },
      { resize: { width: SLEEP_SCREEN_WIDTH, height: SLEEP_SCREEN_HEIGHT } },
    ],
    { format: SaveFormat.PNG, base64: true },
  );

  if (!result.base64) {
    throw new Error('Failed to get base64 data from image manipulator');
  }

  log('queue', `Cropped/resized to ${result.width}×${result.height}`);

  // Decode PNG to raw RGBA pixels
  const { rgba, width, height } = decodePngBase64(result.base64);
  log('queue', `Decoded PNG: ${width}×${height}, ${rgba.length} bytes`);

  // Encode as grayscale BMP
  const bmpData = encodeRGBAToBmp(rgba, width, height, true);
  log('queue', `Encoded BMP: ${bmpData.length} bytes`);

  // Write BMP to cache directory
  const fileName = `sleep-${Date.now()}.bmp`;
  const cacheDir = new Directory(Paths.cache);
  const bmpFile = new FSFile(cacheDir, fileName);

  // Write raw bytes using the File API
  bmpFile.bytes = bmpData;

  log('queue', `Saved BMP to ${bmpFile.uri}`);

  // Add to upload queue targeting /sleep/
  useUploadStore.getState().addJob({
    fileName,
    fileUri: bmpFile.uri,
    fileSize: bmpData.length,
    destinationPath: SLEEP_UPLOAD_PATH,
  });

  log('queue', `Queued sleep background: ${fileName} → ${SLEEP_UPLOAD_PATH}`);
}
