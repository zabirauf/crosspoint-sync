# CrossPoint Sync

Book syncing app for the XTEink X4 e-ink reader. Discovers devices on local WiFi, browses files, and uploads EPUBs/PDFs via WebSocket.

## Stack

- **Expo SDK 54** / React Native 0.81 / TypeScript (strict)
- **Tamagui** v2 RC for UI components (`@tamagui/config/v5` default config)
- **expo-router** v6 with tab-based navigation
- **Zustand** for state management, persisted via AsyncStorage
- **react-native-udp** for UDP device discovery (requires dev build, not Expo Go)
- Primary target: **iOS**. Bundle ID: `com.crosspointsync.app`

## Commands

```bash
npm start          # Start Expo dev server
npx expo run:ios   # Build and run on iOS (required for native UDP module)
npx expo export --platform ios  # Test Metro bundling
```

### Visual Testing

```bash
npm run test:visual           # Run Maestro flows + LLM visual judge
npm run test:visual:flows     # Run Maestro flows only (no LLM judge)
npm run test:visual:judge     # Run LLM judge only (requires screenshots)
npm run test:visual:studio    # Interactive flow authoring (browser UI)
npm run test:visual:report    # View latest run report
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

- **Firmware source**: When making changes to device API calls (anything in `services/device-api.ts`, `services/device-discovery.ts`, `services/websocket-upload.ts`, or related hooks), **always read the firmware source first** to validate expected request/response formats, parameter names, and error codes before planning changes. Ask user where the firmware source code is at. If they don't provide that info then ask user specific question.
- **UDP discovery**: Send "hello" to `255.255.255.255:8134`, parse response matching `crosspoint (on <hostname>);<wsPort>`
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

- Users can share EPUB/PDF files from any app (Files, Safari, etc.) into CrossPoint Sync's upload queue.
- **Config plugin** (`plugins/withShareExtension.js`) generates the native extension at prebuild time: Swift source, Info.plist, entitlements, and Xcode target.
- **App Group**: `group.com.crosspointsync.app` — shared container between main app and extension.
- **Flow**: Extension copies file to App Group container + writes JSON manifest → main app picks up manifests on launch/foreground via `services/share-import.ts` → files added to Zustand upload queue.
- Extension bundle ID: `com.crosspointsync.app.ShareExtension`

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

Flows tagged `requires-device` need a device (real or mock). To test connected states locally:

```bash
npm run mock-device     # Start mock server (UDP:8134, HTTP:8080, WS:8081)
# In another terminal, run the app and connect to the mock device
```

The mock server provides a fake file system with sample books at `/Books/`.

## Gotchas

- `react-native-udp` requires a dev build (`npx expo run:ios`). Won't work in Expo Go.
- Node v21.7.3 triggers EBADENGINE warnings for some deps. Non-blocking — use Node 20 or >=22 to silence.
- New Architecture is enabled (`newArchEnabled: true`). If `react-native-udp` has TurboModule issues, manual IP entry works as a full fallback.
- `Alert.prompt` is iOS-only. The new folder feature in the Library tab uses it.
- **Local Expo modules** (`modules/` dir) require a `.podspec` in the `ios/` subdirectory for CocoaPods autolinking. Without it, `expo-modules-autolinking search` finds the module but `resolve` skips it → "Cannot find native module" at runtime.
- Safari Web Extension requires `npx expo prebuild --clean` after changes to `extension-src/` or `plugins/withWebExtension.js`. The extension's content.js is bundled via esbuild during prebuild — if esbuild isn't available, prebuild will fail.
- The Safari Web Extension must be enabled manually: iOS Settings → Safari → Extensions → CrossPoint Web Clipper.
