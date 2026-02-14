# Privacy Policy — CrossPoint Sync

**Last updated:** February 14, 2026

## Overview

CrossPoint Sync is a companion app for the XTEink X4 e-ink reader. It transfers books and files between your iPhone/iPad and the e-ink reader over your local WiFi network.

## Data Collection

CrossPoint Sync does **not** collect, store, or transmit any personal data. Specifically:

- **No analytics or tracking** — The app contains no analytics SDKs, crash reporters, or tracking pixels.
- **No account required** — There is no sign-in, registration, or user account of any kind.
- **No server-side component** — The app has no backend server. There are no network requests to external services.
- **No third-party services** — The app does not integrate with any third-party data processors or advertisers.

## Local Communication Only

All communication occurs locally between your device and the XTEink X4 e-ink reader over your WiFi network:

- **HTTP and WebSocket** connections to the e-ink reader's local IP address for file browsing and transfers.

No data leaves your local network. The app does not contact any remote servers.

## On-Device Storage

The app stores the following data locally on your device only:

- **Last connected device IP** — so the app can reconnect automatically.
- **Upload queue** — pending file transfers persist across app launches.
- **User preferences** — upload path settings and format preferences.

This data is stored in the app's sandboxed storage and is removed when you delete the app.

## Safari Web Clipper Extension

The optional Safari Web Clipper extension extracts article text and images from web pages you choose to clip. This content is processed entirely on your device, converted to EPUB format, and stored locally. No clipped content is sent to external servers.

## Children's Privacy

The app does not collect any data from any user, including children.

## Changes to This Policy

If this policy is updated, the revised version will be posted here with an updated date.

## Contact

If you have questions about this privacy policy, you can open an issue at:
https://github.com/zohaibrauf/crosspoint-sync/issues
