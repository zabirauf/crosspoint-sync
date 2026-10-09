/** All recognized book formats; upload support also depends on firmware. */
export const SUPPORTED_EXTENSIONS = ['.epub', '.xtc', '.xtch'] as const;
export type BookExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Match recognized formats, or the allowed formats supplied by a device. */
export function isSupportedBook(
  fileName: string,
  extensions: readonly BookExtension[] = SUPPORTED_EXTENSIONS,
): boolean {
  const lower = fileName.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}
