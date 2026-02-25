---
id: FEAT-002
type: feature
title: File rename and move (bulk + single)
status: in-progress
priority: medium
source: reddit-appstore
reporter: u/Winter_Management_59
date_reported: 2026-02-01
date_closed:
labels: [file-management]
related: []
reddit_thread: ""
---

# FEAT-002: File rename and move (bulk + single)

## Description

Users want the ability to rename files and move files between folders, both individually and in bulk. The current file browser supports browsing, uploading, creating folders, and deleting — but not renaming or moving.

## Priority Rationale

**Medium** — Useful file management feature. Rename is available on firmware >= 1.0.0; move endpoint also exists since 1.0.0 but needs a folder picker UI.

## Requirements

- Rename a single file or folder
- Move a single file to a different folder
- Bulk select multiple files for move operations
- Confirmation dialog before destructive operations

## Implementation Status

### Done

- **Firmware capability detection** (`services/firmware-version.ts`): Parses firmware version, gates features by version threshold.
- **Rename API** (`services/device-api.ts`): `renameFile()` calls `POST /rename` with user-friendly error mapping (409 conflict, 403 protected, 404 not found).
- **Move API** (`services/device-api.ts`): `moveFile()` calls `POST /move` — API ready, UI deferred.
- **Delete dual-format** (`services/device-api.ts`): `deleteItem()` uses old `path`+`type` format for firmware <= 1.1.x, switches to `paths` JSON array for >= 1.2.0 (batch delete, unreleased).
- **Rename swipe action** (`components/SwipeableFileRow.tsx`): Orange pencil button on files when firmware supports rename.
- **Rename prompt** (`app/(tabs)/index.tsx`): PromptDialog pre-fills current filename, validates input.
- **Capability gating**: Rename action only appears when `capabilities.rename` is true (firmware >= 1.0.0).

### Remaining

- **Move UI**: Folder picker for destination selection (needs design work).
- **Bulk select mode**: Multi-select for bulk move/delete operations.
- **Directory rename**: Firmware rejects directory rename — may be supported in future firmware.

## Firmware Version Matrix

| Feature | First Available | Version Gate |
|---------|----------------|-------------|
| Rename (`POST /rename`) | 1.0.0 | `>= 1.0.0` |
| Move (`POST /move`) | 1.0.0 | `>= 1.0.0` |
| Settings API | 1.1.0 | `>= 1.1.0` |
| Batch delete (`paths` JSON array) | unreleased (post-1.1.1) | `>= 1.2.0` (estimated) |
