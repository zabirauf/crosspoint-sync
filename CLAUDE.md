# CrossPoint Sync

Book syncing app for XTEink X3 and X4 e-ink readers. Discovers devices on local WiFi, browses files, and uploads EPUB/XTC/XTCH books and XTG/XTH images via WebSocket.

## Stack

- **Expo SDK 54** / React Native 0.81 / TypeScript (strict)
- **Tamagui** v2 RC for UI components (`@tamagui/config/v5` default config)
- **expo-router** v6 with tab-based navigation
- **Zustand** for state management, persisted via AsyncStorage
- **react-native-udp** for UDP device discovery (requires dev build, not Expo Go)
- Targets: **iOS** and **Android**. Bundle ID / Package: `com.crosspointsync.app`

## Commands

```bash
npm start              # Start Expo dev server
npx expo run:ios       # Build and run on iOS (required for native UDP module)
npx expo run:android   # Build and run on Android
npx expo export --platform ios      # Test Metro bundling (iOS)
npx expo export --platform android  # Test Metro bundling (Android)
```

### Visual Testing

```bash
npm run test:visual           # Run Maestro flows + LLM visual judge
npm run test:visual:flows     # Run Maestro flows only (no LLM judge)
npm run test:visual:judge     # Run LLM judge only (requires screenshots)
npm run test:visual:studio    # Interactive flow authoring (browser UI)
npm run test:visual:report    # View latest run report
npm run test:visual:runner    # Test iOS startup recovery decisions without devices
npm run mock-device           # Start mock device server for connected-state tests
```

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
  device-api.ts           # REST client (fetch-based) for XTEink HTTP API
  device-discovery.ts     # UDP broadcast discovery + manual IP validation
  websocket-upload.ts     # WebSocket binary upload with chunked FileHandle reads
  upload-queue.ts         # Sequential job processor subscribing to stores
  share-import.ts         # Imports files shared via iOS Share Extension into upload queue
  clip-import.ts          # Imports clipped articles from Safari Web Extension, generates EPUBs
  epub-generator.ts       # Converts HTML + images into EPUB 3.0 via JSZip
  android-share-import.ts # Imports files/URLs shared via Android share intent
  url-article-extractor.ts # Fetch+heuristic article extraction for Android article clipping
stores/
  device-store.ts      # Connection state, persists lastDeviceIp
  upload-store.ts      # Upload job queue, persists pending/failed jobs
  settings-store.ts    # User preferences (format, upload path)
hooks/
  use-device-discovery.ts  # Scan/connect state machine
  use-device-status.ts     # Polls /api/status every 10s while connected
  use-file-browser.ts      # Path navigation, file CRUD
  use-document-picker.ts   # EPUB/XTC/XTCH/XTG/XTH picker → upload queue
components/
  DeviceCard.tsx       # Device info display with signal/status
  FileRow.tsx          # File/folder row with icons and size
  UploadJobCard.tsx    # Upload progress bar, cancel/retry
  ScanningIndicator.tsx # Animated scanning indicator
  EmptyState.tsx       # Generic empty state
  PromptDialog.tsx     # Cross-platform text input dialog (replaces iOS-only Alert.prompt)
modules/
  app-group-path/      # Local Expo module — exposes iOS App Group container path to JS (iOS only)
  multicast-lock/      # Local Expo module — WiFi MulticastLock for UDP broadcast (Android only)
  share-intent-receiver/ # Local Expo module — reads Android share intent extras (Android only)
plugins/
  withShareExtension.js    # Config plugin — adds iOS Share Extension target + App Groups entitlement
  withWebExtension.js      # Config plugin — adds Safari Web Extension target + native handler
  withAndroidShareIntent.js # Config plugin — adds ACTION_SEND intent filters to Android manifest
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

### Public repository portability

- Use repository-relative paths, placeholders or configurable environment variables in committed documentation, PR text and published artifacts. Keep actual workstation paths and cached-build locations in ignored local notes.
- Before publishing logs or metadata, remove home-directory paths, private usernames and computer names. Use a public Git identity rather than automatically inferred machine-based author/committer addresses.

### Resizable phone and tablet layouts

- Use `useAdaptiveLayout` for current window/safe-area metrics; use a pane's `onLayout` for its own space. Do not use a device model, orientation, or cached screen size to choose a layout.
- Tabs move from bottom navigation to a right rail when usable width permits. Library adds reader/queue context only when the measured scene still leaves at least 508 points for browsing. Keep the same list and screen tree mounted across layout changes.
- Use `AdaptiveSheet` for task dialogs. It keeps a single native Modal and child tree, with a modal-local safe-area provider and keyboard avoidance. Presentation moves from bottom-aligned to centered at expanded widths without replacing inputs or drafts. Retain explicit close/cancel actions and scrollable bodies.
- Keep explicit `padding` keyboard avoidance on both platforms: edge-to-edge Android Modal content can remain behind the keyboard despite `adjustResize`. The standalone `.maestro/manual-flows/android-keyboard-landscape.yaml` reopens Android's keyboard after rotation to verify actual input/action reachability.
- Modal inputs disable Android's full-screen extract editor. Docked Android keyboards replace bottom safe-area padding; short Move folder editing keeps its input/draft mounted in a compact Create/Cancel view and restores destination browsing after keyboard dismissal. Choose that view from measured available height, not orientation.
- Sleep-background pan offsets are fractions of the measured crop frame. Preserve source-image crop coordinates when resizing; do not store offsets in display points. Its native full-screen presentation needs a local `SafeAreaProvider`, including on the first opening before a fold. The standalone `.maestro/manual-flows/sleep-preview-safe-area.yaml` check requires a staged local image and disposable mock reader, and submits that image.
- `withSceneLifecycle` keeps the generated iOS app compatible with the iOS 27 SDK. Expo prepares its existing window/root before app-delegate subscribers run; the scene delegate attaches that same window to the scene. Keep cold/warm URL forwarding and Expo lifecycle subscribers intact. The plugin also floors older pod resource targets to the app's existing minimum deployment version for Xcode 27.
- `npm run test:adaptive` checks task/draft identity and crop invariance. `npm run test:responsive:web` checks the actual exported app across phone, expanded, tablet, split, and short windows; see `docs/analysis/adaptive-layout-validation-2026-11-04.md` for setup. Native rotation coverage is in `.maestro/flows/17-adaptive-layout.yaml`.

## XTEink CrossPoint Protocol

- **Firmware source**: When making changes to device API calls (anything in `services/device-api.ts`, `services/device-discovery.ts`, `services/websocket-upload.ts`, or related hooks), **always read the firmware source first** to validate expected request/response formats, parameter names, and error codes before planning changes. Reuse a checkout already identified in the session, or use the configurable checkout below. Ask the user only if the relevant firmware or fork cannot be identified.
- **Firmware checkout**: Set `CROSSPOINT_FIRMWARE_SOURCE` to an existing checkout, or create an isolated checkout of [crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader) under `.local/` as described in the simulator guide. Keep machine-specific locations in ignored local configuration. Check release tags for capability thresholds. XTC/XTCH reading starts at 0.10.0; WebSocket uploads start at 0.14.0. XTG/XTH are internal page images, not standalone reader formats; the app permits transferring them at 0.14.0+ through the generic uploader. The mock defaults to 1.3.0, not an enforced app minimum.
- **Reader profiles**: `/api/status.device` identifies X3/X4 on firmware 1.3+. `constants/ReaderProfiles.ts` owns portrait sleep-image sizes (X3 528×792; X4 480×800). Require actual reader status or an explicit offline model choice, then freeze the chosen profile so preview and export match; never choose phone layouts from reader models. A missing model in an actual status response retains legacy X4 output; an unknown reported model must not be guessed as X4.
- **Book formats**: `constants/FileFormats.ts` owns format kinds, upload firmware thresholds, derived extensions, and filename matching. `getDeviceCapabilities` returns `supportedFileExtensions` and `filePickerMimeType` for the connected firmware. The picker and queue both validate names against that extension list; file icons describe recognized formats regardless of firmware. Clear stale status when connecting to another reader and resume waiting jobs when fresh status arrives.
- **HTTP REST API** (port 80): `GET /api/status`, `GET /api/files?path=`, `POST /mkdir`, `POST /delete`, `GET /download?path=`
- **WebSocket upload** (port 81): `START:filename:size:path` → `READY` → binary chunks (64KB) → `PROGRESS:received:total` → `DONE`

## Safari Web Clipper Extension

- Users can clip web articles from Safari, which are converted to EPUB and uploaded to the device.
- **Config plugin** (`plugins/withWebExtension.js`) generates the Safari Web Extension at prebuild time: Swift native handler, Info.plist, entitlements, Xcode target, and bundled Resources.
- **Content script** uses **Defuddle** (article extraction) + **DOMPurify** (HTML sanitization). These are bundled into a single IIFE via esbuild at prebuild time.
- **Flow**: Content script extracts article HTML + image URLs → background script downloads images → native handler writes HTML/images/manifest to App Groups → main app picks up via `services/clip-import.ts` → `services/epub-generator.ts` generates EPUB → upload queue.
- **Manifest naming**: Clip manifests are prefixed `clip-` (e.g., `clip-<uuid>.json`) to distinguish from share manifests. HTML goes to `shared-clips/<uuid>.html`, images to `shared-clips/<uuid>/`.
- Extension bundle ID: `com.crosspointsync.app.WebExtension`
- **Dev dependencies**: `defuddle` and `dompurify` are devDependencies — only used at prebuild time for esbuild bundling, not included in the React Native bundle.
- **Extension source files** live in `extension-src/` and are copied/bundled into `ios/CrossPointSyncWebExtension/Resources/` during prebuild.

## iOS Share Extension

- Users can share EPUB files from any app (Files, Safari, etc.) into CrossPoint Sync's upload queue.
- **Config plugin** (`plugins/withShareExtension.js`) generates the native extension at prebuild time: Swift source, Info.plist, entitlements, and Xcode target.
- **App Group**: `group.com.crosspointsync.app` — shared container between main app and extension.
- **Flow**: Extension copies file to App Group container + writes JSON manifest → main app picks up manifests on launch/foreground via `services/share-import.ts` → files added to Zustand upload queue.
- Extension bundle ID: `com.crosspointsync.app.ShareExtension`

## Android Share Intent

- Users can share EPUB files from any Android app into the upload queue, or share URLs from browsers to clip articles.
- **Config plugin** (`plugins/withAndroidShareIntent.js`) adds `ACTION_SEND` / `ACTION_SEND_MULTIPLE` intent filters for `application/epub+zip` and `text/plain` MIME types.
- **Native module** (`modules/share-intent-receiver/`) reads intent extras via `Activity.getIntent()`, resolves `content://` URIs for display name + size, and fires `onShareIntent` events for new intents while the app is running.
- **Flow**: Android share sheet → native module reads intent → `services/android-share-import.ts` copies files to cache + adds to upload queue. For text/URL shares → `services/url-article-extractor.ts` fetches + extracts article → `services/epub-generator.ts` generates EPUB → upload queue.

## Android Article Clipper

- On Android there is no Safari Web Extension equivalent. Instead, users share a URL from any browser via the share sheet.
- **Extraction**: `services/url-article-extractor.ts` uses fetch + heuristics (og:title, meta author, `<article>`/`<main>` tags, image downloading). Quality is ~70-80% vs the iOS Defuddle-based extraction (~95%).
- No WebView or DOM required — pure fetch + regex.

## Android Multicast Lock

- Android silently drops UDP broadcast packets without a `WifiManager.MulticastLock`.
- **Native module** (`modules/multicast-lock/`) exposes `acquire()` / `release()` methods.
- `services/device-discovery.ts` acquires the lock before scanning and releases it in cleanup. Platform-guarded to Android only.
- Requires `CHANGE_WIFI_MULTICAST_STATE` permission (declared in `app.json`).

## Visual Testing

Automated visual regression testing using Maestro + Claude Vision API. Full plan at `docs/plans/automated-visual-testing-pipeline.md`.

### Structure

```
.maestro/
  config.yaml              # Global Maestro config (appId)
  flows/                   # Maestro E2E test flows (YAML)
  helpers/                 # Reusable sub-flows (navigate-to-library, etc.)
  visual-tests/            # LLM judge specs — what Claude evaluates per screen
test-references/           # Approved reference screenshots (committed)
test-screenshots/          # Current run screenshots (gitignored)
test-runs/                 # Run history with reports (last 2 runs kept)
scripts/
  visual-judge.ts          # LLM vision judge — compares screenshots via Claude API
  mock-device-server.ts    # Mock XTEink device for connected-state tests
  update-baselines.sh      # Copy current screenshots as new references
```

### testID Convention

All interactive/visible components must have a `testID` prop. Convention: `ScreenName.ElementName`.

- Screens: `Library.Screen`, `Settings.Screen`
- Tab bar: `TabBar.Library`, `TabBar.Settings`
- Components: `Library.ConnectionPill`, `Library.FileList`, `Library.FAB`
- Dynamic: `Library.FileRow.<filename>`, `UploadQueue.Job.<id>`
- Sheets: `Connection.Sheet`, `UploadQueue.Sheet`
- Actions: `Connection.ConnectButton`, `Connection.ScanButton`, `FAB.UploadBook`, `FAB.NewFolder`

### `/test` Command

Run `/test` to execute the full visual testing pipeline. It runs Maestro flows, invokes the LLM judge, and automatically handles failures:
- **Expected failures** (from intentional UI changes) → updates flows, specs, and prompts you to update baselines
- **Unexpected regressions** → diagnoses the issue and fixes the source code
- **Unclear cases** → asks you whether the change was intentional

You can also run `/test settings` or `/test library` to test a specific screen, or `/test smoke` for a quick check.

### When Building Features or Fixing Bugs

**If you change UI (layout, text, components, styles):**

1. **Add testIDs** to any new components or elements using the `ScreenName.ElementName` convention.
2. **Update Maestro flows** if the change affects navigation, element visibility, or screen content:
   - Modified screen → update the corresponding flow in `.maestro/flows/`
   - New screen → create a new flow file following the numbered naming pattern
3. **Update visual test specs** in `.maestro/visual-tests/` if:
   - Assertions no longer match (e.g., text changed from "Connect" to "Link Device")
   - New elements were added that should be verified
   - Screen description no longer reflects the actual UI
4. **Update reference screenshots** after verifying the new UI is correct:
   - Run flows: `npm run test:visual:flows`
   - Review screenshots in `test-screenshots/`
   - Commit new baselines: `./scripts/update-baselines.sh`

**If you add a new screen or major UI section:**

1. Add testIDs to all elements
2. Create a new Maestro flow in `.maestro/flows/<##>-<name>.yaml`
3. Create a matching visual test spec in `.maestro/visual-tests/<name>.yaml`
4. Capture and commit reference screenshots

**If you rename or remove a component:**

1. Update any Maestro flows that reference the old testID
2. Update visual test spec assertions and focus_elements
3. Remove stale reference screenshots from `test-references/`

### Connected-State Testing

For iOS, select a simulator with `npm run test:visual:flows -- --platform ios --device <UDID>`. The runner waits for boot completion and allows one cold restart of that simulator only for a recognized XCTest accessibility initialization failure before flow execution. It preserves the original logs and stores the retry under `startup-retry/`; app assertions and other failures are never automatically retried. Each invocation requires a fresh output directory.

Flows tagged `requires-device` need a device (real or mock). To test connected states locally:

```bash
npm run mock-device     # Start mock server (HTTP:8082, WS:8083)
# In another terminal, run the app and connect to the mock device via manual IP
```

The default disk-backed mock serves `test-mock-filesystem/`. Its `/Formats/` folder contains a public-domain book as EPUB, XTC, and XTCH, with standalone XTG/XTH page images. The in-memory backend also seeds these real fixtures. See `test-fixtures/book-formats/README.md` for provenance and regeneration, and run `npm run test:books` for picker, icons, and API/WebSocket integration coverage.

### Firmware simulator testing

When correctness depends on the reader accepting generated content, implementing
a device API, or reporting model capabilities, use the official
[CrossPoint firmware simulator](https://github.com/crosspoint-reader/crosspoint-simulator)
for the relevant integration scenario. This applies to EPUB/XHTML/image output,
upload and file-management protocol changes, settings APIs, and model-specific
behavior that the simulator implements. Keep unit and mock tests for fast feedback
and controlled failures; UI-only, documentation, and purely local changes do not
require a firmware build. If the simulator cannot exercise the relevant behavior,
record the limitation and the alternative check.

Read [the setup and acceptance guide](docs/testing/firmware-simulator.md) before
using it. Pin firmware, SDK and simulator revisions, use an isolated checkout and
a fresh virtual SD card per case, and retain logs and screenshots. For an app-to-reader
claim, run the actual app path through the firmware's HTTP/WebSocket service;
copying a file directly to the SD directory tests reader rendering only. For book
generation changes, verify the uploaded book opens and its relevant content renders.
For native codec claims, run the native app. Compare the same input before and
after a fix, describe any test adapters, and include useful evidence in the PR.

Simulator results do not verify physical WiFi/UDP behavior, FAT32 semantics,
device memory limits or e-ink refresh quality. Report those boundaries explicitly;
a browser codec test also does not verify iOS or Android codecs. PR #32 provides
a documented successful app-to-firmware example in the guide.

## Analysis Reports

When asked to produce analysis, triage, or research reports, save them in `docs/analysis/` with a descriptive filename including the date (e.g., `bug-triage-2026-02-24.md`). This keeps analysis artifacts organized and accessible for future reference.

## Commit Conventions

When committing a fix or feature that corresponds to a tracked issue in `docs/issues/`, include the issue ID in the commit message (e.g., `Fix sleep folder case-sensitivity (BUG-001)`). When closing the issue via `/issue`, the commit that updates the issue tracker does not need to repeat the ID.

## Gotchas

- `react-native-udp` requires a dev build (`npx expo run:ios`). Won't work in Expo Go.
- Node v21.7.3 triggers EBADENGINE warnings for some deps. Non-blocking — use Node 20 or >=22 to silence.
- New Architecture is enabled (`newArchEnabled: true`). If `react-native-udp` has TurboModule issues, manual IP entry works as a full fallback.
- `Alert.prompt` is iOS-only. All text input prompts use `components/PromptDialog.tsx` and its shared adaptive modal for cross-platform support.
- **Local Expo modules** (`modules/` dir) require a `.podspec` in the `ios/` subdirectory for CocoaPods autolinking. Without it, `expo-modules-autolinking search` finds the module but `resolve` skips it → "Cannot find native module" at runtime.
- Safari Web Extension requires `npx expo prebuild --clean` after changes to `extension-src/` or `plugins/withWebExtension.js`. The extension's content.js is bundled via esbuild during prebuild — if esbuild isn't available, prebuild will fail.
- The Safari Web Extension must be enabled manually: iOS Settings → Safari → Extensions → CrossPoint Web Clipper.
- **Android MulticastLock**: UDP broadcast won't work without it. The `multicast-lock` module handles this automatically during discovery scans.
- **Android share intent**: Files shared via `content://` URIs must be copied to app cache before the URI expires. `android-share-import.ts` handles this.
- **Tamagui Sheet buttons on Android**: `Sheet.ScrollView` wraps children in a RNGH gesture tree, which intercepts button taps on Android (the list bounces instead of firing `onPress`). Use plain RN `ScrollView` inside `Sheet.Frame` instead. All sheets should also include an explicit `X` close button in the header (chromeless circular `Button` with `FontAwesome name="times"`) since the drag-to-dismiss handle is not always obvious.
- `SwipeBackGesture` is disabled on Android (renders a plain `View`) since Android has its own predictive back gesture.
- Android hardware back button is wired to navigate up in the file browser via `BackHandler`.
