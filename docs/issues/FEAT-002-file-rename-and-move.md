---
id: FEAT-002
type: feature
title: File rename and move (bulk + single)
status: blocked
priority: medium
source: reddit-appstore
reporter: u/Winter_Management_59
date_reported: 2026-02-01
date_closed:
labels: [file-management, firmware-dependency]
blocked_by: CrossPoint firmware — rename/move API endpoints needed
related: []
reddit_thread: ""
---

# FEAT-002: File rename and move (bulk + single)

## Description

Users want the ability to rename files and move files between folders, both individually and in bulk. The current file browser supports browsing, uploading, creating folders, and deleting — but not renaming or moving.

## Priority Rationale

**Medium** — Useful file management feature, but blocked on firmware support. The CrossPoint firmware HTTP API currently has no endpoints for rename or move operations. Maintainer acknowledged this requires firmware-side work first.

## Requirements

- Rename a single file or folder
- Move a single file to a different folder
- Bulk select multiple files for move operations
- Confirmation dialog before destructive operations

## Implementation Notes

- Blocked on CrossPoint firmware adding `POST /rename` and `POST /move` (or similar) API endpoints
- Once firmware supports it, app-side implementation would add:
  - Rename action in file context menu / swipe actions
  - Move action with folder picker
  - Multi-select mode in file browser for bulk operations
  - New methods in `services/device-api.ts`
