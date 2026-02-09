# Zync

Book syncing app for the XTEink X4 e-ink reader. Discovers devices on local WiFi, browses files, and uploads EPUBs/PDFs via WebSocket.

## Stack

- **Expo SDK 54** / React Native 0.81 / TypeScript (strict)
- **Tamagui** v2 RC for UI components (`@tamagui/config/v5` default config)
- **expo-router** v6 with tab-based navigation
- **Zustand** for state management, persisted via AsyncStorage
- **react-native-udp** for UDP device discovery (requires dev build, not Expo Go)
- Primary target: **iOS**. Bundle ID: `com.zync.app`

## Commands

```bash
npm start          # Start Expo dev server
npx expo run:ios   # Build and run on iOS (required for native UDP module)
npx expo export --platform ios  # Test Metro bundling
```

There are no tests yet. Do not run a test command.

## Project Structure

```
app/
  _layout.tsx          # Root layout: TamaguiProvider, queue processor, status polling
  (tabs)/
    _layout.tsx        # Tab bar config (Library, Sync, Settings)
    index.tsx          # Library tab — file browser on connected device
    sync.tsx           # Sync tab — device discovery/connection + upload queue
    settings.tsx       # Settings tab — format prefs, device info, data management
  modal.tsx            # About modal
  +not-found.tsx
types/
  device.ts            # DeviceInfo, DeviceStatus, DeviceFile, ConnectionStatus
  upload.ts            # UploadJob, UploadJobStatus
  clip.ts              # ClipManifest, ClipImage — web clipper data types
constants/
  Protocol.ts          # UDP/HTTP/WS ports, chunk size, timeouts
  Colors.ts            # Light/dark theme colors
services/
  device-api.ts        # REST client (fetch-based) for XTEink HTTP API
  device-discovery.ts  # UDP broadcast discovery + manual IP validation
  websocket-upload.ts  # WebSocket binary upload with chunked FileHandle reads
  upload-queue.ts      # Sequential job processor subscribing to stores
  share-import.ts      # Imports files shared via iOS Share Extension into upload queue
  clip-import.ts       # Imports clipped articles from Safari Web Extension, generates EPUBs
  epub-generator.ts    # Converts HTML + images into EPUB 3.0 via JSZip
stores/
  device-store.ts      # Connection state, persists lastDeviceIp
  upload-store.ts      # Upload job queue, persists pending/failed jobs
  settings-store.ts    # User preferences (format, upload path)
hooks/
  use-device-discovery.ts  # Scan/connect state machine
  use-device-status.ts     # Polls /api/status every 10s while connected
  use-file-browser.ts      # Path navigation, file CRUD
  use-document-picker.ts   # EPUB/PDF picker → upload queue
components/
  DeviceCard.tsx       # Device info display with signal/status
  FileRow.tsx          # File/folder row with icons and size
  UploadJobCard.tsx    # Upload progress bar, cancel/retry
  ScanningIndicator.tsx # Animated scanning indicator
  EmptyState.tsx       # Generic empty state
modules/
  app-group-path/      # Local Expo module — exposes iOS App Group container path to JS
plugins/
  withShareExtension.js # Config plugin — adds iOS Share Extension target + App Groups entitlement
  withWebExtension.js   # Config plugin — adds Safari Web Extension target + native handler
extension-src/           # Safari Web Extension source files (bundled at prebuild)
  content.js            # Content script — Defuddle + DOMPurify article extraction
  background.js         # Background script — image downloads + native messaging
  popup.html/js/css     # Extension popup UI
  manifest.json         # WebExtension manifest v2
  images/               # Extension icons (48/96/128px)
```

## Key Patterns

- **Path alias**: `@/*` maps to project root (configured in `tsconfig.json`)
- **expo-file-system**: Uses the new class-based API (`File`, `Directory`, `Paths`, `FileHandle`) — NOT the legacy `readAsStringAsync`/`downloadAsync` functions which throw at runtime in SDK 54
- **Tamagui babel plugin**: `disableExtraction: true` is required — extraction causes build errors with RN 0.81
- **Metro config**: Custom `resolveRequest` hook loads `.native.js` instead of `.mjs` for Tamagui packages on native
- **Tamagui v2 RC type errors**: TS reports errors on props like `bordered`, `padded`, `padding`, `alignItems`, `backgroundColor` — these are type definition bugs in the RC, not actual runtime issues. The app bundles and runs fine. Ignore these when checking `tsc` output.

## XTEink X4 Protocol

- **UDP discovery**: Send "hello" to `255.255.255.255:8134`, parse response matching `crosspoint (on <hostname>);<wsPort>`
- **HTTP REST API** (port 80): `GET /api/status`, `GET /api/files?path=`, `POST /mkdir`, `POST /delete`, `GET /download?path=`
- **WebSocket upload** (port 81): `START:filename:size:path` → `READY` → binary chunks (64KB) → `PROGRESS:received:total` → `DONE`

## Safari Web Clipper Extension

- Users can clip web articles from Safari, which are converted to EPUB and uploaded to the device.
- **Config plugin** (`plugins/withWebExtension.js`) generates the Safari Web Extension at prebuild time: Swift native handler, Info.plist, entitlements, Xcode target, and bundled Resources.
- **Content script** uses **Defuddle** (article extraction) + **DOMPurify** (HTML sanitization). These are bundled into a single IIFE via esbuild at prebuild time.
- **Flow**: Content script extracts article HTML + image URLs → background script downloads images → native handler writes HTML/images/manifest to App Groups → main app picks up via `services/clip-import.ts` → `services/epub-generator.ts` generates EPUB → upload queue.
- **Manifest naming**: Clip manifests are prefixed `clip-` (e.g., `clip-<uuid>.json`) to distinguish from share manifests. HTML goes to `shared-clips/<uuid>.html`, images to `shared-clips/<uuid>/`.
- Extension bundle ID: `com.zync.app.WebExtension`
- **Dev dependencies**: `defuddle` and `dompurify` are devDependencies — only used at prebuild time for esbuild bundling, not included in the React Native bundle.
- **Extension source files** live in `extension-src/` and are copied/bundled into `ios/ZyncWebExtension/Resources/` during prebuild.

## iOS Share Extension

- Users can share EPUB/PDF files from any app (Files, Safari, etc.) into Zync's upload queue.
- **Config plugin** (`plugins/withShareExtension.js`) generates the native extension at prebuild time: Swift source, Info.plist, entitlements, and Xcode target.
- **App Group**: `group.com.zync.app` — shared container between main app and extension.
- **Flow**: Extension copies file to App Group container + writes JSON manifest → main app picks up manifests on launch/foreground via `services/share-import.ts` → files added to Zustand upload queue.
- Extension bundle ID: `com.zync.app.ShareExtension`

## Gotchas

- `react-native-udp` requires a dev build (`npx expo run:ios`). Won't work in Expo Go.
- Node v21.7.3 triggers EBADENGINE warnings for some deps. Non-blocking — use Node 20 or >=22 to silence.
- New Architecture is enabled (`newArchEnabled: true`). If `react-native-udp` has TurboModule issues, manual IP entry works as a full fallback.
- `Alert.prompt` is iOS-only. The new folder feature in the Library tab uses it.
- **Local Expo modules** (`modules/` dir) require a `.podspec` in the `ios/` subdirectory for CocoaPods autolinking. Without it, `expo-modules-autolinking search` finds the module but `resolve` skips it → "Cannot find native module" at runtime.
- Safari Web Extension requires `npx expo prebuild --clean` after changes to `extension-src/` or `plugins/withWebExtension.js`. The extension's content.js is bundled via esbuild during prebuild — if esbuild isn't available, prebuild will fail.
- The Safari Web Extension must be enabled manually: iOS Settings → Safari → Extensions → Zync Web Clipper.
