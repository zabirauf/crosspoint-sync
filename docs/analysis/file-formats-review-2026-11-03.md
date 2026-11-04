# File format support and validation

Last validated November 4, 2026.

Application commit `50ed8e6` supports EPUB/XTC/XTCH books and XTG/XTH image transfers. The branch includes the changes cherry-picked from [PR 21](https://github.com/zabirauf/crosspoint-sync/pull/21). Library and move-sheet rows distinguish books from standalone page images. The upload action now reads “Upload Files.”

## Design decisions

`constants/FileFormats.ts` is the single source for recognized extensions, file kinds, and upload firmware thresholds. `getDeviceCapabilities` derives `supportedFileExtensions` and `filePickerMimeType`; the picker and queue match filenames against that list. A capability enables only the extensions recorded in the registry. The picker rechecks the connected device when selection returns, and the queue checks again before remote writes or opening a socket. Connecting clears stale firmware status, and pending jobs resume when fresh status arrives.

The picker uses EPUB MIME for older/unknown versions and `*/*` when additional formats are allowed. This is a MIME wildcard, not the filesystem glob `**/*`. The installed Expo iOS picker maps it to `UTType.item`; Android uses `ACTION_OPEN_DOCUMENT`. Nonstandard formats can carry unknown or vendor-specific MIME labels, so a narrower MIME filter can hide valid files. Shared extension validation rejects unrelated files after selection and reports skipped files visibly.

The firmware's `isEpub` flag remains EPUB-specific. File icons use the app's format metadata, independently of firmware compatibility. The memory mock stores directory entries and contents separately; rename/move must rekey the byte buffer to the new path so subsequent downloads return the same file. WebSocket `DONE` follows persistence.

## Firmware evidence and capability policy

The local firmware checkout is `/Users/kakaagent/Documents/Projects/Opensource/crosspoint-reader`, inspected at `43694c9018d26446ab30cce2fa65ee608355ae50`.

- [XtcTypes.h](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/Xtc/Xtc/XtcTypes.h) defines XTG as a 1-bit bitmap and XTH as two 1-bit planes representing four gray levels. Both use a 22-byte page header.
- [FsHelpers.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/FsHelpers/FsHelpers.cpp) recognizes `.xtc` and `.xtch` as container extensions. [FileBrowserActivity.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/src/activities/home/FileBrowserActivity.cpp) does not expose standalone XTG/XTH readers.
- [XtcParser.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/Xtc/Xtc/XtcParser.cpp) accepts only XTC/XTCH magic at the container header, then decodes XTG/XTH pages within it. Renaming a page to `.xtc` would not make it readable.
- Both container readers were introduced by [commit f9b604f / PR 135](https://github.com/crosspoint-reader/crosspoint-reader/commit/f9b604f04e8b0ca7e46302b4e3a3c36eb35a2952); the first containing release is 0.10.0 (`b1763821`). [The 0.14.0 WebSocket uploader](https://github.com/crosspoint-reader/crosspoint-reader/blob/0.14.0/src/network/CrossPointWebServer.cpp) writes arbitrary file bytes using `START:filename:size:path`; it has no book-extension restriction. This is the evidence for allowing standalone image transfers at 0.14.0, not evidence of standalone rendering support.

| Firmware | Picker/queue format allowlist |
| --- | --- |
| Unknown, unparseable, or before 0.10.0 | EPUB |
| 0.10.0 through 0.13.x | EPUB, XTC, XTCH |
| 0.14.0 and later | EPUB, XTC, XTCH, XTG, XTH |

The existing app transport still requires 0.14.0 for any actual upload; this change preserves the existing EPUB/container capability policy. Tests of older format boundaries use a modern mock transport with synthetic device status. XTG/XTH support here means selection, storage, download, and file management. Rendering them as standalone images requires a firmware feature that is absent from the inspected checkout.

## Fixtures and integration coverage

The public-domain Gettysburg Address fixtures now include complete standalone XTG (48,022 bytes) and XTH (96,022 bytes) pages extracted from the converted containers. The generator can regenerate all fixtures or extract pages alone. [Fixture provenance and hashes](../../test-fixtures/book-formats/README.md) document the source and regeneration steps.

Both mock backends list and serve all five formats. The integration suite checks case-insensitive filename validation, misleading suffix rejection, unknown versions, both firmware boundaries, picker cancellation/mixed selections, device changes while the picker is open, light/dark icons, real bitmap headers/payloads, queue waits/reconnects, and byte-exact upload/download/rename/move/delete for every format. Rejected image jobs are checked before local file reads, remote writes, or socket creation.

## Validation

| Check | Result |
| --- | --- |
| EPUB unit tests | 14/14 pass |
| Delete protocol contracts | 10/10 pass |
| iOS runner recovery boundaries | 7/7 pass without touching real devices |
| Format/picker/queue/HTTP/WebSocket integration | 15/15 reported tests pass |
| Real URL-to-EPUB integration | 1/1 pass |
| Production exports | iOS and Android pass |
| Fresh native release builds | iOS app/extensions and Android APK pass |
| TypeScript | Same 112 existing diagnostic messages; no new errors |
| Android Maestro suite | All 16 distinct flows pass after retrying two blocked dialogs; Settings capture also refreshed |
| iOS Maestro regression suite | 16/16 flows pass on November 4; zero JUnit failures/errors |
| iOS native picker integrity | All five formats selected and uploaded in the earlier native checks; exact bytes verified |
| Native transfer integrity | All ten native uploads (five formats per platform) match the original bytes |

Tests use the Pixel 7 / Android API 36 emulator and an isolated iPhone 16 Pro / iOS 18.4 simulator, connected to a disk-backed mock reporting firmware 1.3.0. On November 3, XCTest initialization failed with `AXDisableAccessibilityOnTermination: kAXErrorCannotComplete`, so Meta idb 1.7.8 direct touch input supplied the separate manual picker checks and video. On November 4, the actual Maestro suite completed all 16 flows in 1,100.462 seconds with zero failures/errors. Those automated results are separate from the manual native picker recording. The external visual judge was not invoked; screenshots are reviewed locally. Native share registrations remain EPUB-only. No physical-reader rendering test was performed.

The initial Android run passed 14/16 flows. Gboard’s “Try out your stylus” tutorial obscured Rename and New Folder, and also covered the otherwise-passing Settings edit screenshot. The test emulator’s [Android handwriting toggle](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-release/core/java/android/provider/Settings.java) was temporarily disabled, and all three affected flows passed with clear captures. The original runs are preserved; consolidated reports and 17 reviewed screenshots are under `test-screenshots/android/xtg-xth-50ed8e6-verified/`. The format list, XTCH/XTH actions, and connected/disconnected Upload Files references were refreshed after local review.

Native release builds and production exports use application commit `50ed8e6`. The TypeScript comparison ignores shifted line numbers and compares diagnostic file, code, and message; all 112 messages match the prior baseline.

## iOS automation recovery — November 4, 2026

A cold boot of the isolated iOS 18.4 simulator restored the accessibility handshake: `testmanagerd` recorded `AXDisableAccessibilityOnTermination() returned kAXErrorSuccess`, and the real app-launch smoke test passed. The underlying Apple initialization failure is intermittent; no application source change was needed.

Runner commit `daaca59` waits for the explicitly selected simulator to finish booting. If a recognized accessibility initialization failure occurs before any flow starts, it preserves the original logs, cold-restarts only that simulator, and makes one further attempt under `startup-retry/`. Assertions, app crashes, unrelated startup failures, physical phones, and Android devices cannot trigger this recovery. A second initialization failure stays failed. Fresh output directories prevent stale logs from influencing the decision.

Seven isolated runner tests verify those success/failure boundaries without operating a real device. The EPUB, delete, format integration, and real URL-to-EPUB tests also pass. The full iOS suite passed against the unchanged application commit `50ed8e6` using the repaired runner. A further automated dark-mode run also passed after booting in dark appearance, and its capture was verified visually. This corrects a false positive in the initial system-appearance assertion, whose capture remained light. Both original and rerun evidence are preserved; the incorrect light iOS dark reference was replaced with the verified dark capture after announcing and reviewing the change.

## Review media

New annotated recordings show actual native app interactions. Both include chapters and identify the source commit. Android shows a passing Maestro execution at 1.5×, with pre-launch context trimmed and a clearly labeled final test screenshot held for three seconds. iOS is explicitly labeled a manual UI check at 1.5× with idle pauses cut.

| Video | Duration | Cases |
| --- | --- | --- |
| [Android five-format review](videos/2026-11-03/android-five-formats.mp4) | 49 seconds | 0:00 icons and XTCH/XTH actions; 0:09 native picker and uploads |
| [iOS five-format review](videos/2026-11-03/ios-five-formats.mp4) | 47 seconds | 0:00 icons and XTH actions; 0:08 native picker and uploads |

[All ten transfer hashes](videos/2026-11-03/native-five-format-verification.json) preserve the actual download results. The Android native picker test was adjusted to scroll to XTH below the grid fold; its earlier stopped recording is retained separately. Both published MP4s were decoded and visually inspected. The test emulator’s handwriting setting was restored to its original unset value, and task-owned simulators, input companion, and mock server were stopped.

## Reproduction and retained evidence

Run `npm run test:basic`, `npm run test:epub:integration`, `npm run check:bundles`, and `npm run typecheck` through `bash scripts/with-dev-env.sh` when Node is not on PATH. For native checks, start `npm run mock-device`, install the current Release app on the chosen simulator/emulator, then run `npm run test:visual:android` or `npm run test:visual:flows -- --platform ios --device <simulator-UDID>`. The runner handles the specific pre-flow accessibility startup failure as described above; all other failures retain their original exit status. Set `CROSSPOINT_VISUAL_OUTPUT` to preserve a separate run directory. The external judge requires explicit authorization to export screenshots; it is separate from these local checks.

Raw captures and test artifacts are retained under `test-screenshots/videos/xtg-xth-50ed8e6/`; native build/test logs use `.local/xtg-xth-*.log`. Earlier reviews, three-format test reports, and superseded recordings remain available in the [pre-consolidation commit](https://github.com/zabirauf/crosspoint-sync/tree/c4258fe85e6859829a3af2199d46341deba02c5d/docs/analysis). Their results apply to the application commits named in those reports.

The November 4 full run is under `test-screenshots/ios/automation-fix-20261104/full/`, with its 16-test JUnit report at `test-screenshots/ios/automation-fix-20261104/results.xml`. The passing dark-mode verification is under `dark-cold-boot/` in that run directory. Consolidated JUnit results and all 17 reviewed captures, using that corrected dark screenshot, are under `verified/`. On this runtime, appearance preference changes can require a simulator reboot before rendering changes; review the actual capture instead of relying solely on `assertDarkMode`. Startup, basic, and recovery-check logs use `.local/ios-automation-fix-*.log`.
