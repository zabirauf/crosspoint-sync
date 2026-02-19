---
id: FEAT-008
type: feature
title: Android support
status: in-progress
priority: high
source: reddit-appstore
reporter: multiple
date_reported: 2026-02-01
date_closed:
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

- WIP, already functional per maintainer
- Core services (device discovery, WebSocket upload, file browsing) should be largely portable via React Native
- `react-native-udp` supports Android
- Safari Web Extension (web clipper) will need a Firefox/Chrome extension equivalent on Android
- iOS-specific features (`Alert.prompt`, App Groups, Share Extension) need Android counterparts
