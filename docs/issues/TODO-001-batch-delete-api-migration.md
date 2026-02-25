---
id: TODO-001
type: todo
title: Migrate to batch delete API when firmware 1.2.0 ships
status: blocked
priority: low
source: internal
reporter: ""
date_reported: 2026-02-24
date_closed:
labels: [firmware-dependency, device-api]
blocked_by: CrossPoint firmware 1.2.0 release (batch delete endpoint)
related: [FEAT-002]
reddit_thread: ""
---

# TODO-001: Migrate to batch delete API when firmware 1.2.0 ships

## Description

An unreleased firmware commit (`786b438`, on master post-1.1.1) changes `POST /delete` from the current `path`+`type` form fields to a `paths` JSON array format. The app already has dual-format support in `services/device-api.ts` — it detects the firmware version and sends the appropriate format. However, once firmware 1.2.0 actually ships, we need to:

1. **Verify the version gate**: Confirm that the batch delete format lands in 1.2.0 (the gate is currently estimated). Update `services/firmware-version.ts` if the actual version differs.
2. **Test against real firmware**: Validate that the `paths` JSON array format works correctly with the released firmware.
3. **Multi-select delete UI**: With batch delete available, implement a multi-select mode in the file browser to delete multiple files at once (send all paths in a single request instead of N sequential requests).

## Current State

- `services/device-api.ts` `deleteItem()` already supports both formats, gated on `capabilities.batchDelete` (firmware >= 1.2.0).
- `services/firmware-version.ts` has `batchDelete: firmwareAtLeast(version, 1, 2, 0)` with a comment to update when the firmware ships.
- Old format (`path`+`type` form fields) works on all released firmware up to 1.1.1.

## Action Items

- [ ] When firmware 1.2.0 is released, confirm the batch delete endpoint format matches our implementation
- [ ] Update the version gate in `firmware-version.ts` if the actual release version differs from 1.2.0
- [ ] Test delete against firmware 1.2.0 on a real device
- [ ] Implement multi-select mode in file browser for bulk delete (optional enhancement)
