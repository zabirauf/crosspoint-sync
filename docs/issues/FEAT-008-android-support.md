---
id: FEAT-008
type: feature
title: Android support
status: closed
priority: high
source: reddit-appstore
reporter: multiple
date_reported: 2026-02-01
date_closed: 2026-02-25
labels: [android, platform]
blocked_by: ""
related: []
reddit_thread: ""
---

# FEAT-008: Android support

## Description

Bring CrossPoint Sync to Android. An Android version is already functional and in active development per the maintainer.

## Priority Rationale

**High** — Multiple users requested Android support. A working prototype already exists.

## Implementation Notes

Android app is functional and published for closed testing. Key features shipped:

- **Share intent** (`modules/share-intent-receiver/`, `services/android-share-import.ts`): Users can share EPUB files from any Android app into the upload queue via `ACTION_SEND` / `ACTION_SEND_MULTIPLE` intent filters.
- **Article clipping via URL share** (`services/url-article-extractor.ts`): Users share a URL from any browser → fetch + heuristic extraction → EPUB generation → upload queue. Replaces the Safari Web Extension approach used on iOS.
- **Multicast lock** (`modules/multicast-lock/`): `WifiManager.MulticastLock` acquired during UDP scans so Android doesn't drop broadcast packets. (Note: UDP discovery was later removed entirely in `ddad6d0`; manual IP connect is the sole connection method on both platforms.)
- **Cleartext HTTP fix** (`network_security_config.xml`, `0532b9d`): Android release builds block cleartext HTTP by default — added config to allow it for the XTEink device's HTTP API.
- **Back button handling** (`131ae69`): Android hardware back button navigates up in the file browser before closing sheets or exiting.
- **Sheet button fix** (`ac0762d`, BUG-007): RNGH gesture tree inside `Sheet.ScrollView` intercepted button taps on Android — switched to plain RN `ScrollView`.
- **PromptDialog** (`components/PromptDialog.tsx`): Cross-platform text input dialog replacing iOS-only `Alert.prompt` for rename, new folder, and manual IP entry.

Remaining Android-specific work (background uploads, etc.) tracked in separate issues.
