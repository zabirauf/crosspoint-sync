# iPhone Duo design and experience review — November 4, 2026

Native Duo simulator review is now complete using **Xcode 27.2 (27B52), the iOS Simulator 27.2 SDK (24B8118), and the iPhone Duo simulator running iOS 27.1 (24A94425)**. The implementation addresses the prioritized findings, including the initial crop safe-area failure found during native review. Outer/inner/partial-fold layouts, retained list position and drafts, keyboard reachability, crop continuity, and an actual native upload through the local mock transport have been checked. Browser, native phone and tablet results are also recorded in [the validation report](adaptive-layout-validation-2026-11-04.md).

The reviewed native recording is [iphone-duo-native-demo.mp4](videos/2026-11-04/iphone-duo-native-demo.mp4), with toolchain/device provenance in its [metadata](videos/2026-11-04/iphone-duo-native-demo.json). All reader/network fixtures were local. **Physical iPhone Duo hardware and transfer to a physical reader remain untested.** Universal-link association and every background lifecycle case are not claimed as covered.

The initial review inspected the `cf3ab7a` main baseline, Library/Settings/navigation, task sheets, the crop editor and approved iPhone screenshots. It began as a source/screenshot review; subsequent sections record the completed native simulator work and independent visual checks. The baseline findings and intermediate pending states below are historical. The final sections supersede those states.

## Recommended experience

Keep Library recognizable when the device opens: the same folder, same list position, same selected file, same upload progress. Use the additional width for a quiet connection/transfer context region or a bounded reading column. On the outer display, keep the primary actions reachable and allow content to scroll. Let the OS handle the physical fold transition while the app reflows its existing views.

## Original baseline findings — historical

| Priority | Finding and evidence | Recommended change | Acceptance check |
| --- | --- | --- | --- |
| P1 | The sleep crop frame uses `screenH - 180` and hardcoded top padding. Pan is retained in display points while the frame and fit scale change, which can change the selected source crop after a resize. `app/sleep-preview.tsx:39,74,190`. | Measure the actual safe-area crop canvas. Preserve the crop center and zoom in source-image or normalized coordinates, then derive display translations after resizing. Fit the 3:5 frame to both available dimensions. | Pan and zoom off-center, open/close or rotate, and confirm the exported crop covers the same source region. Cancel and Done remain reachable at short heights. |
| P1 | Screen content and absolute FAB/menu offsets do not account for lateral safe areas. This is particularly relevant when system controls occupy a side. `app/(tabs)/index.tsx`, `components/ActionFAB.tsx:122,138`. | Apply current safe-area edges at the content/presentation boundary, without adding header/tab insets twice. Anchor menus and FAB within that safe region. | All controls and text clear left/right system regions and rounded corners in either wide pose; upload bar and FAB never overlap. |
| P1 | Settings uses two unconstrained horizontal groups. The approved `settings-main.png` already shows Firmware and N/A colliding; long hostnames, paths and larger text have additional risk. `app/(tabs)/settings.tsx:11`. | Constrain label/value widths with `flex`, `minWidth: 0`, a real gap, and wrapping or truncation. Stack label/value when the available width or font size requires it. | Long upload paths, hostnames and accessibility text sizes remain readable on a narrow outer window and in a bounded inner column. |
| P1 | Connection, queue, file actions and move tasks use full-width percentage-height sheets. The 45% action sheet is especially short in a wide/short window, while all sheets become excessively wide on the inner screen. `ConnectionSheet:43`, `UploadQueueSheet:36`, `FileActionSheet:80`, `MoveFileSheet:144`. | Use a shared adaptive presentation: bounded width on expanded windows; height limited to the available safe viewport; scrollable content and explicit close action. Keep the same content tree and drafts when the presentation resizes. Respect keyboard space for address, rename and folder input. | Open each sheet, resize in both directions, and continue the task. No blank body, clipped footer, lost typed address/folder name, or dismissal solely because of resizing. |
| P2 | The inner layout is currently a stretched phone list and stretched Settings rows. The extra space does not help the user. | Keep the Library list stable and use a modest side region for reader identity/connection and transfer context when sufficient width remains. Bound Settings to a readable width; grouping sections as cards can help at wider widths. Avoid a grid of filenames, which harms scanning and encourages list remounts. | Inner screen looks intentionally composed, with manageable eye travel. Compact and expanded layouts retain the same navigation and action names. |
| P2 | Swipe-back commits against window width even if Library becomes a narrower content pane. It also keeps its in-flight translation through a size change. `components/SwipeBackGesture.tsx:38,70`. | Measure the gesture host width and cancel/reset the visual translation on size changes; do not navigate as a consequence of resizing. | Begin an edge swipe, resize, then release: no stuck translated page or unexpected folder navigation. |
| P2 | Portrait-only configuration limits usable poses. `app.json:6`. | Allow supported orientations and base layouts on the current available space. Test short windows as well as wider ones. | Library, Settings, sheets and crop editor remain usable in compact landscape and wide/short inner layouts. |
| P2 | Connection pill and icon-only menu actions have small visual targets; several controls lack accessibility names and some lack testIDs. | Provide at least 44-point touch targets, descriptive accessibility labels/roles, and the existing `ScreenName.ElementName` testID convention. Keep connected/connecting status conveyed by text as well as color. | VoiceOver names the connect, close, more-actions, crop and upload controls; touch targets remain easy to hit with either hand. |
| P3 | “Empty Folder” says to long-press to create a folder, but the visible interaction is the + menu. | Say “Tap + to add files or create a folder.” | Empty state accurately describes the available action. |

## Transition checks that matter

1. Browse into a nested folder and scroll; compact → expanded → compact keeps the folder and visible list context.
2. Open a rename/address/folder input, type a draft, resize with the keyboard visible, and submit it successfully.
3. Open file actions or Move; resize and complete the action on the same file and destination.
4. Start an upload, resize repeatedly, and verify the active job/progress continues without duplicate queue entries or a reconnect triggered by layout alone.
5. Open the FAB menu near each edge, resize, and verify every action remains within the safe viewport.
6. Adjust an off-center image crop, resize, and compare the source crop before/after.
7. Repeat at larger text sizes, in light/dark appearance, and with long filenames and paths.

## Initial platform validation boundary — historical

Xcode 26.6 was available when this review started. Apple's SDK-dependent Duo presentation guidance made a newer native toolchain necessary to validate folding, side system bars, keyboard and safe areas. That simulator/toolchain prerequisite was subsequently completed; the native results are recorded below. Physical-hardware checks remain outside the completed scope.

Primary guidance: [Prepare your app for iPhone Duo](https://developer.apple.com/iphone-duo/prepare/), [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).

## Implementation follow-up — foldable iPhone and tablets

Reviewed the working implementation diff and the final browser screenshots in `test-screenshots/responsive/2026-11-04T18-58-24-434Z/`, including the 890×626 inner window, 1194×834 tablet, 375×834 split window, outer return, rename draft, crop layouts, and short landscape Settings/menu. The user subsequently confirmed the foldable iPhone target and requested tablet improvements as well.

The implementation addresses the main baseline findings: a stable native modal tree with modal-local safe-area context; bounded expanded presentations; a measured crop canvas with normalized pan; readable Settings bounds and stacked narrow values; a reader/upload context panel; larger actions; and measured swipe-back width. The inner Library screenshot retains about 590 points for the file list beside the 212-point context panel and 88-point rail. The tablet layout uses its space intentionally, and Settings remains readable instead of spanning the full tablet. React Navigation's screens container has a stable key when moving the tab bar from bottom to right, which supports continuity.

No new high-priority source-level continuity defect was identified in this follow-up. The concerns raised during review have been resolved:

- **Short FAB menu resolved:** The menu now receives measured pane height, clamps its position/maximum height, and scrolls its actions. The final 700×320 screenshot includes the raised FAB and failed-upload status; the menu remains inside the viewport. In this extreme shape the remaining actions are reached by scrolling the menu.
- **Long Settings draft verified:** The browser suite now waits for input focus and modal dismissal and checks the complete saved path. The final split-window screenshot shows the full long path wrapped beneath its label; the short landscape screenshot also shows the full value without collision.
- **List and input continuity checked:** The expanded browser suite supplies 30 additional file rows and checks that a 500-point list offset survives every tested size. It also retains the same input element and rename draft. The implementing agent reported this final suite passed, and the corresponding assertions were inspected during review.
- **Crop layout checked:** Final crop screenshots fit the same 3:5 frame inside outer, inner, tablet and short windows. Source offsets are normalized, and the pan implementation now accumulates gesture deltas in normalized coordinates. Crop geometry checks cover retention of the source region across canvas shapes.
- **Native orientation configuration verified:** The generated `ios/CrossPointSync/Info.plist` includes both landscape orientations for phone and iPad. The implementing agent also reported manually checking the iPad presentation; that observation was not performed independently by this reviewer.

At the browser-only stage, native Duo system bars/safe areas, keyboard focus during folds and SDK 27.1 presentation were still unverified. Native simulator checks later closed that toolchain gap, as recorded below. Browser results alone were never treated as evidence of those native behaviors.

The baseline findings above describe the original code; they should not be read as a list of still-unfixed implementation defects.


## Native keyboard follow-up

Native visual review by the implementing agent found that a short landscape window could keep the action buttons visible while clipping the active text field. The prompt now scrolls its focused field into view when its body changes size, with focus tracked through events shared by native and browser inputs. The native recheck showed the complete retained draft and both actions above the software keyboard. This finding was caught by screenshot review after accessibility-only assertions passed; the adaptive visual spec now explicitly checks that input text is not clipped.

## Native Duo prerequisites and focused review plan — historical staging

At this staging point, the implementing agent had verified macOS 27.2 and a registered iOS 27.1 simulator runtime while Xcode 27.2 was downloading. This section records the source review and plan prepared before any Duo build/launch/fold result was available. Later sections record completion of that work.

Apple requires the scene-based lifecycle for applications linked with the latest iOS 27 SDKs. The generated Expo SDK 54 entry point currently creates an application-owned window without a scene manifest. This is a native prerequisite, separate from the responsive JavaScript layouts. Source: [Transitioning to the UIKit scene-based lifecycle](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle), [iOS and iPadOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes).

The staged `plugins/withSceneLifecycle.js` was reviewed before registration/application. Its revised design retains Expo's original factory/root startup before `super.application(...didFinishLaunching...)`, then adopts that same window into a single `UIWindowScene`. This preserves the preparation order required by the installed Debug dev-launcher subscriber; an earlier variant that deferred all startup to scene connection would have broken that order. The current variant forwards scene URLs, user activities, and lifecycle callbacks through the existing Expo app delegate. No additional confirmed source-level blocker was found in the revised variant. Native launch, links, and reconnection still require verification.

Before interpreting new screenshots, record the actual Xcode/SDK version, Duo device type and runtime, and build/install provenance. Capture the baseline launch result before applying the scene migration so any assertion is attributable. Verify a Debug/dev-client build as well as the intended production startup path. The generated iOS directory is ignored, so required native changes must remain reproducible through the config plugin.

| Native check | Visual and continuity acceptance criteria |
| --- | --- |
| Outer and inner Library, both rotations | Header connection pill, custom tab rail, FAB and upload bar clear the system/status region. No cropped icon, double safe-area gutter or large unused compatibility box. |
| Fold without rotation, nested folder and scrolled list | Same folder and visible list context; custom rail/layout responds to the changed window. No page reload, duplicate reader connection or stuck gesture translation. This also checks that React Native window metrics receive fold-only resize events. |
| Open file actions, rename, address and Move while folding | Same selected file/destination and typed draft; no task dismissal or replacement of the input solely because the window resized. |
| Modal and keyboard on both displays | Complete active input text, close/cancel and primary action remain visible/reachable. Scrolling brings the focused field into view when the usable height shrinks. The expanded surface remains bounded and inside every safe edge. |
| Crop preview through folds and rotations | Cancel/Done and instructions clear all four safe edges. The same off-center source crop and zoom remain selected; no wrong-scale or blank-frame flash persists. |
| Settings and tablet/split view | Long paths/hostnames and larger text remain readable; values do not collide with labels. Root content clears the native navigation/system bars. |
| Debug Logs on inner display | Native-stack header actions remain individually reachable if the SDK places native bars vertically. Log text does not extend behind that bar or the side status area. Its horizontal custom header-right group and unwrapped content deserve direct inspection. |
| Cold/warm links and returning from background | URL/universal-link targets reach the same application tree; return to foreground imports shared content once and resumes the expected connection state. Fold/unfold alone does not recreate the React tree. |

The installed React Native metrics implementation reads the current key window's bounds and observes its frame, so dependency `UIScreen` references are not by themselves proof of a layout defect. Watch the first fold-only resize for a possible early-initialization timing issue: its frame observer captures the key window when the native module initializes. Change dependency behavior only if the native test demonstrates stale metrics or another concrete failure.

## First native Duo screenshot review

The implementing agent reports a successful iOS 27.2 Release build, native launch and successful touch interaction opening the connection form. Independently reviewed `.local/duo-native-checks/launch-settled.png`, `connection-outer.png`, and the settled expanded capture `physical-portrait-settled.png` (2853×2007 pixels).

The outer Library and connection form clear the right-side system region. The form's title, connection status, close action, address and Connect button are readable without visible collision. In the settled expanded image, the reader context panel and right navigation rail appear as intended. Context copy and buttons fit; the main pane has comfortable reading width; the FAB remains inside that pane; and the navigation rail is separated from the right system/status strip. No clipped control, overlapping text, or compatibility-box presentation was found in these captures.

The earliest inner captures were taken before scene/orientation transitions settled and contained transformed AX frames. They do not establish a persistent orientation or stale-metrics defect. The implementing agent subsequently waited for UI quiet after a physical-orientation command, producing the correctly expanded capture above. There is no observed reason to modify React Native's metrics implementation.

This review closes the basic native launch/outer-layout/expanded-layout screenshot questions only. Connected file lists, keyboard and task continuity, crop transitions, links and native lifecycle behavior remain pending their respective native checks and captures. The earlier prerequisite/plan sections are chronological records, not claims that these later observations were already available at that stage.

## Native connected-list, action and keyboard continuity review

Independently inspected these native captures under `.local/duo-native-checks/`: `list-outer-before.png`, `list-inner.png`, `list-return.png`, `actions-inner.png`, `actions-outer.png`, `rename-outer.png`, `rename-inner.png`, `rename-partial.png`, and `rename-return.png`.

- The connected outer list before and after returning to the outer display shows the same reading-list rows at the same visible position. The inner layout uses its added width while preserving the recognizable folder/list structure. Text, more-actions targets and the FAB remain within the content region.
- File actions remain open and readable on outer and inner displays. The selected filename, all four actions and close button fit inside their respective safe areas.
- The exact draft `Duo reading draft.epub` and active caret are visible in the outer, inner, partially folded and outer-return screenshots. Complete input text, Cancel and Rename remain above both the regular and split software keyboards. No clipped text field, lost draft, or control overlapping the system/status region was found.

The implementing agent reports retaining the same app PID throughout the native `0° → 180° → 90° → 0°` hinge sequence and measuring the `Reading list 15.epub` anchor at exactly `147.6667 pt` before and after returning. Those measurements were reported by that agent; this reviewer independently checked their corresponding screenshot presentation. No application source change was required by the reviewed native fold captures.

The native Maestro run initially passed **16 of 17 flows**. The final flow's text-entry step tapped the middle of a filename, leaving the caret before `.epub`; its erase then retained the old extension. The implementing agent corrected the flow to tap near the text's end and assert the complete draft before rotation. That corrected final flow passed in a separate targeted run. This is **not** a claim of one uninterrupted clean 17-of-17 run.

Additional results reported by the implementing agent: Debug launch, warm and cold dev-client URLs, folding while Settings is open, and iPad Release launch/Settings/prompt checks passed. These do not establish that universal-link association or every background lifecycle case has been tested. Move, crop and active-upload fold checks remain pending at this review stage.

## Native Move and crop follow-up

Reviewed `rename-outer-landscape.png`, `move-draft-outer.png`, `move-draft-inner.png`, and `move-draft-return.png` under `.local/duo-native-checks/`. The landscape rename input is fully readable, with both actions above the keyboard. Move retains the `/Articles` destination and `Reading drafts` text on outer, inner and outer-return views; its input, Create and Move Here controls remain visible above the keyboard. No new Move/rename layout defect was found.

Reviewed `crop-outer.png`, `crop-inner.png`, `crop-partial.png`, `crop-return.png` and `crop-pixel-comparison.json`. The off-center crop's distinctive image features remain consistent through the poses. The saved normalized-image comparison records mean absolute pixel differences of approximately `0.0496` for inner/partial and `0.1733` for return, on the 0–255 channel scale. Those image comparisons support crop-content continuity; they do not establish header/control reachability.

One initial crop-presentation issue was raised and subsequently reproduced after a clean native launch and a five-second wait. The unsafe initial capture, now preserved as `crop-initial-safearea-repro.png`, does not visibly show Done; its AX record places Done at `x=383.67…448 pt`, entirely inside the known outer right-side system region (`382…466 pt`). Its canvas is 466 points wide. By contrast, the return capture correctly placed Done at `x=299.67…364 pt` with a 382-point canvas. This was an actual initial full-screen-modal inset failure, not an animation-timing artifact. It has now been fixed and rechecked as described below.

The native preview remains colored because the existing React Native iOS filter does not apply the requested grayscale/contrast. The exporter separately converts the output to grayscale. The proposed label `Grayscale output` accurately clarifies that distinction and is a suitable minimal copy improvement; a preview conversion implementation is separate work. Active-upload continuity remains pending at this stage.

## Initial crop safe-area fix verified

Reviewed the final local-provider change in `app/sleep-preview.tsx`, `.local/duo-native-checks/crop-initial-safearea-fixed.png` and its AX JSON, `.maestro/manual-flows/sleep-preview-safe-area.yaml`, and `.local/duo-crop-initial-safearea.log`.

The crop screen now creates its own `SafeAreaProvider` around the complete full-screen view, so its first native presentation receives local modal insets without replacing the task tree during later resizing. The new initial screenshot clearly shows Done to the left of the system strip, and the AX record confirms its `x=299.67…364 pt` frame and the 382-point canvas **before any fold**. The source/output subtitle now says `Grayscale output` and remains readable.

The standalone Maestro check ran on the native Duo simulator, asserted the frame/Cancel/Done/output text, actually tapped Done, and verified the crop screen closed and the Library file list returned. All those steps passed in the inspected log. The initial safe-area finding is therefore **resolved**; it is not supported merely by an accessibility-visible assertion. A new Release build succeeded according to the implementing agent. Post-fix all-pose crop continuity and active-upload checks are still running at this review stage, so the earlier pixel comparison must not be presented as their post-fix result.

## Final post-fix crop and native upload review

Independently reviewed the replaced post-fix `crop-{outer,inner,partial,return}.png` captures and the final crop result files. Cancel/Done, the crop frame, subtitle and gesture instructions remain inside the usable area in each pose, including the initial outer presentation. The same off-center image selection remains visible through `0° → 180° → 90° → 0°`. The **post-fix** normalized pixel comparisons are approximately `0.1700` mean absolute channel difference for inner/partial and `0` for the outer return on the 0–255 scale. `crop-check-result.json` records a passed off-center-pan check; this fixture-only crop check did not submit an upload. It supersedes the earlier pre-fix continuity comparison.

Also reviewed `upload-inner.png`, `upload-partial.png`, `upload-outer-return.png`, `upload-completed.png`, and `upload-check-result.json`. The upload filename, destination, progress, Cancel/Add Books controls and close action remain readable and clear of the system region on both displays. Progress increases from **23% → 34% → 44%** through inner, partial and outer-return captures; the completion capture shows **1 completed** and an empty active queue.

The inspected result records `passed: true`, the same native app PID (`30851`), one upload start, and **17,719,257 bytes** transferred with source/destination SHA-256 `0b7510d92c5694e7f1675a4676b9429d133d11087b06c4ea4def4d5cdb40b039`. The pending job was seeded in the dedicated simulator's test store; the existing application then performed actual native file reads and a WebSocket transfer through a local throttled proxy. This validates upload continuity through folds using the native simulator and mock transport; it does not claim transfer to a physical reader or exercise the picker setup in that particular check.

The implementing agent reports that an initial test-proxy delay of 150 ms per 4 KiB frame exceeded the upload timeout. Reducing that test-harness delay to 10 ms produced the verified run above. No uploader source change was needed. The shared browser layout matrix and all four adaptive checks also passed after the crop fix, according to the implementing agent. No new experience defect was found in these final crop/upload captures. Debug Logs and recording review followed, as recorded next; the earlier accurate Maestro run history remains unchanged.

## Final native recording and Debug Logs review

Reviewed representative encoded recording frames at 2, 12, 24, 36, 50 and 68 seconds under `.local/duo-native-demo/`. Captions are readable and distinguish the native iPhone Duo simulator and local sample reader. The sampled Library, upload queue, rename/keyboard, partial-fold and crop views remain readable without presentation clipping; the ending frame returns to a complete outer Library view. The delivered H.264 recording is 1440×1080 and 69.9 seconds, approximately 2.7 MB, according to its inspected provenance metadata. It uses continuous native display capture with captions and display-fitting presentation zoom; it is distinct from the earlier browser responsive preview.

Also inspected `.local/duo-native-checks/debug-logs-inner.png`. Copy/trash controls and the native right-side back control clear the system status region, while the empty-state message remains readable. No additional UI change was indicated by this capture. This specific image does not exercise populated log-line wrapping.

No outstanding high-priority experience defect remains in the reviewed simulator screens and transitions. The completed scope covers native simulator behavior and local mock transport, with the test-run history and limitations stated above. It does not claim a physical hardware test or a single uninterrupted clean 17-of-17 Maestro run.
