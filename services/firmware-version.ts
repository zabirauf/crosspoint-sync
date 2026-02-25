export interface FirmwareVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface DeviceCapabilities {
  rename: boolean;
  move: boolean;
  settingsApi: boolean;
  batchDelete: boolean;
}

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
 * Unknown/unparseable version → all false (safest fallback).
 */
export function getDeviceCapabilities(version: string | undefined): DeviceCapabilities {
  return {
    rename: firmwareAtLeast(version, 1, 0, 0),
    move: firmwareAtLeast(version, 1, 0, 0),
    settingsApi: firmwareAtLeast(version, 1, 1, 0),
    // Batch delete is unreleased (post-1.1.1 on master). Update gate when firmware ships.
    batchDelete: firmwareAtLeast(version, 1, 2, 0),
  };
}
