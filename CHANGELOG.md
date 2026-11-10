# Changelog

All notable changes to CrossPoint Sync will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Put a separate blue glass Add button beside bottom navigation on iOS 26+, with Uploads in the header; retain the Duo system rail.

### Fixed
- Match native tab backgrounds to the current header theme so Duo's outer display has no white strip in dark mode.
- Keep native navigation tint and header actions after appearance changes, and use clear icon-only tabs in compact landscape.

## [1.5.0] - 2026-11-09

### Added
- Native iOS 26+ glass navigation and Add menus, with system right-rail placement on iPhone Duo.
- A Reader destination beside Library and Settings, with an XTEink-style hardware icon.

### Changed
- Group Add and Uploads together and keep reader management beside Settings.
- Show connection status inside Reader without a notification badge on its navigation icon.
- Keep iOS app and extension build numbers aligned during Expo generation.

## [1.0.0] - Unreleased

### Added
- Device discovery via UDP broadcast on local WiFi
- Manual IP entry with `crosspoint.local` as default
- Connection instructions for first-time users
- Library tab with file browser for connected device
- Interactive tappable breadcrumb navigation bar
- iOS-style swipe-back gesture in file browser
- Swipe-to-delete and file download support
- New folder creation via `Alert.prompt`
- Sync tab with device discovery/connection and upload queue
- EPUB file upload via WebSocket with chunked binary transfer
- Upload queue with offline queuing (queue files without device connected)
- Sequential job processor with progress tracking
- Cancel and retry support for upload jobs
- Keep-awake during active uploads
- iOS Share Extension for importing EPUBs from any app
- Safari Web Clipper Extension using Defuddle + DOMPurify for article extraction
- Clipped articles converted to EPUB and uploaded to device
- Configurable upload paths for books and clipped articles
- Sleep background picker with grayscale preview and BMP conversion
- Settings tab with format preferences, device info, and data management
- About modal
- Light/dark theme support

### Changed
- FAB single tap shows menu directly (based on user feedback)
- Connection sheet text improvements
- Default to `crosspoint.local` with hidden scanning UI
- Upload performance improvements with chunked FileHandle reads

### Fixed
- Upload queue cascade failures after cancel
- Delete API type parameter handling
- Folder contents not showing in file browser
- Web extension UX and icon issues
- Release build configuration
- Folder creation before upload to ensure paths exist
- App not appearing in iOS share sheet
- Various connection and upload stability fixes
