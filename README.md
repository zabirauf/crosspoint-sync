# Zync

Book syncing app for the [XTEink X4](https://xteink.com) e-ink reader. Discovers devices on your local WiFi, browses files on the device, and uploads EPUBs/PDFs via WebSocket.

## Features

- **Device Discovery** — Automatically finds your XTEink X4 on the local network via UDP broadcast, or connect manually by IP address
- **File Browser** — Browse, create folders, and manage files directly on your e-ink reader
- **Book Uploads** — Pick EPUBs and PDFs from your phone and upload them over WebSocket with progress tracking
- **Upload Queue** — Queue multiple uploads, retry failures, and track progress for each job
- **Format Preferences** — Configure preferred upload format and destination path on the device

## Tech Stack

- **Expo SDK 54** / React Native 0.81 / TypeScript
- **Tamagui** v2 for UI components
- **expo-router** v6 with tab-based navigation
- **Zustand** for state management (persisted via AsyncStorage)
- **react-native-udp** for UDP device discovery

Primary target: **iOS**

## Prerequisites

- **Node.js** 20 or >= 22 (v21.x triggers EBADENGINE warnings for some dependencies)
- **Xcode** with iOS simulator or a physical iOS device
- An XTEink X4 e-ink reader on the same local network (for full functionality)

## Getting Started

```bash
# Install dependencies
npm install

# Build and run on iOS (required for native UDP module)
npx expo run:ios
```

> **Note:** This app uses `react-native-udp`, which requires a native dev build. Device discovery will not work with Expo Go.

## Development

```bash
# Start the Expo dev server (after initial build)
npm start

# Build and run on iOS simulator
npx expo run:ios

# Build and run on a physical iOS device
npx expo run:ios --device

# Test Metro bundling
npx expo export --platform ios
```

### Running on a Physical Device

This app uses native modules (`react-native-udp`, App Group path, Share Extension) that require a dev build — **Expo Go will not work**.

1. Connect your iPhone via USB (or ensure it's on the same Wi-Fi for wireless debugging)
2. Open `ios/Zync.xcworkspace` in Xcode
3. Select both the **Zync** and **ZyncShareExtension** targets, go to **Signing & Capabilities**, and select your Apple Developer team
4. In Xcode **Build Settings**, search for `ENABLE_USER_SCRIPT_SANDBOXING` and set it to **No** (Xcode 16+ enables this by default, which blocks React Native's bundle script)
5. Run `npx expo run:ios --device` and select your device from the list

> After the initial device build, you can iterate with just `npm start` — the dev client on your phone will connect to Metro automatically.

## Project Structure

```
app/
  _layout.tsx              # Root layout: TamaguiProvider, queue processor, status polling
  (tabs)/
    _layout.tsx            # Tab bar config (Library, Sync, Settings)
    index.tsx              # Library — file browser on connected device
    sync.tsx               # Sync — device discovery/connection + upload queue
    settings.tsx           # Settings — format prefs, device info, data management
  modal.tsx                # About modal
components/                # Reusable UI components
services/                  # Device API client, UDP discovery, WebSocket upload, queue processor
stores/                    # Zustand stores for device, upload, and settings state
hooks/                     # Custom hooks for discovery, status polling, file browsing, document picking
types/                     # TypeScript type definitions
constants/                 # Protocol config (ports, chunk size, timeouts) and theme colors
```

## How It Works

Zync communicates with the XTEink X4 using three protocols:

1. **UDP Discovery** (port 8134) — Broadcasts a `hello` message on the local network and listens for the device's response
2. **HTTP REST API** (port 80) — Fetches device status, lists files, creates/deletes folders, and downloads files
3. **WebSocket Upload** (port 81) — Streams books to the device in 64KB binary chunks with progress reporting

## License

Private
