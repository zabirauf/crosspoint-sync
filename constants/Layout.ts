// Layout follows the usable app window, including split-screen and folding.
export const EXPANDED_MIN_WIDTH = 760;
export const CONTENT_MAX_WIDTH = 1120;
export const SHEET_MAX_WIDTH = 560;

export function isExpandedWidth(width: number, fontScale = 1) {
  return width >= EXPANDED_MIN_WIDTH * Math.max(1, Math.min(fontScale, 1.3));
}
