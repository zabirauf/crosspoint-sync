---
id: FEAT-003
type: feature
title: X3 device support
status: in-progress
priority: low
source: reddit-appstore
reporter: u/WrongTest
date_reported: 2026-02-01
date_closed:
labels: [x3, device-support, firmware-dependency]
blocked_by: ""
related: []
reddit_thread: ""
---

# FEAT-003: X3 device support

## Description

Users with the XTEink X3 e-reader want CrossPoint Sync support. The app currently only targets the X4.

### User Requests

- **u/WrongTest**: Asked about X3 support
- **u/linam97**: Also requested X3 compatibility

## Implementation

CrossPoint 2.0.0 includes X3 support, so the original firmware blocker is resolved.
The app now reads the reported model, displays X3 identity, exports sleep images at
528 × 792, and resets browsing when switching readers. HTTP/WebSocket transfer and
format gates remain shared with X4. Tests exercise both models with the mock reader.
Physical X3 hardware validation remains outstanding. See GitHub #17.
