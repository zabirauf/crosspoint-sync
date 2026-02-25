# Bug & QoL Issue Triage — Stack Ranked

**Date:** 2026-02-24

## Summary

Analyzed all 8 open bugs/UX issues. Excluded feature requests (FEAT-009, FEAT-010) since those are new capabilities, not fixes. Categorized each as either a **Bug** (broken behavior) or **QoL** (quality-of-life improvement), assessed complexity, and stack ranked by priority.

---

## Stack Ranking (highest priority first)

### 1. BUG-006 — Folder browsing breaks after creating a new folder (Android)
- **Category:** Bug (app-breaking)
- **Complexity:** Medium — 2-3 files, ~40 lines
- **Why #1:** This is a showstopper. The app becomes completely unusable after a basic operation (creating a folder) and requires a full restart. Worst user experience of any open bug.
- **Files:** `hooks/use-file-browser.ts`, `services/device-api.ts`, possibly `app/(tabs)/index.tsx`
- **Root cause:** Likely a stale closure or race condition in `createNewFolder` — it calls `loadFiles()` without explicitly passing `currentPath`, and there may be a cache invalidation issue with the device scheduler.

### 2. BUG-007 — Upload queue delete/retry buttons unresponsive (Android)
- **Category:** Bug (broken controls)
- **Complexity:** Medium — 2 files, ~40-60 lines
- **Why #2:** Core upload management buttons don't work at all on Android. Users can't retry failed uploads or clear their queue. The list bounces instead of responding to taps.
- **Files:** `components/UploadJobCard.tsx`, `components/UploadQueueSheet.tsx`
- **Root cause:** Gesture conflict — `Sheet.ScrollView` intercepts touch events before they reach child `Button` components. Android's touch propagation differs from iOS. Fix likely involves replacing Tamagui `Button` with `react-native-gesture-handler`'s `RectButton`, or disabling scroll during button press.

### 3. BUG-008 — File list doesn't auto-refresh after upload
- **Category:** QoL (stale UI, not broken)
- **Complexity:** Low — 2 files, ~20-30 lines
- **Why #3:** Very noticeable friction. Users upload a file and don't see it appear — feels broken even though the upload succeeded. Easy win with high user-perceived value.
- **Files:** `hooks/use-file-browser.ts`, `services/upload-queue.ts`
- **Root cause:** Upload queue and file browser are fully decoupled. When an upload completes, `dirListingCache.clear()` is called but nothing triggers a `loadFiles()` refresh. Fix: subscribe to upload store completion events in the file browser hook.

### 4. BUG-005 — Android back button on connection sheet navigates folders instead of closing
- **Category:** Bug (wrong behavior)
- **Complexity:** Low — 1 file, ~15 lines
- **Why #4:** Annoying but not blocking. The `BackHandler` in `index.tsx` always handles back press for folder navigation without checking if the connection sheet is open first. Just needs a state check added.
- **Files:** `app/(tabs)/index.tsx`
- **Root cause:** `onBackPress` handler (line 107-123) doesn't check `connectionSheetOpen` state before navigating up.

### 5. BUG-001 — Sleep background upload fails with uppercase "Sleep" folder
- **Category:** Bug (silent failure)
- **Complexity:** Low — 2-3 files, ~15-25 lines
- **Why #5:** Affects a specific workflow (sleep backgrounds) and has a user workaround (create lowercase folder). The path `/sleep` is hardcoded in `constants/Protocol.ts` and the app never calls `ensureRemotePath()` before uploading.
- **Files:** `constants/Protocol.ts`, `services/sleep-background.ts`, `services/device-api.ts`
- **Root cause:** Hardcoded lowercase path + no folder creation step before upload.

### 6. BUG-003 — Connection fails on iPhone hotspot (172.x.x.x subnet)
- **Category:** Bug (connectivity edge case)
- **Complexity:** Medium — 2-3 files, ~30-50 lines, needs investigation
- **Why #6:** Niche scenario (hotspot usage), and needs more debugging info from the reporter. May involve iOS networking restrictions that are hard to work around. UDP broadcast may not propagate on hotspot interfaces.
- **Files:** `services/device-discovery.ts`, possibly network config
- **Root cause:** Unclear — could be IP validation rejecting 172.x.x.x, broadcast not propagating on hotspot, or iOS sandboxing. Needs hands-on debugging.

### 7. UX-001 — File row swipe actions not discoverable
- **Category:** QoL (discoverability)
- **Complexity:** Low-Medium — 2 files, ~40-60 lines
- **Why #7:** Real usability gap but not broken functionality. Best fix: add a "..." overflow button on each file row as an alternative to swipe. `FileRow.tsx` already has an unused `onLongPress` prop that could be wired up.
- **Files:** `components/FileRow.tsx`, `components/SwipeableFileRow.tsx`

### 8. BUG-004 — Web clipper misses collapsed/lazy-loaded content
- **Category:** QoL (content quality)
- **Complexity:** Low-Medium — 1 file, ~20-30 lines in extension JS
- **Why #8:** Only affects specific pages (Wikipedia collapsed sections). Best-effort fix in `extension-src/content.js` to expand `<details>` elements before extraction. Requires `npx expo prebuild --clean` after changes.
- **Files:** `extension-src/content.js`

---

## Quick Reference Table

| Rank | ID | Description | Type | Complexity | Est. Lines |
|------|----|-------------|------|------------|------------|
| 1 | BUG-006 | Folder browsing breaks after mkdir | Bug | Medium | ~40 |
| 2 | BUG-007 | Upload queue buttons broken (Android) | Bug | Medium | ~50 |
| 3 | BUG-008 | File list no refresh after upload | QoL | Low | ~25 |
| 4 | BUG-005 | Back button doesn't close sheet | Bug | Low | ~15 |
| 5 | BUG-001 | Sleep folder case sensitivity | Bug | Low | ~20 |
| 6 | BUG-003 | Hotspot connection failure | Bug | Medium | ~40 |
| 7 | UX-001 | Swipe actions not discoverable | QoL | Low-Med | ~50 |
| 8 | BUG-004 | Clipper misses collapsed content | QoL | Low-Med | ~25 |

**Suggested batch:** Tackle #1-5 as a single sprint — they're all Low-Medium complexity and would significantly improve the Android experience + fix the most user-reported pain points.
