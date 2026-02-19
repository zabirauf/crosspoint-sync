---
id: FEAT-004
type: feature
title: Firefox/Chrome web clipper (iOS)
status: open
priority: low
source: reddit-appstore
reporter: u/lsualeng13
date_reported: 2026-02-01
date_closed:
labels: [web-clipper, firefox, chrome, ios-limitation]
blocked_by: ""
related: [BUG-004]
reddit_thread: ""
---

# FEAT-004: Firefox/Chrome web clipper (iOS)

## Description

Users want web clipping from non-Safari browsers (Firefox, Chrome) on iOS. The current web clipper is a Safari Web Extension.

### User Requests

- **u/lsualeng13** (App Store post): Asked for Firefox support
- **u/williamsdb** (Beta post): Requested non-Safari clipping
- **u/jordanful** (Beta post): Same request

## Priority Rationale

**Low** — iOS platform limitation. Apple doesn't expose the Safari Web Extension API to third-party browsers. There's no way to inject content scripts into Firefox or Chrome on iOS.

## Possible Workarounds

1. **Share Sheet integration**: Users could share a URL from any browser → app fetches and extracts the article server-side or in-app. Works for public articles only (no paywalled content).
2. **URL scheme / clipboard**: User copies URL → app detects and offers to clip. Worse UX.
3. **Android**: Firefox/Chrome extensions are possible on Android. A working prototype reportedly exists.

## Implementation Notes

- Share Sheet URL handling would be the most viable iOS approach
- Would reuse the same Defuddle + DOMPurify extraction pipeline, but running in-app (via WebView or a JS runtime) instead of as a browser extension
- Need to handle articles that require cookies/auth (likely just skip these gracefully)
