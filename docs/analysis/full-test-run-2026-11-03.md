# Native regression validation November 3 2026

Application commit `5934b64` matches the pushed `codex/pr-21-book-formats` branch. The basic suites, production exports, both native Release builds, and all Android UI flows pass. Actual native picker uploads of EPUB, XTC, and XTCH were verified byte-for-byte on both platforms. The full iOS Maestro suite remains blocked during XCTest initialization, so this is not an all-green test run.

## Results

| Check | Result |
| --- | --- |
| EPUB unit tests | 14/14 pass |
| Real URL to EPUB integration | 1/1 pass |
| Delete protocol contracts | 10/10 pass |
| Book-format, capability, picker, queue, HTTP and WebSocket integration | 13/13 reported tests pass |
| Production Metro exports | iOS and Android pass |
| Android Release APK | Build passes |
| iOS Release simulator app and native extensions | Build passes |
| Android Maestro regression suite | All 16 distinct flows pass after retrying eight blocked by a Pixel Launcher ANR |
| Android native picker | EPUB, XTC and XTCH selected together and uploaded successfully |
| Android unsupported selection | TXT rejected with an explanation; no file written to the reader |
| iOS manual native checks | Connection, folder browsing, all book icons, XTCH actions and three-format picker uploads verified |
| iOS Maestro regression suite | Blocked before app test commands by XCTest accessibility startup failures |
| TypeScript | Same 112 existing errors, with no added diagnostic locations |
| External visual judge | Not run; captured screenshots reviewed locally |

The native builds include the current JavaScript bundle. Android uses the project's Pixel 7 / API 36 emulator. iOS uses an isolated iPhone 16 Pro simulator on iOS 18.4, built with Xcode 26.6. Both connect to an isolated copy of the disk-backed mock reader running firmware 1.3.0. The EPUB/XTC/XTCH fixtures are the repository's legal Gettysburg Address samples.

All six native uploads were downloaded from the mock and compared with the original bytes: EPUB 257,389 bytes, XTC 2,546,518 bytes, and XTCH 5,090,518 bytes on each platform. [Byte counts and SHA-256 verification](videos/2026-11-03/native-upload-verification.json) are preserved alongside the videos.

## Annotated review videos

The recordings show actual native app and picker interactions. Captions identify the case and expected result. Android clips are passing Maestro executions played at 1.5x speed. iOS clips are explicitly labeled manual UI checks; idle pauses are shortened. Clearly labeled final test screenshots hold the completed upload state for inspection. Raw recordings and per-case artifacts remain under `test-screenshots/videos/pre-pr-20261103/`.

| Video | Duration | Case starting points |
| --- | --- | --- |
| [Android review](videos/2026-11-03/android-review.mp4) | 61.8 seconds | 0:00 formats and XTCH actions; 0:11 native picker/uploads; 0:47 unsupported file rejection |
| [iOS review](videos/2026-11-03/ios-review.mp4) | 34.5 seconds | 0:00 formats and XTCH actions; 0:05 native picker/uploads |

Both MP4 files include embedded chapters and were decoded successfully for verification. All 16 Android regression captures were reviewed locally for content, icons, theme, navigation, and dialogs. The iOS format list, action sheet, selected documents, and completed upload list were also inspected directly. No reference screenshots were changed.

## Environment failures and remaining limits

The first Android run encountered a system-level Pixel Launcher “isn't responding” dialog. The app was running behind it without a React Native or AndroidRuntime fatal error. After choosing Wait, eight flows passed; the eight earlier blocked flows passed on a targeted retry. Both original and retry artifacts are retained. The merged passing reports and captures are under `test-screenshots/android/pre-pr-5934b64-20261103-verified/`.

iOS Maestro 2.10 and the separately installed, checksum-verified official 2.12.1 driver both failed during XCTest initialization with `Failed call to AXDisableAccessibilityOnTermination: kAXErrorCannotComplete`. Restarting the isolated simulator's test-manager/accessibility services and attaching a dedicated Simulator window did not establish a working XCTest session. No iOS Maestro flows are counted as passed in this run. Checksum-verified Meta idb 1.7.8 direct touch input enabled the separate manual checks and recordings without changing application code or bypassing the native document picker.

The Anthropic visual judge was not invoked because the earlier approval review requires explicit authorization to export screenshots; local visual review was used. Physical-reader rendering and native sharing of XTC/XTCH from other apps remain outside this picker-focused validation. Existing native share registrations still target EPUB.

Native build and test logs are stored under `.local/pre-pr-20261103-*.log`. The iOS startup attempts are retained under `test-screenshots/ios/pre-pr-5934b64-20261103*`. The pull request should remain in draft until its outstanding iOS automation validation is resolved or explicitly accepted by the reviewer.
