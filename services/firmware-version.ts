import { SUPPORTED_EXTENSIONS, type BookExtension } from '@/constants/BookFormats';

export interface FirmwareVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface DeviceCapabilities {
  supportedBookExtensions: readonly BookExtension[];
  /** This is a MIME filter, not a filename glob. */
  bookPickerMimeType: 'application/epub+zip' | '*/*';
  rename: boolean;
  move: boolean;
  settingsApi: boolean;
  batchDelete: boolean;
}

export const XTC_MIN_FIRMWARE = [0, 10, 0] as const;

/**
 * Parse firmware version string like "1.1.0", "1.1.0-dev", "1.1.0-rc+abc123".
 * Pre-release suffixes are stripped — dev builds of 1.0.0 already include 1.0.0 features.
 */
export function parseFirmwareVersion(version: string): FirmwareVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Returns true if the firmware version is >= the given threshold.
 * Returns false if version is undefined or unparseable (safe fallback).
 */
export function firmwareAtLeast(
  version: string | undefined,
  major: number,
  minor: number,
  patch: number,
): boolean {
  if (!version) return false;
  const parsed = parseFirmwareVersion(version);
  if (!parsed) return false;
  if (parsed.major !== major) return parsed.major > major;
  if (parsed.minor !== minor) return parsed.minor > minor;
  return parsed.patch >= patch;
}

/**
 * Derive device capabilities from firmware version.
 * Unknown/unparseable versions allow EPUB only and disable optional APIs.
 */
export function getDeviceCapabilities(version: string | undefined): DeviceCapabilities {
  // Both XTC (1-bit) and XTCH (2-bit) readers shipped in 0.10.0.
  const supportedBookExtensions = firmwareAtLeast(version, ...XTC_MIN_FIRMWARE)
    ? SUPPORTED_EXTENSIONS
    : SUPPORTED_EXTENSIONS.filter((extension) => extension === '.epub');

  return {
    supportedBookExtensions,
    // XTC/XTCH providers can report unknown or vendor-specific MIME types.
    // The picker must therefore validate the selected filenames afterwards.
    bookPickerMimeType: supportedBookExtensions.some((extension) => extension !== '.epub')
      ? '*/*'
      : 'application/epub+zip',
    rename: firmwareAtLeast(version, 1, 0, 0),
    move: firmwareAtLeast(version, 1, 0, 0),
    settingsApi: firmwareAtLeast(version, 1, 1, 0),
    // 1.2.0+ /delete expects a `paths` JSON-array form field; older firmware uses `path`.
    batchDelete: firmwareAtLeast(version, 1, 2, 0),
  };
}
