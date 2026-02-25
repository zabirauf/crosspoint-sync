# Issue Tracker

File-based issue tracking for CrossPoint Sync. Each issue is a Markdown file with YAML front matter.

## Conventions

### Creating a New Issue

1. Choose a type prefix: `BUG`, `FEAT`, `UX`, `PERF`, `TODO`
2. Use the next sequential number for that type, zero-padded to 3 digits
3. Name the file `{TYPE}-{NNN}-{short-slug}.md`
4. Include the full YAML front matter (see template below)
5. Add the issue to the relevant summary table in this README

### Front Matter Template

```yaml
---
id: FEAT-001
type: bug | feature | ux | performance | todo
title: Short descriptive title
status: open | in-progress | blocked | closed
priority: critical | high | medium | low
source: reddit-beta | reddit-appstore | github | internal
reporter: reddit username or github handle
date_reported: YYYY-MM-DD
date_closed:
labels: []
blocked_by: ""
related: []
reddit_thread: ""
---
```

### Status Flow

- **open** — Acknowledged, not started
- **in-progress** — Actively being worked on
- **blocked** — Cannot proceed (external dependency)
- **closed** — Resolved or intentionally declined

---

## Bugs

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [BUG-003](BUG-003-hotspot-connection-failure.md) | Connection fails on iPhone hotspot (172.x.x.x subnet) | medium | open |
| [BUG-004](BUG-004-web-clipper-collapsed-content.md) | Web clipper misses collapsed/lazy-loaded content | low | open |
| [BUG-006](BUG-006-folder-browsing-breaks-after-mkdir.md) | Folder browsing breaks after creating a new folder (Android) | high | open |
| [BUG-007](BUG-007-upload-queue-buttons-not-working-android.md) | Upload queue delete/retry buttons unresponsive on Android — list bounces instead | high | open |

## UX Issues

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [UX-001](UX-001-swipe-actions-not-discoverable.md) | File row swipe actions (delete/save) not discoverable | low | open |

## Feature Requests

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [FEAT-008](FEAT-008-android-support.md) | Android support | high | in-progress |
| [FEAT-001](FEAT-001-epub-to-xtc-conversion.md) | EPUB to XTC/XTCH conversion | high | open |
| [FEAT-002](FEAT-002-file-rename-and-move.md) | File rename and move (bulk + single) | medium | in-progress |
| [FEAT-003](FEAT-003-x3-device-support.md) | X3 device support | low | blocked |
| [FEAT-004](FEAT-004-firefox-chrome-web-clipper.md) | Firefox/Chrome web clipper (iOS) | low | open |
| [FEAT-006](FEAT-006-rss-feed-support.md) | RSS feed support with selective sync | high | open |
| [FEAT-007](FEAT-007-readwise-integration.md) | Readwise integration | low | open |
| [FEAT-009](FEAT-009-app-store-review-prompt.md) | Prompt user for App Store review after successful interaction | medium | open |
| [FEAT-010](FEAT-010-android-background-uploads.md) | Android background/foreground service for uploads | medium | open |

## TODOs

Internal technical tasks, migrations, and maintenance follow-ups.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [TODO-001](TODO-001-batch-delete-api-migration.md) | Migrate to batch delete API when firmware 1.2.0 ships | low | blocked |

## Closed / Declined

| Item | Outcome |
|------|---------|
| Sleep background upload | Shipped in App Store release |
| File delete | Already exists (swipe gesture) |
| Reading progress sync | Declined — would require full e-reader app |
| + button long-press UX | Resolved — always shows options menu now |
| [BUG-001](BUG-001-sleep-folder-case-sensitivity.md) | Fixed — case-insensitive folder comparison for FAT32 |
| [BUG-005](BUG-005-android-back-button-connection-sheet.md) | Fixed — back button now closes sheets before navigating folders |
| [BUG-008](BUG-008-file-list-no-refresh-after-upload.md) | Fixed — file list auto-refreshes after upload completion |
