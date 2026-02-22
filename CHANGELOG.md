# Changelog

All notable changes to CrossPoint Sync will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
