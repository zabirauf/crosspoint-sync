## Visual Test Results — ios / iPhone 16 Pro / light

| # | Test | Verdict | Confidence | Notes |
|---|------|---------|------------|-------|
| 1 | App Launch - Initial State | ❌ Fail | 82% | Tab bar (Library and Settings tabs) is visible in the reference but missing in the test screenshot |
| 2 | Connection Sheet - Idle | ✅ Pass | 97% | System clock shows 23:03 in test vs 20:18 in reference (expected dynamic content) |
| 3 | FAB Menu - Open | ✅ Pass | 92% | System clock differs: 20:17 (reference) vs 23:03 (test) — expected dynamic content |
| 4 | File Action Sheet | ⚠️ Warning | 0% | Reference screenshot missing — needs baseline capture |
| 5 | Library - Connected with Files | ✅ Pass | 92% | Clock time differs: 22:13 (reference) vs 23:00 (test) — expected dynamic content change |
| 6 | Library - Disconnected Empty State | ✅ Pass | 95% | Status bar time differs: '20:17' in reference vs '23:03' in test (expected dynamic content, ignored) |
| 7 | Move Sheet - New Folder Dialog | ⚠️ Warning | 0% | Reference screenshot missing — needs baseline capture |
| 8 | Move Sheet | ⚠️ Warning | 0% | Reference screenshot missing — needs baseline capture |
| 9 | Rename Dialog | ⚠️ Warning | 0% | Reference screenshot missing — needs baseline capture |
| 10 | Settings Screen | ⚠️ Warning | 82% | Timestamp differs: reference shows 20:17, test shows 23:01 (expected dynamic content) |
| 11 | Upload Queue Sheet | ⚠️ Warning | 0% | Test screenshot missing |

**Summary: 4/11 passed, 1 failed, 6 warnings, 1 skipped**

<details>
<summary>❌ App Launch - Initial State — Details</summary>

**Criteria:**
- layout: ✅ All major elements are positioned correctly. The header, central empty state (plug icon, title, subtitle, Connect button), FAB button, and debug banner are all in the same positions. Minor vertical shift in the plug icon is negligible.
- content: ✅ All text content matches: 'Library' title, 'Connect' pill, 'No Device Connected', subtitle text, 'Connect' button, and 'Open debugger to view warnings.' banner are all identical.
- visual_state: ✅ Colors, icon styles, button states, and enabled/disabled states all match between reference and test screenshots.
- elements: ❌ The tab bar (Library and Settings tabs) visible at the bottom in the reference is NOT visible in the test screenshot. The test screenshot shows a home indicator bar instead, suggesting the tab bar may be hidden or scrolled out of view.
- defects: ✅ No text truncation, overlapping elements, or rendering artifacts detected.

**Assertion results:**
2. ✅ "The Library tab title is visible in the header" — *The 'Library' title is clearly visible in the navigation header in both the reference and test screenshots.*
3. ✅ "The connection pill in the header shows 'Connect' text" — *The connection pill with a gray dot and 'Connect ▾' text is present in the top-right of the header in both screenshots.*
4. ❌ "The tab bar shows Library and Settings tabs" — *In the reference screenshot, a tab bar with Library and Settings tabs is visible at the bottom. In the test screenshot, the tab bar is not visible — only a home indicator (swipe bar) is shown at the very bottom, suggesting the tab bar is missing or hidden.*
5. ✅ "No loading spinners or crash dialogs are visible" — *Neither screenshot shows any loading spinners or crash dialogs. The UI is in a clean empty/disconnected state.*

**Summary:** The test screenshot largely matches the reference with correct layout, content, and visual states for the main UI elements. However, one meaningful regression is detected: the tab bar (showing Library and Settings tabs) visible at the bottom of the reference screenshot is absent in the test screenshot. Instead, only an iOS home indicator bar is shown. This suggests the tab bar may be hidden, clipped, or not rendered in the test build. All other elements — the Library header, Connect pill, plug icon, empty state text, Connect button, FAB (+), and debug warning banner — are present and correct.

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/app-launch.png) | ![test](test-screenshots/screenshots/app-launch.png) |

</details>

<details>
<summary>⚠️ File Action Sheet — Details</summary>

**Summary:** No reference screenshot found at test-references/ios/iphone-16-pro/light/file-action-sheet.png

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/file-action-sheet.png) | ![test](test-screenshots/screenshots/file-action-sheet.png) |

</details>

<details>
<summary>⚠️ Move Sheet - New Folder Dialog — Details</summary>

**Summary:** No reference screenshot found at test-references/ios/iphone-16-pro/light/move-new-folder.png

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/move-new-folder.png) | ![test](test-screenshots/screenshots/move-new-folder.png) |

</details>

<details>
<summary>⚠️ Move Sheet — Details</summary>

**Summary:** No reference screenshot found at test-references/ios/iphone-16-pro/light/move-sheet.png

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/move-sheet.png) | ![test](test-screenshots/screenshots/move-sheet.png) |

</details>

<details>
<summary>⚠️ Rename Dialog — Details</summary>

**Summary:** No reference screenshot found at test-references/ios/iphone-16-pro/light/rename-dialog.png

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/rename-dialog.png) | ![test](test-screenshots/screenshots/rename-dialog.png) |

</details>

<details>
<summary>⚠️ Settings Screen — Details</summary>

**Criteria:**
- layout: ✅ Overall layout is consistent between reference and test. All sections (Sync Settings, Web Clipper, Device, Debug) are present and positioned correctly. Spacing and alignment appear consistent.
- content: ✅ All text labels match: 'Upload path', 'Clip upload path', 'Enable in Safari', 'Device', 'IP Address', 'Firmware', 'Forget Device', 'Debug'. Values shown (/, /Articles, Not connected, localhost:8082, N/A) are consistent. The test screenshot additionally shows a 'Debug Logging' toggle partially visible at the bottom, which is expected content.
- visual_state: ✅ Colors, icons, and states are consistent. The 'Forget Device' button retains its pink background with red text. The Settings tab icon is highlighted in blue in both. The Debug Logging toggle is visible (off state) in the test screenshot.
- elements: ✅ All expected elements are present. The test screenshot shows a 'Debug Logging' toggle partially visible at the bottom of the screen, which is part of the Debug section. The reference cuts off before showing this element. The 'View Logs' row is not visible in either screenshot (both cut off the Debug section).
- defects: ✅ No text truncation, overlapping elements, or rendering artifacts detected. The home indicator bar is visible at the bottom of the test screenshot, which is a minor platform/device difference.

**Assertion results:**
2. ✅ "The Settings title is visible in the header" — *The 'Settings' title is clearly visible in the navigation bar header in both the reference and test screenshots.*
3. ✅ "'Upload path' row is visible with a path value" — *The 'Upload path' row is visible in the Sync Settings section with the value '/' shown on the right side in both screenshots.*
4. ✅ "'Clip upload path' row is visible with a path value" — *The 'Clip upload path' row is visible in the Web Clipper section with the value '/Articles' shown on the right side in both screenshots.*
5. ✅ "'Enable in Safari' row is visible in the Web Clipper section (iOS only)" — *The 'Enable in Safari' row is visible in the Web Clipper section in both screenshots, showing 'Safari → Extensions >' as the value.*
6. ✅ "'Debug Logging' toggle is visible" — *The 'Debug Logging' toggle is partially visible at the bottom of the test screenshot in the Debug section. It is not visible in the reference screenshot as the page is scrolled slightly differently, but the toggle is present in the test.*
7. ✅ "A 'Device' section shows device, IP address, and firmware rows" — *The Device section is fully visible in both screenshots with all three rows: Device (Not connected), IP Address (localhost:8082), and Firmware (N/A).*
8. ✅ "Sections are visually grouped with headers" — *All sections (Sync Settings, Web Clipper, Device, Debug) have bold section headers and are visually separated with dividers, consistent between reference and test.*
9. ❌ "'View Logs' row is visible" — *The 'View Logs' row is not visible in either the reference or test screenshot. Both screenshots cut off the Debug section before showing this row. This is likely a scroll position issue rather than a missing element, but it cannot be confirmed as visible.*

**Summary:** The test screenshot closely matches the reference with no meaningful regressions. The overall layout, content, visual states, and elements are consistent. The primary difference is that the test screenshot shows slightly more of the Debug section (the 'Debug Logging' toggle is partially visible at the bottom), while the reference cuts off just at the Debug section header. The 'View Logs' row is not visible in either screenshot due to scroll position. The timestamp difference (20:17 vs 23:01) is expected dynamic content. A home indicator bar is visible at the bottom of the test screenshot, which is a minor device-level difference. All settings rows correctly display their current values.

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/settings-main.png) | ![test](test-screenshots/screenshots/settings-main.png) |

</details>

<details>
<summary>⚠️ Upload Queue Sheet — Details</summary>

**Summary:** Test screenshot not found: test-screenshots/screenshots/upload-queue-active.png

| Reference | Test |
|-----------|------|
| ![ref](test-references/ios/iphone-16-pro/light/upload-queue-active.png) | ![test](test-screenshots/screenshots/upload-queue-active.png) |

</details>

---
*Generated by visual-judge.ts | 2026-03-04T07:07:22.289Z | Git: unknown on unknown | LLM calls: 6*
