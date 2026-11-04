/** Recognized upload formats. A transfer capability does not imply reader support. */
export const FILE_FORMATS = {
  '.epub': { kind: 'book', minimumFirmware: null },
  // Both container readers shipped in 0.10.0.
  '.xtc': { kind: 'book', minimumFirmware: [0, 10, 0] },
  '.xtch': { kind: 'book', minimumFirmware: [0, 10, 0] },
  // Standalone pages can be stored through the generic WebSocket uploader
  // introduced in 0.14.0. Firmware does not open them as standalone books.
  '.xtg': { kind: 'image', minimumFirmware: [0, 14, 0] },
  '.xth': { kind: 'image', minimumFirmware: [0, 14, 0] },
} as const;

export type SupportedExtension = keyof typeof FILE_FORMATS;
export const SUPPORTED_EXTENSIONS = Object.keys(FILE_FORMATS) as readonly SupportedExtension[];

export function getFileFormat(fileName: string) {
  const lower = fileName.toLowerCase();
  const extension = SUPPORTED_EXTENSIONS.find((extension) => lower.endsWith(extension));
  return extension ? { extension, ...FILE_FORMATS[extension] } : undefined;
}

/** Match recognized formats, or the allowed formats supplied by a device. */
export function isSupportedFile(
  fileName: string,
  extensions: readonly SupportedExtension[] = SUPPORTED_EXTENSIONS,
): boolean {
  const lower = fileName.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}
