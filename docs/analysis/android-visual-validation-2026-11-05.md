# Native Android visual validation — November 5, 2026

The final Android Release passed **18/18 native flows**, with all 24 named screenshots reviewed. Additional native photo-picker/crop and regular-iPhone regression checks passed. Testing uses the dedicated Pixel 7 emulator, Android 16 / API 36, arm64, a 1080×2400 display at 420 dpi, and Maestro 2.10.0. The APK is version 1.2.0 from `codex/iphone-duo`. The reader is a disposable local mock using public-domain book fixtures and synthetic test data.

Final APK SHA-256: `005546921dd3914b6917d427d3244767e076f427b0cb7fb0c333de2a58bbdbc9`.

## Issues found and fixed

- **Keyboard-obscured dialogs.** Edge-to-edge Android Modal content did not resize above the keyboard, despite `adjustResize`. Settings and rename prompts disappeared behind it; Move's folder input remained visible while its footer was hidden. `AdaptiveSheet` now uses explicit padding avoidance on both platforms. For a docked Android keyboard, it omits the already-covered bottom safe inset and reduces vertical content padding, keeping the full input and normal-sized actions visible in a short landscape window. The iOS keyboard-padding behavior is retained.
- **Full-screen landscape text extraction.** Android's keyboard replaced the app with its own full-screen editor, hiding the task actions. All three modal input types now set `disableFullscreenUI`.
- **Too much fixed Move content above a landscape keyboard.** Move measures its available height. While creating a folder in a short window, it shows a compact New folder header, the destination, and the same input/Create/Cancel controls. The input remains mounted. Hiding the keyboard restores browsing and Move Here with the same draft and path. Actual Create and compact Cancel were exercised against the mock; no book was moved.
- **Status icon contrast.** Root light screens had white system icons on white. A theme-aware root `StatusBar` fixes contrast while preserving the crop screen's local light override on its dark background.

The tests now assert prompt inputs/actions and Move's footer rather than relying only on a screenshot or a visible container. Shared visual specs include Android and its Article Clipper labels. The standalone landscape flow explicitly reopens the keyboard after rotation: Android can dismiss it while rotating, so retained text alone does not establish keyboard reachability.

## Test evidence

The final expanded suite passed 18/18 on the final APK, including all 17 standard flows and the actual-landscape-keyboard regression. It exercises connected/disconnected browsing, formats, connection, Settings, light/dark appearance, file actions, drafts, rotation, and actual mock folder creation/cancellation. Reviewed references are under `test-references/android/pixel-7/`, classified by visible appearance.

The Android crop check selected the synthetic fixture through the native photo picker, verified the initial full-screen controls, tapped Done and returned to Library (1/1 passed). The mock received the completed 480×800, 24-bit BMP, 1,152,054 bytes. Its SHA-256 is `a6ae6d688c74c6b3426f9f4f7c592aaa932082b6fa687b08651f10b54866f8ff`. A direct external-file test URI initially failed to load the staged fixture; selecting it through the real picker copied it successfully, without a product change for test staging.

An additional off-center crop retained the same app process and source region through portrait → landscape → portrait. Normalized crop mean absolute pixel differences were 1.2838 in landscape and 0 on return, on a 0–255 scale. Controls and the 3:5 frame cleared system areas in every pose. This continuity check was cancelled without another upload.

The completed upload queue also passed a separate native flow (1/1): header, completed count, Add Books and close control fit both orientations. Android hardware Back dismissed it and retained the Formats folder.

The final shared sources also built successfully with Xcode 27.2. Two native iPhone 17 Pro / iOS 26.5 flows passed: Rename and compact folder editing with the actual keyboard in landscape, returning to portrait with the same draft and Move Here. Three reviewed light references are under `test-references/ios/iphone-17-pro/light/`. This focused 2/2 check supplements the earlier 17/17 iPhone suite; it is not a new full iPhone-suite run.

The initial full Android run passed 14/17 and exposed the shared keyboard defect. A subsequent full run passed 17/17 after keyboard avoidance and status contrast fixes. The additional reopened-keyboard scenario then found the extract-editor and short-height issues above; those were fixed and its targeted recheck passed, including real folder creation and cancellation. Original failures and intermediate runs are preserved separately.

The implementing agent and the independent design reviewer inspected native screenshots against the visual specs, including complete input bounds, reachable actions, light/dark status contrast and restoration after keyboard dismissal. This is direct native screenshot review, not a claim that the optional Claude API judge ran.

Local artifacts:

- Initial run: `test-screenshots/android/duo-20261105-full/`.
- First complete recheck: `test-screenshots/android/duo-20261105-final/`.
- Compact landscape check: `test-screenshots/android/duo-20261105-compact-editor-recheck/`.
- Final expanded suite: `test-screenshots/android/duo-20261105-complete/`.
- Native picker/crop and crop continuity: `test-screenshots/android/duo-20261105-crop-picker/` and `test-screenshots/android/duo-20261105-extra/`.
- Queue and hardware Back: `test-screenshots/android/duo-20261105-queue/`.
- Shared iPhone regression: `test-screenshots/ios/duo-android-followup-20261105/`.
- Build and final run logs: `.local/duo-android-final-build-20261105.log`, `.local/duo-android-complete-20261105.log`.

The four adaptive checks and both iOS/Android Metro exports passed after the final source changes. Typecheck still reports 101 known Tamagui RC prop-definition errors and is not clean. Testing covers an emulator and a local mock reader; physical Android devices/readers and additional Android OS versions are outside this pass. The standard suite's Upload Flow opens the add menu; it does not automate book selection from the native picker.

## Repeat

Start a disposable mock reader on HTTP 8082 / WS 8083, build/install the current Release APK, and boot the dedicated Android emulator. Then run:

```sh
CROSSPOINT_VISUAL_OUTPUT="$PWD/test-screenshots/android/<new-run>" \
ANDROID_SERIAL=emulator-5554 npm run test:visual:android -- \
  .maestro/flows/ .maestro/manual-flows/android-keyboard-landscape.yaml
```

The landscape flow creates a uniquely named folder in the disposable mock's Formats directory. It verifies retained text, actual keyboard visibility, active controls, restored browsing, creation and cancellation. Use a fresh mock fixture tree for an independent full run.

For crop testing, push `test-fixtures/images/crop-asymmetric.png` to the emulator's Pictures directory, scan it into MediaStore, and select that image using Library → + → Sleep Background. The standalone `sleep-preview-safe-area.yaml` then checks controls and submits the image to the mock reader. The native book-picker selection flow was not repeated in this pass.

The task-owned emulator, iPhone simulator and mock reader were stopped after validation. Installed apps, toolchains and ignored local test artifacts remain available.
