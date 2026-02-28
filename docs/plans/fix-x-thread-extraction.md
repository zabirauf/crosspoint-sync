# Fix X/Twitter Thread Extraction — Implementation Plan

**Date**: 2026-02-28
**Analysis**: `docs/analysis/x-thread-extraction-2026-02-28.md`

## Overview

X/Twitter thread clipping is broken on both iOS and Android. This plan fixes both platforms:

- **iOS**: Bump Defuddle to get its built-in `TwitterExtractor` (quick win)
- **Android**: Add X-specific extraction logic to the WebView extraction script (the WebView already renders the full DOM — it just needs to know how to navigate X's structure)

---

## Phase 1: iOS Safari Extension (Defuddle bump)

### 1.1 — Bump Defuddle version

**File**: `package.json`

Change `devDependencies`:
```diff
- "defuddle": "^0.6.6",
+ "defuddle": "^0.7.0",
```

Run `npm install` to update `node_modules`.

**Why devDependency**: Defuddle is only used at prebuild time — esbuild bundles it into the Safari extension's `content.js` IIFE. It never ships in the React Native JS bundle.

### 1.2 — Verify content script compatibility

**File**: `extension-src/content.js`

No code changes expected. The content script already calls:
```javascript
const defuddled = new Defuddle(document, { url: window.location.href }).parse();
```

Defuddle 0.7.0 automatically detects `x.com`/`twitter.com` URLs and routes to its internal `TwitterExtractor`. The `.parse()` API is unchanged.

**Verify**: Check that Defuddle 0.7.0's default export and `.parse()` return shape haven't changed (title, content, author, site fields).

### 1.3 — Rebuild extension

After bumping, the extension must be rebuilt:
```bash
npx expo prebuild --clean
```

This re-runs `plugins/withWebExtension.js`, which calls esbuild to bundle the updated Defuddle into `ios/CrossPointSyncWebExtension/Resources/content.js`.

### Phase 1 testing

- Share an X thread URL via Safari extension on iOS
- Verify the EPUB has title `"Thread by @handle"` (not `"@username on X"`)
- Verify all thread tweets are captured with proper text, images, and separators
- Verify non-X articles still extract correctly (regression check)

---

## Phase 2: Android WebView Extraction

### Architecture recap

```
android-share-import.ts  →  extractViaWebViewWithFallback(url)
                               ├─ Try: extractArticleViaWebView(url)
                               │    └─ HiddenWebViewExtractor renders offscreen WebView
                               │         └─ Injects EXTRACTION_SCRIPT after settle delay
                               └─ Catch: extractArticleFromUrl(url)  [fetch fallback]
```

The WebView renders X's full React DOM. The problem is that `webview-extraction-script.ts` uses generic heuristics. We need to add an X-specific extraction path that mirrors Defuddle 0.7.0's `TwitterExtractor`.

### 2.1 — Increase settle delay for X URLs

**File**: `components/HiddenWebViewExtractor.tsx`

Currently, `SETTLE_DELAY_MS` is a hard-coded constant (2000ms). X's heavy React bundle needs more time.

Change the component to compute a per-URL settle delay:

```typescript
const SETTLE_DELAY_DEFAULT = 2000;
const SETTLE_DELAY_X = 5000;

function getSettleDelay(url: string | null): number {
  if (url && (url.includes('x.com/') || url.includes('twitter.com/'))) {
    return SETTLE_DELAY_X;
  }
  return SETTLE_DELAY_DEFAULT;
}
```

Use this in the `delayedScript` template instead of the fixed constant.

**Why 5 seconds**: X's JS bundle is large (several MB) and needs to: download → parse → execute → fetch tweet data via internal API → render React components → populate DOM. 2 seconds is often not enough on mid-range Android devices. 5 seconds gives a comfortable margin while still being well under the 15-second extraction timeout.

### 2.2 — Add X-specific extraction to the WebView script

**File**: `services/webview-extraction-script.ts`

This is the main implementation step. Add X/Twitter detection at the top of the IIFE, and branch to a dedicated extraction function when detected.

#### Detection

```javascript
var isXTwitter = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//.test(document.location.href);
```

#### X-specific extraction function

When `isXTwitter` is true, skip the generic extraction and instead:

**a) Find the conversation timeline:**
```javascript
var timeline = document.querySelector('[aria-label="Timeline: Conversation"]');
```
If not found (single tweet, not a thread), fall back to finding a single `article[data-testid="tweet"]`.

**b) Collect thread tweets:**
```javascript
var tweetElements = timeline
  ? timeline.querySelectorAll('article[data-testid="tweet"]')
  : document.querySelectorAll('article[data-testid="tweet"]');
```
Stop collecting at `<section>` or `<h2>` boundaries (X uses these to separate "Discover more" / "More posts" recommendations from the thread).

**c) Extract per-tweet content:**

For each tweet `<article>`:

- **Text**: `tweet.querySelector('[data-testid="tweetText"]')` → `.innerHTML`
- **Author name + handle**: `tweet.querySelector('[data-testid="User-Name"]')` → parse the links inside (first link = display name, second link = @handle)
- **Images**: `tweet.querySelectorAll('[data-testid="tweetPhoto"] img')` → collect `src` attributes, upgrade quality by replacing `&name=small` or `&name=medium` with `&name=large`
- **Emojis**: `tweet.querySelectorAll('img[src*="/emoji/"]')` → replace with `alt` text (X renders emojis as `<img>` tags with emoji alt text)
- **Quoted tweets**: `tweet.querySelector('[aria-labelledby*="id__"]')` → extract text recursively, wrap in `<blockquote>`

**d) Build title:**
```javascript
var title = 'Thread by ' + mainHandle;  // e.g., "Thread by @trq212"
```
Where `mainHandle` comes from the first tweet's author extraction.

**e) Assemble HTML:**
```html
<div class="tweet-thread">
  <div class="tweet">
    <p class="tweet-author"><strong>Display Name</strong> <span>@handle</span></p>
    <div class="tweet-content">...tweet text with images...</div>
  </div>
  <hr>
  <div class="tweet">
    ...next tweet...
  </div>
</div>
```

**f) Collect images:**
Gather all image URLs from tweets (max 20), ensuring absolute URLs and `&name=large` quality.

**g) Post result** via `window.ReactNativeWebView.postMessage()` with the same shape as the generic extractor:
```javascript
{ success: true, title, author, sourceUrl, html, images }
```

#### Fallback within the script

If X-specific selectors find nothing (e.g., X changes their DOM, or the page hasn't rendered yet), fall through to the generic extraction logic. This means the worst case is the same as current behavior, not worse.

```javascript
if (isXTwitter) {
  var xResult = extractXThread();
  if (xResult) {
    window.ReactNativeWebView.postMessage(JSON.stringify(xResult));
    return;  // Exit the IIFE
  }
  // Fall through to generic extraction
}
```

### 2.3 — No changes needed to other files

- `services/webview-article-extractor.ts`: The Zustand bridge and promise mechanism are unchanged. The extraction result shape is the same.
- `services/android-share-import.ts`: `extractViaWebViewWithFallback` already handles success/fallback correctly. No changes needed.
- `services/url-article-extractor.ts`: The fetch fallback will still not work for X (server returns empty shell), but that's expected — it's the fallback of last resort.

### Phase 2 testing

- Share an X thread URL from a browser on Android
- Verify the processing job shows "Clipping x.com..."
- Verify the EPUB has title `"Thread by @handle"`
- Verify all tweets in the thread are captured
- Verify images are present and at good quality (`&name=large`)
- Verify quoted tweets appear as blockquotes
- Verify the "Discover more" section is excluded
- Verify non-X URLs still extract correctly via the generic path (regression)
- Test with a single tweet (not a thread) — should still extract cleanly
- Test with a tweet that has no images
- Test edge case: X URL that fails to render in 5 seconds → should fall back to fetch gracefully

---

## File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `package.json` | Bump `defuddle` from `^0.6.6` to `^0.7.0` | 1 |
| `components/HiddenWebViewExtractor.tsx` | URL-dependent settle delay (5s for X, 2s default) | 2 |
| `services/webview-extraction-script.ts` | Add X-specific extraction function with `data-testid` selectors | 2 |

**Total**: 3 files modified. No new files.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Defuddle 0.7.0 has breaking API change | Low (minor version bump) | Verify `.parse()` return shape before committing |
| X changes `data-testid` attributes | Medium (has happened before) | Fall through to generic extraction if X selectors find nothing |
| 5s settle delay still not enough on slow devices | Low | The 15s extraction timeout provides a safety net; could increase settle delay further if needed |
| X blocks WebView user agent | Low | WebView uses standard Chrome UA; X serves the same content |
| esbuild bundling fails with new Defuddle | Low | Defuddle is a standard ESM package; esbuild handles it fine |

---

## Out of Scope

- Syndication API / oEmbed approaches (unnecessary since WebView DOM access works)
- X Articles (long-form) extraction — separate feature, different DOM structure
- Improving the fetch fallback for X — fundamentally can't work without JS rendering
- Other site-specific extractors (Medium, Substack, etc.) — separate effort
