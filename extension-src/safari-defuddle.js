// Defuddle 0.19 uses lookbehind when its module initializes. Safari 16.0–16.3
// cannot construct those regexes, so defer initialization until after this probe.
// esbuild bundles both imports into this content script; no network/eval is used.
let extractor;

export function loadSafariDefuddle() {
  if (!extractor) {
    let supportsLookbehind = false;
    try {
      supportsLookbehind = new RegExp('(?<=a)b').test('ab');
    } catch {
      // Keep the previous extractor for supported Safari versions below 16.4.
    }
    extractor = supportsLookbehind ? import('defuddle') : import('defuddle-legacy');
  }
  return extractor.then((module) => module.default);
}
