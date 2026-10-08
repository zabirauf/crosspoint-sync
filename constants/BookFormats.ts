/** Filename extensions accepted for book uploads and displayed with a book icon. */
export const SUPPORTED_EXTENSIONS = ['.epub', '.xtc', '.xtch'] as const;

export function isSupportedBook(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
