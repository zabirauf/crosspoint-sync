---
id: FEAT-003
type: feature
title: X3 device support
status: blocked
priority: low
source: reddit-appstore
reporter: u/WrongTest
date_reported: 2026-02-01
date_closed:
labels: [x3, device-support, firmware-dependency]
blocked_by: CrossPoint firmware port to X3 hardware
related: []
reddit_thread: ""
---

# FEAT-003: X3 device support

## Description

Users with the XTEink X3 e-reader want CrossPoint Sync support. The app currently only targets the X4.

### User Requests

- **u/WrongTest**: Asked about X3 support
- **u/linam97**: Also requested X3 compatibility

## Priority Rationale

**Low** — Entirely blocked on the CrossPoint firmware being ported to X3 hardware. No app-side work can proceed until the firmware exists.

## Implementation Notes

- The X3 may have different hardware specs, screen resolution, and file system layout
- If the firmware port maintains the same HTTP/WS API, app changes could be minimal (mainly device identification and any X3-specific paths)
- If the API differs, would need conditional logic or a device capability system
