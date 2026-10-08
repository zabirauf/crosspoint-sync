import { getDeviceCapabilities } from '@/services/firmware-version';

/** All recognized book formats; upload support also depends on firmware. */
export const SUPPORTED_EXTENSIONS = ['.epub', '.xtc', '.xtch'] as const;

export function isSupportedBook(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** EPUB remains available when the firmware version is unknown. */
export function getSupportedBookExtensions(version: string | undefined) {
  const { xtcBooks } = getDeviceCapabilities(version);
  return SUPPORTED_EXTENSIONS.filter((extension) => extension === '.epub' || xtcBooks);
}

export function isBookSupportedByFirmware(fileName: string, version: string | undefined): boolean {
  const lower = fileName.toLowerCase();
  return getSupportedBookExtensions(version).some((extension) => lower.endsWith(extension));
}
