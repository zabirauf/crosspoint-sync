# Bug & QoL Issue Triage — Stack Ranked

**Date:** 2026-02-24
**Last updated:** 2026-02-24

## Summary

Analyzed all 8 open bugs/UX issues. Excluded feature requests (FEAT-009, FEAT-010) since those are new capabilities, not fixes. Categorized each as either a **Bug** (broken behavior) or **QoL** (quality-of-life improvement), assessed complexity, and stack ranked by priority.

**4 of 8 issues have been fixed** — BUG-001, BUG-005, BUG-007, and BUG-008 are now closed.

---

## Fixed

### ~~3. BUG-008 — File list doesn't auto-refresh after upload~~ FIXED
- **Commit:** `37c588b` — Auto-refresh file list after upload completion
- **Closed in:** `52ce946`

### ~~4. BUG-005 — Android back button on connection sheet navigates folders instead of closing~~ FIXED
- **Commit:** `131ae69` — Fix Android back button closing sheets before navigating folders
- **Closed in:** `52ce946`

### ~~5. BUG-001 — Sleep background upload fails with uppercase "Sleep" folder~~ FIXED
- **Commit:** `6c62fb1` — Fix case-sensitive comparisons vs FAT32 filesystem
- **Closed in:** `52ce946`

### ~~2. BUG-007 — Upload queue delete/retry buttons unresponsive (Android)~~ FIXED
- **Commit:** `ac0762d` — Fix Android sheet button taps intercepted by gesture handler
- **Closed in:** issue tracker updated 2026-02-24

---

## Remaining Issues (highest priority first)

### 1. BUG-006 — Folder browsing breaks after creating a new folder (Android)
- **Category:** Bug (app-breaking)
- **Complexity:** Medium — 2-3 files, ~40 lines
- **Why #1:** This is a showstopper. The app becomes completely unusable after a basic operation (creating a folder) and requires a full restart. Worst user experience of any open bug.
- **Files:** `hooks/use-file-browser.ts`, `services/device-api.ts`, possibly `app/(tabs)/index.tsx`
- **Root cause:** Likely a stale closure or race condition in `createNewFolder` — it calls `loadFiles()` without explicitly passing `currentPath`, and there may be a cache invalidation issue with the device scheduler.

### 3. BUG-003 — Connection fails on iPhone hotspot (172.x.x.x subnet)
- **Category:** Bug (connectivity edge case)
- **Complexity:** Medium — 2-3 files, ~30-50 lines, needs investigation
- **Why #3:** Niche scenario (hotspot usage), and needs more debugging info from the reporter. May involve iOS networking restrictions that are hard to work around. UDP broadcast may not propagate on hotspot interfaces.
- **Files:** `services/device-discovery.ts`, possibly network config
- **Root cause:** Unclear — could be IP validation rejecting 172.x.x.x, broadcast not propagating on hotspot, or iOS sandboxing. Needs hands-on debugging.

### 4. UX-001 — File row swipe actions not discoverable
- **Category:** QoL (discoverability)
- **Complexity:** Low-Medium — 2 files, ~40-60 lines
- **Why #4:** Real usability gap but not broken functionality. Best fix: add a "..." overflow button on each file row as an alternative to swipe. `FileRow.tsx` already has an unused `onLongPress` prop that could be wired up.
- **Files:** `components/FileRow.tsx`, `components/SwipeableFileRow.tsx`

### 5. BUG-004 — Web clipper misses collapsed/lazy-loaded content
- **Category:** QoL (content quality)
- **Complexity:** Low-Medium — 1 file, ~20-30 lines in extension JS
- **Why #5:** Only affects specific pages (Wikipedia collapsed sections). Best-effort fix in `extension-src/content.js` to expand `<details>` elements before extraction. Requires `npx expo prebuild --clean` after changes.
- **Files:** `extension-src/content.js`

---

## Quick Reference Table

| Rank | ID | Description | Type | Complexity | Status |
|------|----|-------------|------|------------|--------|
| 1 | BUG-006 | Folder browsing breaks after mkdir | Bug | Medium | **Open** |
| 2 | BUG-007 | Upload queue buttons broken (Android) | Bug | Medium | **Fixed** |
| 3 | BUG-008 | File list no refresh after upload | QoL | Low | **Fixed** |
| 4 | BUG-005 | Back button doesn't close sheet | Bug | Low | **Fixed** |
| 5 | BUG-001 | Sleep folder case sensitivity | Bug | Low | **Fixed** |
| 6 | BUG-003 | Hotspot connection failure | Bug | Medium | **Open** |
| 7 | UX-001 | Swipe actions not discoverable | QoL | Low-Med | **Open** |
| 8 | BUG-004 | Clipper misses collapsed content | QoL | Low-Med | **Open** |

**Next up:** BUG-006 is the last remaining high-priority Android bug (medium complexity). After that, BUG-003 (hotspot connectivity) is the next open bug.
