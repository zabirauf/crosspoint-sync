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

> **Note:** This app uses `react-native-udp`, which requires a native dev build. It will not work with Expo Go.

## Development

```bash
# Start the Expo dev server (after initial build)
npm start

# Build and run on iOS
npx expo run:ios

# Test Metro bundling
npx expo export --platform ios
```

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
