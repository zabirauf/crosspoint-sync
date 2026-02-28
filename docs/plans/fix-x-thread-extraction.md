# Fix X/Twitter Thread Extraction — Implementation Plan

**Date**: 2026-02-28
**Analysis**: `docs/analysis/x-thread-extraction-2026-02-28.md`

## Overview

X/Twitter thread clipping is broken on both iOS and Android. This plan fixes both platforms by using **Defuddle 0.7.0** — which includes a built-in `TwitterExtractor` — on both:

- **iOS**: Bump Defuddle devDependency; the Safari extension content script already uses Defuddle, so no code changes needed
- **Android**: Bundle Defuddle + DOMPurify via esbuild into a single IIFE string, inject it into the hidden WebView instead of the hand-rolled generic extraction script. Both platforms then use the same extraction library with identical output quality.

---

## Phase 1: iOS Safari Extension (Defuddle bump)

### 1.1 — Bump Defuddle version

**File**: `package.json`

```diff
- "defuddle": "^0.6.6",
+ "defuddle": "^0.7.0",
```

**Why devDependency**: Defuddle is only used at prebuild time — esbuild bundles it into the Safari extension's `content.js` IIFE. It never ships in the React Native JS bundle.

### 1.2 — No content script changes needed

**File**: `extension-src/content.js`

The content script already calls `new Defuddle(document, { url }).parse()`. Defuddle 0.7.0 auto-detects X/Twitter URLs and routes to its internal `TwitterExtractor`. The `.parse()` API is unchanged.

### 1.3 — Rebuild extension

```bash
npm install && npx expo prebuild --clean
```

This re-runs `plugins/withWebExtension.js`, which calls esbuild to bundle the updated Defuddle into the Safari extension's `content.js`.

---

## Phase 2: Android — Inject Defuddle into WebView

Instead of writing a custom X-specific extraction function that mirrors Defuddle's `TwitterExtractor`, we bundle Defuddle itself into the WebView injection script. This gives Android **identical extraction quality to iOS** and automatically benefits from all of Defuddle's site-specific extractors (Twitter, X Articles, and any future ones).

### Architecture

```
extension-src/webview-content.js    ← Source (imports Defuddle + DOMPurify)
        ↓ esbuild (npm run build:webview-bundle)
services/generated/defuddle-webview-bundle.ts  ← Bundled IIFE string (~90KB)
        ↓ imported by
components/HiddenWebViewExtractor.tsx  ← Injects into offscreen WebView
```

This mirrors the iOS approach where `plugins/withWebExtension.js` uses esbuild to bundle `extension-src/content.js` (with Defuddle + DOMPurify) into the Safari extension's resources.

### 2.1 — WebView entry file

**New file**: `extension-src/webview-content.js`

Mirrors `extension-src/content.js` but posts results via `window.ReactNativeWebView.postMessage()` instead of the Safari extension messaging API. Same Defuddle + DOMPurify pipeline, same allowed tags/attributes.

### 2.2 — esbuild bundle script

**New file**: `scripts/bundle-webview-extractor.js`

Bundles `extension-src/webview-content.js` into a single minified IIFE targeting Chrome 90 (Android WebView). Outputs `services/generated/defuddle-webview-bundle.ts` with the bundle as an exported string constant.

**npm script**: `"build:webview-bundle": "node scripts/bundle-webview-extractor.js"`

### 2.3 — Generated bundle placeholder

**New file**: `services/generated/defuddle-webview-bundle.ts`

Committed as a placeholder (`export const DEFUDDLE_EXTRACTION_SCRIPT: string | null = null`) so TypeScript compiles without running the build step. The actual bundle replaces this file after `npm run build:webview-bundle`.

### 2.4 — Updated HiddenWebViewExtractor

**Modified file**: `components/HiddenWebViewExtractor.tsx`

Changes:
1. **Import Defuddle bundle**: `import { DEFUDDLE_EXTRACTION_SCRIPT } from '@/services/generated/defuddle-webview-bundle'`
2. **Script selection**: `const script = DEFUDDLE_EXTRACTION_SCRIPT ?? EXTRACTION_SCRIPT` — uses Defuddle bundle if available, otherwise falls back to the existing generic extraction script
3. **URL-dependent settle delay**: 5 seconds for X/Twitter URLs (heavy React bundle), 2 seconds default. Still well under the 15-second extraction timeout.

### 2.5 — No changes to other files

- `services/webview-extraction-script.ts`: Kept as fallback — used when Defuddle bundle hasn't been generated yet
- `services/webview-article-extractor.ts`: Zustand bridge unchanged; result shape is the same
- `services/android-share-import.ts`: `extractViaWebViewWithFallback` unchanged
- `services/url-article-extractor.ts`: Fetch fallback unchanged (will never work for X anyway)

---

## Build Steps

After merging:

```bash
npm install                    # Install defuddle ^0.7.0
npm run build:webview-bundle   # Generate Defuddle IIFE for Android WebView
npx expo prebuild --clean      # Rebuild iOS Safari extension + Android native
```

Re-run `npm run build:webview-bundle` whenever defuddle or dompurify versions are updated.

---

## File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `package.json` | Bump defuddle `^0.6.6` → `^0.7.0`, add `build:webview-bundle` script | 1+2 |
| `extension-src/webview-content.js` | **New** — Defuddle + DOMPurify entry file for WebView | 2 |
| `scripts/bundle-webview-extractor.js` | **New** — esbuild script to generate bundle | 2 |
| `services/generated/defuddle-webview-bundle.ts` | **New** — placeholder for generated bundle | 2 |
| `components/HiddenWebViewExtractor.tsx` | Use Defuddle bundle + URL-dependent settle delay | 2 |

**Total**: 2 files modified, 3 new files.

---

## Testing

### iOS
- Share an X thread URL via Safari extension
- Verify EPUB title is `"Thread by @handle"` (not `"@username on X"`)
- Verify all thread tweets are captured with text, images, and separators
- Verify non-X articles still extract correctly (regression check)

### Android
- Share an X thread URL from a browser
- Verify processing job shows "Clipping x.com..."
- Verify EPUB title is `"Thread by @handle"`
- Verify all tweets in thread are captured
- Verify images are present and at good quality
- Verify non-X URLs still extract correctly via Defuddle's generic path
- Test with a single tweet (not a thread)
- Test edge case: WebView extraction timeout → falls back to fetch gracefully

### Fallback behavior
- Without running `build:webview-bundle`: Android falls back to generic extraction script (same as current behavior)
- With bundle generated: Android uses Defuddle for all sites, not just X

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Defuddle 0.7.0 has breaking API change | Low | `.parse()` return shape verified — unchanged |
| Bundle size too large for WebView injection | Low | ~90KB minified is trivial; injected once, not a network transfer |
| X changes `data-testid` attributes | Medium | Defuddle is actively maintained; bump version when X changes |
| 5s settle delay not enough on slow devices | Low | 15s extraction timeout provides safety net |
| esbuild bundling fails with Defuddle | Low | Defuddle is standard ESM; already works for iOS Safari extension |

---

## Advantages of Defuddle-based Approach (vs. custom X extraction)

1. **Identical quality on both platforms** — same library, same output
2. **Zero custom X-specific code to maintain** — Defuddle handles it
3. **Future-proof** — new Defuddle site extractors (Medium, Substack, etc.) automatically work on Android
4. **DOMPurify sanitization** — matches iOS exactly, no divergence risk
5. **Less code** — no need to replicate Defuddle's TwitterExtractor logic by hand
