/**
 * Pure-JS 24-bit BMP encoder for e-ink sleep backgrounds.
 *
 * Produces an uncompressed Windows BMP (BI_RGB) from raw RGBA pixel data.
 * The firmware auto-converts to its native 2-bit grayscale via dithering.
 */

const BMP_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const BYTES_PER_PIXEL = 3; // 24-bit BGR

/**
 * Encode RGBA pixel data as a 24-bit BMP file.
 *
 * @param rgba  - Uint8Array of RGBA pixels (4 bytes per pixel, left-to-right, top-to-bottom)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param grayscale - If true, convert to grayscale using the firmware's luminance formula
 * @returns Uint8Array containing the complete BMP file
 */
export function encodeRGBAToBmp(
  rgba: Uint8Array,
  width: number,
  height: number,
  grayscale = true,
): Uint8Array {
  // Each row is padded to a 4-byte boundary
  const rowBytes = width * BYTES_PER_PIXEL;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + rowPadding;
  const pixelDataSize = paddedRowBytes * height;
  const fileSize = BMP_HEADER_SIZE + DIB_HEADER_SIZE + pixelDataSize;

  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // --- BMP file header (14 bytes) ---
  buf[0] = 0x42; // 'B'
  buf[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, BMP_HEADER_SIZE + DIB_HEADER_SIZE, true); // pixel data offset

  // --- DIB header / BITMAPINFOHEADER (40 bytes) ---
  view.setUint32(14, DIB_HEADER_SIZE, true); // header size
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive = bottom-to-top row order
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // compression: BI_RGB (none)
  view.setUint32(34, pixelDataSize, true); // image size
  view.setInt32(38, 2835, true); // horizontal resolution (72 DPI)
  view.setInt32(42, 2835, true); // vertical resolution (72 DPI)
  view.setUint32(46, 0, true); // colors in palette
  view.setUint32(50, 0, true); // important colors

  // --- Pixel data (bottom-to-top, BGR order) ---
  const dataOffset = BMP_HEADER_SIZE + DIB_HEADER_SIZE;

  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-to-top
    const bmpRow = height - 1 - y;
    const bmpRowOffset = dataOffset + bmpRow * paddedRowBytes;
    const srcRowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const srcIdx = srcRowOffset + x * 4;
      const dstIdx = bmpRowOffset + x * BYTES_PER_PIXEL;

      const r = rgba[srcIdx];
      const g = rgba[srcIdx + 1];
      const b = rgba[srcIdx + 2];

      if (grayscale) {
        // Firmware luminance formula: lum = (77*R + 150*G + 29*B) >> 8
        const lum = (77 * r + 150 * g + 29 * b) >> 8;
        buf[dstIdx] = lum;     // B
        buf[dstIdx + 1] = lum; // G
        buf[dstIdx + 2] = lum; // R
      } else {
        buf[dstIdx] = b;     // B
        buf[dstIdx + 1] = g; // G
        buf[dstIdx + 2] = r; // R
      }
    }

    // Row padding bytes are already 0 (Uint8Array is zero-initialized)
  }

  return buf;
}
