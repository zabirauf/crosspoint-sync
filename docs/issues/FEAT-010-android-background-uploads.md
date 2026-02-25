---
id: FEAT-010
type: feature
title: Android background/foreground service for uploads
status: open
priority: medium
source: reddit-beta
reporter: tegenligger
date_reported: 2025-06-25
date_closed:
labels: [android, upload]
blocked_by: ""
related: []
reddit_thread: "/r/xteinkereader/comments/1rdnv31/crosspoint_sync_now_on_android_join_the_beta/"
---

## Description

When switching away from the app on Android, uploads either restart or fail. The app currently warns users to keep it in the foreground, but this is inconvenient when uploading multiple books — users want to switch between a file explorer and CrossPoint Sync to pick files.

Android supports foreground services with persistent notifications, which could keep uploads running when the app is backgrounded. iOS does not support this, so this would be an Android-only enhancement.

### Possible approach

- Use an Android Foreground Service with a notification showing upload progress
- Keep the WebSocket connection alive while the service runs
- Release the service when all uploads complete or the user cancels

## Source

Reddit beta feedback from u/tegenligger:
> "If I switch to another app, the uploads either start again or fail. I saw the warning in the app that I need to keep it alive, however this is inconvenient when uploading more than a few books, since you may want to go back and forth between your preferred file explorer app and your app to see what to upload."
