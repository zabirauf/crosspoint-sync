import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File as FSFile, Paths, Directory } from 'expo-file-system';
import UPNG from 'upng-js';
import { encodeRGBAToBmp } from './bmp-encoder';
import { useUploadStore } from '@/stores/upload-store';
import { SLEEP_SCREEN_WIDTH, SLEEP_SCREEN_HEIGHT, SLEEP_UPLOAD_PATH } from '@/constants/Protocol';
import { log } from './logger';

const WORDS: string[] = [
  'amber', 'aspen', 'birch', 'bloom', 'bluff', 'brook', 'cedar', 'cliff',
  'cloud', 'coral', 'crane', 'creek', 'dawn', 'delta', 'dune', 'dusk',
  'eagle', 'elm', 'ember', 'fawn', 'fern', 'finch', 'fjord', 'flame',
  'flint', 'forge', 'frost', 'glade', 'grove', 'hawk', 'hazel', 'heath',
  'heron', 'holly', 'iris', 'ivory', 'jade', 'lake', 'lark', 'leaf',
  'lilac', 'lily', 'linen', 'lotus', 'lunar', 'lynx', 'maple', 'marsh',
  'mesa', 'mist', 'moon', 'moss', 'north', 'oak', 'opal', 'orca',
  'otter', 'pearl', 'petal', 'pine', 'plum', 'pond', 'poppy', 'quail',
  'rain', 'raven', 'reef', 'ridge', 'river', 'robin', 'rose', 'ruby',
  'sage', 'sand', 'shore', 'slate', 'snow', 'solar', 'spark', 'spruce',
  'star', 'stone', 'storm', 'swift', 'terra', 'thorn', 'tide', 'tulip',
  'vale', 'vine', 'violet', 'wave', 'wheat', 'wild', 'willow', 'wolf',
  'wren', 'yarrow', 'yew', 'zen',
];

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

  // Write BMP to documents directory (cache can be purged by iOS mid-session)
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `sleep-${date}-${word}.bmp`;
  const sleepDir = new Directory(Paths.document, 'sleep-backgrounds');
  if (!sleepDir.exists) {
    sleepDir.create();
  }
  const bmpFile = new FSFile(sleepDir, fileName);

  // Write raw bytes using the File API
  bmpFile.write(bmpData);

  if (!bmpFile.exists) {
    throw new Error(`Failed to write BMP file: ${bmpFile.uri}`);
  }

  log('queue', `Saved BMP to ${bmpFile.uri}`);

  // Add to upload queue targeting /sleep/
  useUploadStore.getState().addJob({
    fileName,
    fileUri: bmpFile.uri,
    fileSize: bmpData.length,
    destinationPath: SLEEP_UPLOAD_PATH,
    jobType: 'sleep-background',
  });

  log('queue', `Queued sleep background: ${fileName} → ${SLEEP_UPLOAD_PATH}`);
}
