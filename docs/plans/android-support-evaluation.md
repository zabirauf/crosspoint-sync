# Android Support Evaluation

Comprehensive evaluation of what's needed to support Android for CrossPoint Sync, plus Android-specific improvements for existing functionality.

---

## Executive Summary

The core syncing functionality (device discovery via manual IP, file browsing, WebSocket uploads, upload queue, EPUB generation) is **largely platform-agnostic** and will work on Android with relatively minor changes. The major gaps are:

1. **Cleartext network policy** — Android 9+ blocks HTTP/WS by default; the app uses `http://` and `ws://` exclusively
2. **`Alert.prompt()` calls** — iOS-only API used in 3 places; will crash on Android
3. **iOS Share Extension + Safari Web Clipper** — entirely iOS-specific; need Android equivalents or graceful absence
4. **App Group native module** — iOS-only; needs a stub or Android implementation
5. **Config plugins** — currently iOS-only; will error during `expo prebuild` on Android

---

## 1. Critical Blockers (Must Fix Before Android Runs)

### 1.1 Cleartext HTTP/WS Traffic Blocked on Android 9+

**Problem**: The XTEink device runs an unencrypted HTTP server on port 80 and WebSocket on port 81. Android 9 (API 28+) blocks cleartext traffic by default.

**Affected files**:
- `services/device-api.ts` — all HTTP calls go to `http://<ip>:80`
- `services/websocket-upload.ts:44` — connects to `ws://<ip>:<port>`
- `services/device-discovery.ts` — UDP broadcast (not blocked, but related)

**Fix**: Add `android.networkSecurityConfig` to `app.json` and create an XML config that permits cleartext to local network addresses:

```json
// app.json → expo.android
"android": {
  ...
  "networkSecurityConfig": "./android-network-security-config.xml"
}
```

```xml
<!-- android-network-security-config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <!-- Local network ranges for device communication -->
    <domain includeSubdomains="true">10.0.0.0</domain>
    <domain includeSubdomains="true">172.16.0.0</domain>
    <domain includeSubdomains="true">192.168.0.0</domain>
  </domain-config>
</network-security-config>
```

Alternatively, setting `android:usesCleartextTraffic="true"` in the manifest is simpler but less secure. A config plugin or the `expo-build-properties` plugin can inject this.

**Severity**: **CRITICAL** — Without this, no device communication works on Android.

### 1.2 `Alert.prompt()` Is iOS-Only

**Problem**: `Alert.prompt()` does not exist on Android. Calling it will throw a runtime error.

**Affected files** (3 call sites):
- `app/(tabs)/index.tsx:101` — "New Folder" dialog
- `app/(tabs)/settings.tsx:59` — "Upload Path" input
- `app/(tabs)/settings.tsx:80` — "Clip Upload Path" input

**Fix**: Replace with a cross-platform text input modal. Options:
1. **Custom modal component** with `TextInput` inside a React Native `Modal` — most control, no new deps
2. Use a Tamagui `Dialog` with an `Input` — consistent with existing UI library
3. `Platform.OS === 'ios' ? Alert.prompt(...) : showCustomModal(...)` — keeps iOS behavior intact

Recommended: Option 2 (Tamagui Dialog). Create a reusable `PromptDialog` component used in all 3 locations.

**Severity**: **CRITICAL** — Crashes on Android if not fixed.

### 1.3 Config Plugins Run on Android Prebuild

**Problem**: `withShareExtension` and `withWebExtension` in `app.json` plugins list currently only modify iOS, but they'll still be invoked during `npx expo prebuild --platform android`. The plugins use `withDangerousMod` scoped to `"ios"` and `withEntitlementsPlist` (iOS-only), so they *should* no-op on Android. However:
- If any plugin code assumes iOS paths exist during an Android prebuild, it could error.
- The esbuild step in `withWebExtension` runs regardless of platform (it bundles content.js).

**Fix**: Audit both plugins to ensure they guard against Android execution. The `withDangerousMod` calls are already scoped to `["ios", ...]` so they should be safe. Verify the esbuild bundling step doesn't run when building for Android only.

**Severity**: **HIGH** — Could block `expo prebuild` for Android.

### 1.4 `app-group-path` Native Module Has No Android Implementation

**Problem**: The `modules/app-group-path` module is declared `"platforms": ["ios"]` in its `expo-module.config.json`. On Android, `requireNativeModule('AppGroupPath')` will throw at import time.

**Affected files**:
- `modules/app-group-path/index.ts:7` — `requireNativeModule` call
- `services/share-import.ts:2` — imports `getAppGroupPath`
- `services/clip-import.ts:2` — imports `getAppGroupPath`
- `app/_layout.tsx:20-21` — imports both `importSharedFiles` and `importClippedArticles`

**Fix**: Make `getAppGroupPath` return `null` on Android instead of crashing:

```typescript
import { Platform } from 'react-native';

export function getAppGroupPath(groupIdentifier: string): string | null {
  if (Platform.OS !== 'ios') return null;
  const mod = requireNativeModule<AppGroupPathModule>('AppGroupPath');
  return mod.getPath(groupIdentifier);
}
```

Both `importSharedFiles()` and `importClippedArticles()` already handle `null` from `getAppGroupPath` by returning `0` early, so the downstream code is safe.

**Severity**: **CRITICAL** — Import-time crash on Android.

---

## 2. Android Permissions & Privacy Declarations

### 2.1 Required Android Permissions

The following permissions should be declared in the Android manifest. Expo handles some automatically, but others need explicit configuration via `app.json` or a config plugin.

| Permission | Why | Auto-added? |
|---|---|---|
| `INTERNET` | HTTP API, WebSocket uploads | Yes (Expo default) |
| `ACCESS_NETWORK_STATE` | Check connectivity before discovery | Yes (Expo default) |
| `ACCESS_WIFI_STATE` | UDP broadcast discovery | No — add explicitly |
| `CHANGE_WIFI_MULTICAST_STATE` | Required for UDP broadcast on some devices | No — add explicitly |

**Configuration** (add to `app.json`):

```json
"android": {
  ...
  "permissions": [
    "ACCESS_WIFI_STATE",
    "CHANGE_WIFI_MULTICAST_STATE"
  ]
}
```

### 2.2 Custom Permission Rationale Messages

Android doesn't have a direct equivalent of iOS's `NSLocalNetworkUsageDescription`, but Google Play requires a privacy policy and data safety declarations. For runtime permissions, Android shows custom rationale dialogs.

**Recommendations**:
- **No runtime permissions are currently needed** — network access, file access via document picker, and clipboard don't require runtime prompts on modern Android
- `expo-document-picker` uses the Storage Access Framework, which doesn't require `READ_EXTERNAL_STORAGE`
- If UDP discovery uses multicast, some Samsung/Xiaomi devices may show a "Wi-Fi permission" prompt — no standard rationale string exists for this, but consider showing an explanatory dialog before scanning

### 2.3 Google Play Data Safety Section

When publishing to Google Play, you'll need to declare:
- **Data collected**: Device IP addresses (stored locally for reconnection)
- **Data shared**: None (all communication is local network)
- **Data handling**: No server-side storage, no analytics, no tracking
- **Encryption**: Data in transit is unencrypted (local network HTTP/WS) — this is fine for local-only communication but must be disclosed

---

## 3. Android Share Intent (Equivalent of iOS Share Extension)

### 3.1 Current iOS Approach

The iOS Share Extension is a separate binary target that:
1. Receives EPUB/PDF files from the Share Sheet
2. Copies them to an App Group container
3. Writes a JSON manifest
4. Main app picks up manifests on foreground

### 3.2 Android Equivalent: Intent Filter

Android uses **Intent Filters** instead of Share Extensions. The Expo approach:

**Option A: `expo-intent-launcher` + deep link** — Limited, not ideal for receiving files.

**Option B: Config plugin to add intent filter to AndroidManifest.xml** — Recommended:

```xml
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="application/epub+zip" />
  <data android:mimeType="application/pdf" />
</intent-filter>
<intent-filter>
  <action android:name="android.intent.action.SEND_MULTIPLE" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="application/epub+zip" />
  <data android:mimeType="application/pdf" />
</intent-filter>
```

**Implementation**:
1. Create a config plugin `plugins/withAndroidShareIntent.js` that adds intent filters to `AndroidManifest.xml`
2. Use `expo-linking` or `expo-intent-launcher` to read the incoming intent URI in `app/_layout.tsx`
3. On app launch with a `SEND` intent, copy the shared file to cache and add to upload queue
4. Alternatively, use the `react-native-receive-sharing-intent` community library

**No App Group needed** — Android shares files via content URIs (`content://`) that the main app reads directly. No separate container is required.

### 3.3 Android Share Privacy Text

When declaring intent filters, Android lets you customize the share target label shown to users:

```xml
<activity
  android:label="Send to CrossPoint"
  ...>
```

This appears in the Android share sheet when users share EPUB/PDF files.

---

## 4. Web Clipper (No Direct Android Equivalent)

### 4.1 Current iOS Approach

Safari Web Extension extracts article HTML + images, passes them to the native handler via App Groups, which the main app converts to EPUB.

### 4.2 Android Options

There is no direct equivalent of Safari Web Extensions on Android. Options:

**Option A: Share from browser** — Users select text/URL in Chrome → Share → CrossPoint Sync. The app receives the URL, fetches the page, and runs article extraction (Defuddle) in JavaScript. This reuses the existing EPUB generation pipeline.

**Option B: Custom Tabs / In-app browser** — Add a "Clip" screen with an in-app WebView where users navigate to an article and tap "Clip." The app extracts content via injected JavaScript.

**Option C: Omit on Android** — Simply don't show the "Web Clipper" settings section on Android. The core upload functionality works without it.

**Recommendation**: Start with Option C (omit on Android), then implement Option A (share URL → fetch → extract → EPUB) as a follow-up. Option A is the most natural Android pattern and reuses existing code.

---

## 5. UI/UX Android-Specific Changes

### 5.1 Swipe-Back Gesture

**File**: `components/SwipeBackGesture.tsx`

**Problem**: The iOS-style left-edge swipe-back gesture is not an Android convention. Android users expect:
- Hardware/gesture back button (handled by the system)
- Android 13+ predictive back gesture (already configured: `predictiveBackGestureEnabled: false` in `app.json`)

**Fix**: Disable `SwipeBackGesture` on Android:

```typescript
// app/(tabs)/index.tsx
import { Platform } from 'react-native';

<SwipeBackGesture
  onSwipeBack={navigateUp}
  enabled={Platform.OS === 'ios' && isConnected && currentPath !== '/'}
  resetKey={currentPath}
>
```

Additionally, add a `BackHandler` listener on Android to handle hardware back in the file browser:

```typescript
useEffect(() => {
  if (Platform.OS !== 'android' || !isConnected || currentPath === '/') return;
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    navigateUp();
    return true; // prevent default back behavior
  });
  return () => sub.remove();
}, [isConnected, currentPath, navigateUp]);
```

### 5.2 Safari Extension Settings Row

**File**: `app/(tabs)/settings.tsx:140`

**Problem**: The "Enable in Safari" settings row links to `App-Prefs:SAFARI&path=WEB_EXTENSIONS`, an iOS-only URL scheme. This entire section is irrelevant on Android.

**Fix**: Conditionally hide the Web Clipper section on Android:

```typescript
{Platform.OS === 'ios' && (
  <YStack gap="$2" paddingHorizontal="$2">
    <H4>Web Clipper</H4>
    ...
  </YStack>
)}
```

### 5.3 StatusBar Handling

**File**: `app/modal.tsx:13`

Already handled: `Platform.OS === 'ios' ? 'light' : 'auto'`. No change needed.

### 5.4 Tamagui Sheet Behavior

**Files**: `components/ConnectionSheet.tsx`, `components/UploadQueueSheet.tsx`

Tamagui Sheet (bottom sheet) uses snap points and gesture-based dismissal. On Android:
- Test that the overlay renders correctly
- Verify snap points work with Android gesture navigation
- The `zIndex: 100_000` may interact differently with Android's window layering

**Action**: Manual testing needed. No code changes expected, but may need `elevation` adjustments on Android.

### 5.5 Haptics

**File**: `components/AddBookFAB.tsx`

`expo-haptics` supports both platforms. Android haptic patterns differ from iOS (no "impact" distinction). The current usage will work but feel different. No code change needed.

---

## 6. `react-native-udp` on Android

### 6.1 Current State

`react-native-udp` v4.1.7 supports Android. However:
- The package requires a **dev build** (not Expo Go) on both platforms
- UDP broadcast (`255.255.255.255`) may be blocked by some Android Wi-Fi drivers
- Some devices require `CHANGE_WIFI_MULTICAST_STATE` permission and a `WifiManager.MulticastLock`

### 6.2 MulticastLock Requirement

On many Android devices, UDP broadcast packets are dropped unless a `MulticastLock` is acquired:

```java
WifiManager wifi = (WifiManager) getSystemService(Context.WIFI_SERVICE);
MulticastLock lock = wifi.createMulticastLock("crosspoint-discovery");
lock.acquire();
// ... do UDP discovery ...
lock.release();
```

`react-native-udp` does NOT acquire a MulticastLock automatically. Options:
1. Add a small native module (or Expo module) that acquires/releases the lock
2. Use a fork of `react-native-udp` that handles this
3. Rely on manual IP entry as fallback (already implemented)

**Recommendation**: Start with manual IP fallback (already works). Add MulticastLock as a follow-up if automatic discovery is desired on Android.

### 6.3 Graceful Fallback

`services/device-discovery.ts:17-24` already handles the case where `dgram.createSocket` is unavailable:

```typescript
if (!dgram?.createSocket) {
  onError(new Error('UDP discovery is not available. Please use manual IP entry...'));
  return () => {};
}
```

This fallback will activate if UDP has issues on Android, so the app remains functional.

---

## 7. `app.json` Android Configuration Additions

Current Android config is minimal. Recommended additions:

```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/images/adaptive-icon.png",
    "backgroundColor": "#ffffff"
  },
  "edgeToEdgeEnabled": true,
  "package": "com.crosspointsync.app",
  "permissions": [
    "ACCESS_WIFI_STATE",
    "CHANGE_WIFI_MULTICAST_STATE"
  ],
  "intentFilters": [
    {
      "action": "android.intent.action.SEND",
      "category": ["android.intent.category.DEFAULT"],
      "data": [
        { "mimeType": "application/epub+zip" },
        { "mimeType": "application/pdf" }
      ]
    },
    {
      "action": "android.intent.action.SEND_MULTIPLE",
      "category": ["android.intent.category.DEFAULT"],
      "data": [
        { "mimeType": "application/epub+zip" },
        { "mimeType": "application/pdf" }
      ]
    }
  ]
}
```

---

## 8. EAS Build Configuration

`eas.json` has no platform-specific overrides. Add Android-specific build settings if needed:

```json
"build": {
  "development": {
    "developmentClient": true,
    "distribution": "internal",
    "android": {
      "buildType": "apk"
    }
  }
}
```

Using `"buildType": "apk"` for development builds makes it easier to install on physical devices without Google Play.

---

## 9. File-by-File Change Summary

| File | Change | Priority |
|---|---|---|
| `app.json` | Add Android permissions, intent filters, network security config | Critical |
| `modules/app-group-path/index.ts` | Guard `requireNativeModule` with `Platform.OS` check | Critical |
| `app/(tabs)/index.tsx` | Replace `Alert.prompt` with cross-platform dialog; add `BackHandler` for Android back; disable `SwipeBackGesture` on Android | Critical |
| `app/(tabs)/settings.tsx` | Replace `Alert.prompt` (×2) with cross-platform dialog; hide Web Clipper section on Android | Critical |
| `components/SwipeBackGesture.tsx` | No changes needed (disabled via `enabled` prop from parent) | — |
| `plugins/withShareExtension.js` | Verify no-ops on Android prebuild (likely already safe) | Medium |
| `plugins/withWebExtension.js` | Verify esbuild step doesn't run on Android-only prebuild | Medium |
| `services/share-import.ts` | Already handles `null` from `getAppGroupPath` — no change | — |
| `services/clip-import.ts` | Already handles `null` from `getAppGroupPath` — no change | — |
| `app/_layout.tsx` | No change needed (import calls return 0 on Android gracefully) | — |
| New: network security config XML | Allow cleartext to local network IPs | Critical |
| New: `PromptDialog` component | Cross-platform text input dialog replacing `Alert.prompt` | Critical |
| New: Android share intent handler | Process incoming SEND intents for EPUB/PDF files | Medium |

---

## 10. Recommended Implementation Order

### Phase 1: Make It Run (Critical)
1. Fix `app-group-path` module to not crash on Android
2. Add network security config for cleartext HTTP/WS
3. Replace all `Alert.prompt()` calls with cross-platform dialog
4. Add Android permissions to `app.json`
5. Verify config plugins don't break Android prebuild
6. Hide iOS-only UI (Web Clipper settings section) on Android
7. Add `BackHandler` for file browser navigation on Android
8. Disable swipe-back gesture on Android

### Phase 2: Feature Parity (Medium Priority)
9. Implement Android share intent to receive EPUB/PDF files
10. Test and fix Tamagui Sheet behavior on Android
11. Test UDP discovery on Android (may need MulticastLock)

### Phase 3: Android Polish (Lower Priority)
12. Add web clipper equivalent via share-from-browser flow
13. Fine-tune haptic feedback patterns for Android
14. Test on various Android devices (Samsung, Pixel, Xiaomi) for edge cases
15. Add Google Play data safety declarations

---

## 11. What Already Works on Android (No Changes Needed)

- Expo Router tab navigation
- Tamagui UI components and theming
- Zustand state management with AsyncStorage persistence
- Manual IP device connection + validation
- HTTP REST API calls (once cleartext is allowed)
- WebSocket file uploads (once cleartext is allowed)
- Upload queue processing with pause/resume
- Document picker for EPUB/PDF selection
- EPUB generation via JSZip
- File download and sharing via expo-sharing
- Keep-awake during uploads
- Auto-reconnect to last device
- Debug logging
- Dark mode support
