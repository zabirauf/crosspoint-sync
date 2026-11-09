import { Image } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { MAX_EPUB_IMAGE_DIMENSION, type EpubImage } from './epub-images';

/** Use the platform codec, preserving transparency and limiting reader decode size. */
export async function convertEpubImage(
  image: EpubImage,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const directory = new Directory(Paths.cache, 'epub-image-conversion');
  directory.create({ idempotent: true, intermediates: true });
  const suffix = image.mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  const input = new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`,
  );
  let output: File | undefined;
  try {
    input.write(image.data);
    const { width, height } = await Image.getSize(input.uri);
    if (!(width > 0 && height > 0) || width * height > 16_000_000) {
      throw new Error('Image dimensions exceed conversion limits');
    }
    const scale = Math.min(1, MAX_EPUB_IMAGE_DIMENSION / width, MAX_EPUB_IMAGE_DIMENSION / height);
    const actions =
      scale < 1
        ? [
            {
              resize: {
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
              },
            },
          ]
        : [];
    const result = await manipulateAsync(input.uri, actions, { format: SaveFormat.PNG });
    output = new File(result.uri);
    return { data: await output.bytes(), mimeType: 'image/png' };
  } finally {
    for (const file of [output, input]) {
      try {
        if (file?.exists) file.delete();
      } catch {
        /* Cache cleanup is best effort. */
      }
    }
  }
}
