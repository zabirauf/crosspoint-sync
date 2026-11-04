# XTG and XTH upload support — November 3, 2026

Application commit `50ed8e6` adds XTG and XTH selection and transfers alongside EPUB, XTC, and XTCH. The format registry owns extensions, file kinds, and firmware thresholds; device capabilities derive the allowed extension list and picker MIME filter from it. Library and move-sheet rows distinguish books from standalone page images. The upload action now reads “Upload Files.”

## Firmware evidence and capability policy

The local firmware checkout is `/Users/kakaagent/Documents/Projects/Opensource/crosspoint-reader`, inspected at `43694c9018d26446ab30cce2fa65ee608355ae50`.

- [XtcTypes.h](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/Xtc/Xtc/XtcTypes.h) defines XTG as a 1-bit bitmap and XTH as two 1-bit planes representing four gray levels. Both use a 22-byte page header.
- [FsHelpers.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/FsHelpers/FsHelpers.cpp) recognizes `.xtc` and `.xtch` as container extensions. [FileBrowserActivity.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/src/activities/home/FileBrowserActivity.cpp) does not expose standalone XTG/XTH readers.
- [XtcParser.cpp](https://github.com/crosspoint-reader/crosspoint-reader/blob/43694c9018d26446ab30cce2fa65ee608355ae50/lib/Xtc/Xtc/XtcParser.cpp) accepts only XTC/XTCH magic at the container header, then decodes XTG/XTH pages within it. Renaming a page to `.xtc` would not make it readable.
- Container readers first shipped in 0.10.0, as established in the earlier PR review. [The 0.14.0 WebSocket uploader](https://github.com/crosspoint-reader/crosspoint-reader/blob/0.14.0/src/network/CrossPointWebServer.cpp) writes arbitrary file bytes using `START:filename:size:path`; it has no book-extension restriction. This is the evidence for allowing standalone image transfers at 0.14.0, not evidence of standalone rendering support.

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
| Format/picker/queue/HTTP/WebSocket integration | 15/15 reported tests pass |
| Real URL-to-EPUB integration | 1/1 pass |
| Production exports | iOS and Android pass |
| Fresh native release builds | iOS app/extensions and Android APK pass |
| TypeScript | Same 112 existing diagnostic messages; no new errors |
| Android Maestro suite | All 16 distinct flows pass after retrying two blocked dialogs; Settings capture also refreshed |
| iOS native UI checks | Five format rows/icons, XTH actions, native multi-file picker and five uploads verified |
| Native transfer integrity | All ten native uploads (five formats per platform) match the original bytes |

The full iOS Maestro suite remains blocked by the XCTest accessibility initialization failure documented in [the earlier native test report](full-test-run-2026-11-03.md). These new iOS checks use direct native touch input and visual inspection and are explicitly labeled manual. No iOS automated suite pass is claimed. The external visual judge was not invoked; screenshots are reviewed locally. Native share registrations remain EPUB-only. No physical-reader rendering test was performed.

The initial Android run passed 14/16 flows. Gboard’s “Try out your stylus” tutorial obscured Rename and New Folder, and also covered the otherwise-passing Settings edit screenshot. The test emulator’s [Android handwriting toggle](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android16-release/core/java/android/provider/Settings.java) was temporarily disabled, and all three affected flows passed with clear captures. The original runs are preserved; consolidated reports and 17 reviewed screenshots are under `test-screenshots/android/xtg-xth-50ed8e6-verified/`. The format list, XTCH/XTH actions, and connected/disconnected Upload Files references were refreshed after local review.

The exact source was rebuilt for both native platforms after the final TypeScript correction. Production exports also passed on that committed source. The TypeScript comparison ignores shifted line numbers and compares diagnostic file, code, and message; all 112 messages match the prior baseline.

## Review media

New annotated recordings show actual native app interactions. Both include chapters and identify the source commit. Android shows a passing Maestro execution at 1.5×, with pre-launch context trimmed and a clearly labeled final test screenshot held for three seconds. iOS is explicitly labeled a manual UI check at 1.5× with idle pauses cut.

| Video | Duration | Cases |
| --- | --- | --- |
| [Android five-format review](videos/2026-11-03/android-five-formats.mp4) | 49 seconds | 0:00 icons and XTCH/XTH actions; 0:09 native picker and uploads |
| [iOS five-format review](videos/2026-11-03/ios-five-formats.mp4) | 47 seconds | 0:00 icons and XTH actions; 0:08 native picker and uploads |

[All ten transfer hashes](videos/2026-11-03/native-five-format-verification.json) preserve the actual download results. The Android native picker test was adjusted to scroll to XTH below the grid fold; its earlier stopped recording is retained separately. Both published MP4s were decoded and visually inspected. The test emulator’s handwriting setting was restored to its original unset value, and task-owned simulators, input companion, and mock server were stopped.

Raw captures and test artifacts are retained under `test-screenshots/videos/xtg-xth-50ed8e6/`; native build/test logs use `.local/xtg-xth-*.log`.
