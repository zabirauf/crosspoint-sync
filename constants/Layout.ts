// Layout follows the usable app window, including split-screen and folding.
const EXPANDED_MIN_WIDTH = 760;
export const LIBRARY_CONTEXT_PANEL_WIDTH = 212;
export const FAB_BOTTOM_INSET = 16;
export const BREADCRUMB_SCROLL_DELAY_MS = 50;

const MAX_EXPANDED_FONT_SCALE = 1.3;

export function isExpandedWidth(width: number, fontScale = 1) {
  return width >= EXPANDED_MIN_WIDTH * Math.max(1, Math.min(fontScale, MAX_EXPANDED_FONT_SCALE));
}
