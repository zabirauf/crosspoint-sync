# Native iPhone Duo validation — November 4, 2026

The iPhone Duo simulator is installed and native validation is complete. The new [70-second native demo](videos/2026-11-04/iphone-duo-native-demo.mp4) shows the actual running app on both displays, including software keyboards, a live upload and fold transitions. The reader is a local mock using public-domain and synthetic fixtures.

## Installed environment

- macOS 27.2 (26B123), updated by the user.
- Xcode 27.2 (27B52), installed from Apple's App Store. The user completed sign-in, license acceptance and required first-launch setup.
- iOS Simulator SDK 27.2 (24B8118); installed iOS 27.1 runtime (24A94425).
- Device type `com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`, model `iPhone19,4`.
- Dedicated simulator `CrossPoint Duo Validation`, UDID `32516D8C-95E0-4128-A749-A87E641CB0A9`.
- Actual active display captures: outer 1398×2034 pixels; inner 2853×2007 or 2007×2853 depending on pose. Layout decisions use current app space rather than these device dimensions.

Apple documents the SDK-dependent presentation and asymmetric safe areas in [Prepare your app for iPhone Duo](https://developer.apple.com/iphone-duo/prepare/). [Scene lifecycle adoption](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) is required for apps linked with the iOS 27 SDK.

## Native changes and findings

`plugins/withSceneLifecycle.js` makes the generated Expo project adopt scenes while preserving Expo dev-launcher ordering: prepare the existing React window/root before app-delegate subscribers run, then attach that same window to the scene. Folding resizes the existing tree. Cold/warm URLs and Expo lifecycle subscribers are forwarded. It also raises older pod resource deployment targets to the app's existing iOS 15.1 minimum, resolving two Xcode 27 build errors. Repeated Expo generation retained one scene delegate, one React startup and one deployment-floor block.

Native review found one additional layout defect: the crop screen's first full-screen presentation inherited zero safe-area insets. Even five seconds after opening, Done occupied the outer system region at x383.67–448 points. A modal-local `SafeAreaProvider` fixes the initial presentation: Done is x299.67–364 and the canvas is 382 points wide, before any fold. The standalone native Maestro check actually tapped Done and returned to Library. The format line now says “Grayscale output,” accurately describing the exported image while the native source preview can remain in color.

## Completed checks

- Release and Debug builds with Xcode 27.2 passed. Compiled Release `DTSDKName` is `iphonesimulator27.2`.
- Development launcher, warm/cold Metro URLs, interaction and Settings continuity across folds passed. Release cold Settings link passed.
- Full Duo Maestro run: 16 of 17 passed. The adaptive flow left the old extension after a center-positioned caret; its corrected setup taps at 95% and asserts the exact draft before rotation. That targeted flow then passed. These are separate runs, not a claim of one clean 17/17 run.
- Actual hinge changes 0 → 180 → 90 → 0 retained the same app process, folder and scroll anchor. Reading list 15 returned at exactly y147.6667 points.
- File actions stayed open. The exact rename draft stayed readable with its keyboard across all poses. Compact outer landscape also kept the full field and actions accessible.
- Move retained destination `/Articles` and the typed “Reading drafts” folder name through opening/closing. No move or folder creation was submitted.
- Off-center crop content stayed constant after the safe-area fix. Normalized native crop pixels had mean absolute differences of 0.1700 for inner/partial and 0 for the return, on a 0–255 scale. Cancel and Done cleared system UI in every reviewed pose.
- A 17,719,257-byte native upload remained one job and one WebSocket start through folds. Progress advanced 23% → 34% → 44%, then completed. Destination bytes matched SHA-256 `0b7510d92c5694e7f1675a4676b9429d133d11087b06c4ea4def4d5cdb40b039`.
- iPad Pro 11-inch M5 / iOS 26.5: the new scene-based build launched, connected, navigated Settings and opened a keyboard dialog successfully. The final crop fix also passed on its first tablet opening: Done clears the top system bar. Earlier native tablet portrait/landscape coverage remains in the broader validation report.
- Native Debug Logs empty state and header actions cleared the system region. Populated log wrapping was not re-tested.
- Four adaptive component/geometry checks and the full shared browser resize matrix passed after the crop fix. Typecheck still reports the same 101 known Tamagui RC prop-definition errors; project-wide typecheck is not clean.

The independent [design review](iphone-duo-design-review-2026-11-04.md), [structured native results](native-duo-validation-2026-11-04.json), and reviewed references in `test-references/ios/iphone-duo/light/` retain the evidence. This is simulator/mock-reader validation; no physical Duo or physical reader was used.

## Recording and test setup

The video is a continuous native display recording, trimmed to the outer starting view. Captions and a display-fitting presentation zoom make both physical display shapes readable. Normal short simulator display handoffs remain visible. The rename and crop are cancelled in the recording. A second native upload in the recording also completed once with matching bytes.

Upload jobs were seeded in the dedicated simulator's test store before launch; the actual native file reader, queue and WebSocket transport performed the transfers. A local proxy slowed binary frames by 10 ms per 4 KiB frame (64 KiB acknowledgement windows). Earlier proxy attempts were discarded after correcting ws-version binary flag handling and an overly slow per-frame delay. No uploader or device protocol code was changed.

The native picker rendered, but the test tool could not consistently scope its remote accessibility window; the seeded-job test avoids making a claim of automated native picker selection. Source fixtures and all staging are disposable local test data.

Key local logs: `.local/duo-sdk27-release-build-recheck.log`, `.local/duo-sdk27-debug-build.log`, `.local/duo-sdk27-native-suite.log`, `.local/duo-sdk27-adaptive-recheck.log`, `.local/duo-crop-initial-safearea.log`, `.local/duo-crop-safearea-fold-recheck.log`, `.local/duo-upload-final-check.log`, and `.local/duo-native-demo/recording.json`. Earlier setup downloads are retained in `.local/duo-install-cache/`.

To repeat, boot the dedicated simulator, start the disposable mock reader (HTTP 8082 / WS 8083), install the Release build, and use the native test flows. The standalone `.maestro/manual-flows/sleep-preview-safe-area.yaml` requires a staged local image route and submits that test image. Use the idb physical `rotation`/`hinge` APIs and wait for the presentation to settle; do not infer layout from an intermediate framebuffer or an orientation-space AX root frame alone.

## Final workspace state

The dedicated Duo and tablet test simulators were shut down after verification, and task-owned mock/proxy, Metro, web-server and test-companion processes were stopped. The Duo device, runtime and final Release app remain installed. The Duo's saved test address was restored to `localhost:8082` for a normal mock-reader rerun. Source changes and review artifacts are on `codex/iphone-duo`.
