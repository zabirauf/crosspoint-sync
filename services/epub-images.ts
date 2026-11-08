import type { ClipImage } from '@/types/clip';

export type EpubImage = ClipImage & { data: Uint8Array };
export const MAX_EPUB_IMAGES = 20;
export const MAX_EPUB_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_EPUB_IMAGE_DIMENSION = 1200;

/** JPEG and PNG also work on the older firmware used by issue #9. */
export function isEpubImageMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png';
}

type Converter = (image: EpubImage) => Promise<{ data: Uint8Array; mimeType: string }>;

/** Convert sequentially; an undecodable illustration must not lose the article. */
export async function prepareEpubImages(
  images: EpubImage[],
  converter?: Converter,
): Promise<EpubImage[]> {
  const prepared: EpubImage[] = [];
  const seen = new Set<string>();
  for (const image of images.slice(0, MAX_EPUB_IMAGES)) {
    if (
      seen.has(image.originalUrl) ||
      !image.data.length ||
      image.data.length > MAX_EPUB_IMAGE_BYTES
    )
      continue;
    seen.add(image.originalUrl);
    try {
      const convert = converter ?? (await import('./epub-image-converter')).convertEpubImage;
      const result = await convert(image);
      if (
        isEpubImageMime(result.mimeType) &&
        result.data.length &&
        result.data.length <= MAX_EPUB_IMAGE_BYTES
      ) {
        prepared.push({ ...image, ...result });
      }
    } catch {
      // rewriteImageSources replaces an omitted image with its alt text.
    }
  }
  return prepared;
}
