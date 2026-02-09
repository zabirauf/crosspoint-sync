# Safari Web Clipper Extension for Zync

## Context

Users want to read webpages on their e-ink device. The extension will capture a webpage's content in Safari, convert it to EPUB, and feed it into Zync's existing upload pipeline to send to the device.

This **must be part of the Zync project** (not a separate app) because Safari Web Extensions must be bundled inside a containing iOS app, and Zync already has the full upload infrastructure + App Groups set up.

The approach mirrors the existing Share Extension pattern: extension writes data to App Groups, main app picks it up on launch/foreground, processes it, and queues it for upload.

---

## Architecture

```
Safari → [Content Script] → [Background Script] → [Native Handler] → App Groups → [Main App] → EPUB → Upload Queue → Device
```

1. **Content Script** (`content.js`): Runs **Defuddle** (same as Obsidian Clipper) on the page DOM to extract clean article HTML + metadata, then **DOMPurify** sanitizes the output for safe, well-formed XHTML
2. **Popup** (`popup.html/js`): Shows article preview, user taps "Send to Zync"
3. **Background Script** (`background.js`): Downloads article images via fetch (has page cookies), sends everything to native handler
4. **Native Handler** (`SafariWebExtensionHandler.swift`): Writes HTML + images + manifest JSON to App Groups container
5. **Clip Import** (`clip-import.ts`): Reads clip manifests from App Groups (same pattern as `share-import.ts`)
6. **EPUB Generator** (`epub-generator.ts`): Converts HTML + images into a valid EPUB using JSZip
7. **Existing upload pipeline** takes it from there

---

## Implementation Phases

### Phase 1: EPUB Generator (no native code, testable independently)

**New files:**
- `types/clip.ts` — `ClipManifest`, `ClipImage` interfaces
- `services/epub-generator.ts` — JSZip-based EPUB assembly

**Modified:**
- `package.json` — add `jszip` dependency

**Details:**
- EPUB structure: `mimetype` (uncompressed, first entry), `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`, `OEBPS/nav.xhtml`, `OEBPS/chapter.xhtml`, `OEBPS/styles.css`, `OEBPS/images/*`
- HTML arrives pre-sanitized by DOMPurify in the extension. EPUB generator does lightweight XHTML fixup: self-close void elements (`<br>` → `<br/>`), escape bare `&`, wrap in XHTML document
- Rewrite `<img src>` URLs to reference local `images/` paths
- E-ink-optimized CSS: serif font, good line-height, no backgrounds
- Write output to cache dir via expo-file-system `File` API

### Phase 2: Clip Import Service

**New files:**
- `services/clip-import.ts` — reads clip manifests, generates EPUBs, adds to upload queue

**Modified:**
- `services/share-import.ts` — skip manifests with `type: 'clip'` (line ~46, after parsing)
- `app/_layout.tsx` — wire up `importClippedArticles()` alongside `importSharedFiles()` on launch/foreground
- `services/logger.ts` — add `'clip'` to `LogCategory`

**Clip manifest schema** (written by extension, read by main app):
```typescript
interface ClipManifest {
  id: string;           // UUID
  type: 'clip';         // Distinguishes from share manifests
  title: string;
  author: string;
  sourceUrl: string;
  htmlPath: string;     // Relative path: shared-clips/<uuid>.html
  images: Array<{ originalUrl: string; localPath: string; mimeType: string }>;
  clippedAt: number;
}
```

Manifests go to `manifests/clip-<uuid>.json`, HTML to `shared-clips/<uuid>.html`, images to `shared-clips/<uuid>/`.

### Phase 3: Config Plugin + Native Handler

**New files:**
- `plugins/withWebExtension.js` — Expo config plugin (replicates `withShareExtension.js` pattern)

**Modified:**
- `app.json` — add `"./plugins/withWebExtension"` to plugins array

**Plugin structure** (same 3-function pattern as `withShareExtension.js`):
1. `withAppGroupEntitlement()` — ensures `group.com.zync.app` on main app
2. `withWebExtensionFiles()` — writes Swift handler + Info.plist + entitlements + Resources/ dir to `ios/ZyncWebExtension/`
3. `withWebExtensionTarget()` — adds Xcode target (`app_extension` type with `com.apple.Safari.web-extension` extension point), PBXResourcesBuildPhase for Resources/, build settings

**Key differences from Share Extension plugin:**
- `NSExtensionPointIdentifier`: `com.apple.Safari.web-extension` (not `com.apple.share-services`)
- `NSExtensionPrincipalClass`: `SafariWebExtensionHandler` (not a UIViewController)
- Needs `PBXResourcesBuildPhase` to copy Resources/ (manifest.json, JS, HTML, CSS) into bundle
- Bundle ID: `com.zync.app.WebExtension`

**Native handler** (`SafariWebExtensionHandler.swift`):
- Handles `"clip"` action: parse JSON payload, write HTML/images/manifest to App Groups
- Handles `"ping"` action: health check for extension

### Phase 4: Extension JavaScript

All embedded as string constants in `withWebExtension.js` (same pattern as Share Extension Swift code):

- `Resources/manifest.json` — WebExtension manifest v2, permissions: `activeTab`, `nativeMessaging`
- `Resources/content.js` — bundled with **Defuddle** (content extraction, ~30KB) + **DOMPurify** (HTML sanitization, ~60KB), both inlined as IIFEs. Extracts article via `Defuddle.parse(document)`, sanitizes with `DOMPurify.sanitize(html)`
- `Resources/background.js` — receives clip data, downloads images via fetch, sends to native handler via `browser.runtime.sendNativeMessage()`
- `Resources/popup.html` + `popup.js` + `popup.css` — minimal UI: loading → article preview → "Send to Zync" button → success/error
- `Resources/images/icon-*.png` — extension icons (embedded as base64 in plugin, decoded at prebuild)

---

## Files Summary

| New Files | Purpose |
|-----------|---------|
| `types/clip.ts` | ClipManifest + ClipImage types |
| `services/epub-generator.ts` | HTML + images → EPUB via JSZip |
| `services/clip-import.ts` | App Groups → EPUB → upload queue |
| `plugins/withWebExtension.js` | Config plugin (generates all native + extension files) |

| Modified Files | Change |
|---------------|--------|
| `package.json` | Add `jszip` |
| `app.json` | Add `"./plugins/withWebExtension"` plugin |
| `app/_layout.tsx` | Wire up `importClippedArticles()` on launch/foreground |
| `services/share-import.ts` | Skip `type: 'clip'` manifests |
| `services/logger.ts` | Add `'clip'` to LogCategory |

**Generated at prebuild** (not checked in):
- `ios/ZyncWebExtension/SafariWebExtensionHandler.swift`
- `ios/ZyncWebExtension/Info.plist`
- `ios/ZyncWebExtension/ZyncWebExtension.entitlements`
- `ios/ZyncWebExtension/Resources/` (manifest.json, content.js, background.js, popup.html/js/css, icons)

---

## Key Risks

1. **Xcode target config complexity** — Safari Web Extension targets need a Resources build phase that the Share Extension didn't. Mitigation: create one manually in Xcode first to see exact pbxproj structure, then replicate.
2. **Library bundling** — Defuddle (~30KB) + DOMPurify (~60KB) inlined as string constants in the config plugin. Total ~90KB is manageable for MVP. Future improvement: prebuild script that bundles from `extension-src/`.
3. **Image downloads** — Some images may fail (CORS, auth). Mitigation: skip failed images, article text still readable.
4. **EPUB validity on XTEink X4** — Keep EPUB structure minimal (EPUB 3.0 + EPUB 2.0 NCX fallback). Test early on actual device.
5. **DOMPurify in content script** — Runs in extension JS context which has full DOM APIs, so DOMPurify works natively (no jsdom needed).

---

## Verification

1. **EPUB Generator**: Add temporary debug button in Settings → generate EPUB from sample HTML → open in Apple Books
2. **Clip Import**: Manually create test manifest + HTML in App Group dir → verify app picks it up → verify EPUB in upload queue
3. **Config Plugin**: `npx expo prebuild --clean` → verify `ios/ZyncWebExtension/` generated → build succeeds
4. **End-to-end**: Enable extension in Safari Settings → visit article → tap extension → "Send to Zync" → switch to app → EPUB appears in queue → uploads to device
