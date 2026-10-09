# Full test run — October 7–8, 2026

Tested branch `codex/pr-21-book-formats`, application commit `0171a4e`, plus the visual-runner fixes recorded below. Both native builds use Release configuration with the current JavaScript bundle. The mock reader reports firmware 1.3.0 and serves the legal EPUB/XTC/XTCH fixtures.

| Check | Result |
| --- | --- |
| EPUB unit tests | 14/14 pass |
| EPUB network integration | 1/1 pass |
| Delete protocol contracts | 10/10 pass |
| Book formats, capabilities, stores, queue, HTTP and WebSocket integration | 13/13 reported tests pass |
| Production Metro exports | iOS and Android pass |
| Android Release APK | Build passes |
| iOS Release simulator app and native extensions | Build passes |
| Android UI suite, Pixel 7 / API 36 | 16/16 flows pass |
| Android native document picker and uploads | EPUB, XTC, XTCH selectable; all three uploaded and downloaded byte-for-byte correctly |
| iOS UI suite, iPhone 17 Pro / iOS 26.5 | 16/16 flows pass; dark-mode screenshot needed separate verification after simulator reboot |
| iOS native document picker and uploads | Picker opens and lists all three fixtures; extra upload check incomplete because of simulator file-provider and XCTest accessibility failures |
| TypeScript | 112 existing errors; none in the changed application implementation or book tests |
| Anthropic visual judge | Blocked by automatic approval review; no API credential configured |

## UI coverage and artifacts

The 16 UI flows cover cold launch, disconnected library, connection sheet, connected library, all book formats and the XTCH action sheet, folder navigation, upload menu, settings and editing, FAB menus, dark mode, file actions, rename, move, and the new-folder dialog. The `appstore` flow is a marketing-capture utility and is excluded from the test suite.

Android results and all 16 named captures are preserved under `test-screenshots/android/full-0171a4e-20261007-retry/`. Its `results.xml` and `summary.json` record every flow. All screenshots were inspected directly for missing content, overlap, theme and file icons, dialog controls, and navigation state. The real native-picker check is preserved under `test-screenshots/android/native-picker-upload-20261007/`. Uploaded sizes were 257,389 bytes (EPUB), 2,546,518 bytes (XTC), and 5,090,518 bytes (XTCH), with exact fixture-byte comparisons.

The native iOS run is under `test-screenshots/ios/full-0171a4e-20261007-fresh/` on the isolated `CrossPoint Sync Tests` simulator (`9D68CE9C-941B-4573-A622-48268C99691C`). Its native JUnit report records 16 tests, zero failures, and 639.473 seconds. All 16 captures were inspected locally. The book-format list and XTCH action sheet have the expected filenames, icons, sizes, and actions. Native build, test, integration, bundle, and type-check logs are kept under `.local/all-tests-*.log`.

The extra iOS picker artifacts are under `test-screenshots/ios/native-picker-*-20261008/`. The real picker opened and browsed to EPUB, XTC, and XTCH fixtures. Files seeded directly into the simulator's File Provider Storage appeared but did not open when tapped. An alternative seed in the test app's Documents directory could not be exercised: subsequent XCTest startup repeatedly failed with accessibility errors. This extra check is incomplete; there is no successful native iOS upload byte comparison to report. The automated book tests separately exercise the real picker hook, firmware checks, stores, queue, and mock HTTP/WebSocket byte round trips.

## Failures and fixes during testing

Android initially displayed a system-level “System UI isn't responding” dialog, hiding the app's accessibility controls. Clearing that emulator interruption and rerunning produced 16 passing flows. The actual app loaded and connected throughout; no app crash was found in its runtime log.

The original generic Maestro command targeted `.maestro/flows/`, bypassing the parent workspace configuration and allowing connected tests to execute before device setup. The runner now targets `.maestro/` with explicit flow discovery and retains the configured order. It also isolates run artifacts and collects Maestro 2.10 `takeScreenshot/` captures into a flat `screenshots/` directory for the judge. The Android runner strips workspace-only glob configuration from each per-file session and uses the same collector. Native artifacts remain intact. The first Android run's report collection was interrupted while the script was being edited; its 16 per-flow passing reports were retained and aggregated separately. Subsequent native-picker runs exercised the corrected collector and report aggregation successfully.

The existing iOS simulator's XCTest driver disconnected during hierarchy queries and subsequently timed out waiting for an accessibility-loaded notification. Rebooting and opening Simulator did not resolve startup reliably. A fresh isolated simulator successfully initialized XCTest and completed all 16 flows. After a later reboot for appearance verification, additional XCTest sessions failed with “Timed out waiting for AX loaded notification” and “Failed call to AXDisableAccessibilityOnTermination: kAXErrorCannotComplete.” These failures occurred before the extra test commands ran.

Local review caught a false positive in the original iOS dark-mode capture: `setDarkMode` and `assertDarkMode` passed, but the screenshot was light. The existing iOS reference for that capture is also light. `simctl ui ... appearance` reported dark while both this app and Apple Settings still rendered light. Rebooting the isolated simulator in dark mode produced the expected dark app UI, verified directly in `.local/ios-dark-after-reboot.png`. No application theme code or reference screenshot was changed. The original full-run capture remains intact as evidence. The system-appearance assertion alone is insufficient for visual theme verification on this runtime; screenshots must also be reviewed. A post-reboot rerun of the dark-mode flow was blocked by the XCTest startup error above.

Automatic approval review rejected invoking the Anthropic visual judge because it can export captured app screenshots to an external API without explicit authorization. No images were sent by that command, and no alternative route was used. Screenshots remain local and receive direct visual review. Running that specific automated judge requires explicit authorization for the export and a locally configured `ANTHROPIC_API_KEY`.

## Reproduction

Start `npm run mock-device`, install the current Release app, and boot the target simulator/emulator. Run `npm run test:basic`, `npm run test:epub:integration`, `npm run check:bundles`, and `npm run typecheck` through `scripts/with-dev-env.sh` when Node is not on PATH.

For Android use `npm run test:visual:android`. For iOS use `npm run test:visual:flows -- --platform ios --device <simulator-UDID>`. Set `CROSSPOINT_VISUAL_OUTPUT` to choose an isolated artifact directory. The generic runner updates `test-screenshots/latest` for `npm run test:visual:judge`.

These checks use emulators, a simulator, and a mock reader. They do not validate physical-reader rendering or third-party firmware forks.
