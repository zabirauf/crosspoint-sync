# Full iOS regression validation — November 5, 2026

The final product source at `4703e5f27d8a8006b5b668e60c1dac332b5f0adb` passed the complete iOS Maestro workspace on both phone profiles after the Android/shared-dialog changes.

| Simulator | Runtime | Full-suite result | Named captures |
| --- | --- | --- | --- |
| iPhone 17 Pro | iOS 26.5 | 17/17 passed, zero failures | 20 |
| iPhone Duo, outer display | iOS 27.1 | 17/17 passed, zero failures | 20 |

Both were clean full runs, with no app-assertion retries or startup recovery. No product or flow change was required. The iPhone run took 4m39s; Duo took 5m1s.

## Build and scope

The same final native Release app was installed on both simulators: CrossPoint Sync 1.2.0, built with Xcode 27.2 / iOS Simulator SDK 27.2. Its `main.jsbundle` SHA-256 is `7bb213391e5d36e7e1c23a0ba9e8c00cc4df46dc785267b17c349a7bc65a047b`. Maestro 2.12.1 ran against a fresh disposable mock reader on HTTP 8082 / WS 8083 with firmware 1.3.0 and public-domain fixtures.

The standard workspace covers startup; connected/disconnected Library; connection; five-format icons/actions; folder navigation; the add menu; Settings and path prompts; dark appearance; file actions; rename; Move and its folder input/footer; and the retained rename draft through the suite's orientation commands. The Upload Flow case opens the add menu; this run does not claim another native book-picker selection or physical-reader transfer.

The implementing agent and independent design reviewer reviewed all 40 captures, with detailed inspection of complete input fields, actual software keyboards, action/footer reachability, status contrast and Duo's lateral system region. No actionable visual regression was found. The regular iPhone landscape capture keeps the complete focused input and Cancel/Rename above the keyboard, allowing title/message content to scroll away when space is short.

Duo's landscape-named Maestro captures remain portrait-shaped. Those filenames alone establish retained draft/control presentation, not physical device rotation. Physical Duo rotation/folding is checked separately from the workspace below.

## Physical Duo continuation

The separate native check used actual `idb rotation` and hinge changes, keeping the same process (PID 72621) and the exact folder-name draft `Full suite fold draft` at destination `/Formats` through outer portrait → outer landscape → inner → partial fold → outer return. Actual reported scenes were 466×678 points outside, 678×466 in physical outer landscape and 951×669 inside. The software keyboard remained visible and the relevant input, Create, Cancel and close controls stayed reachable.

The short outer landscape scene used the compact New folder view. Opening restored the full Move presentation, directory list and footer with the same draft/path; closing restored the outer view. The check cancelled and returned to the same Formats folder, without creating or moving anything. Its six native captures and structured result are retained in `test-screenshots/ios/duo-20261105-fold-followup/`.

## Evidence and reproduction

Local JUnit reports, named screenshots and original logs are retained in:

- `test-screenshots/ios/duo-20261105-full-iphone/`.
- `test-screenshots/ios/duo-20261105-full-duo/`.
- `.local/duo-ios-full-iphone-20261105.log`.
- `.local/duo-ios-full-duo-20261105.log`.

Reviewed references are in `test-references/ios/iphone-17-pro/` and `test-references/ios/iphone-duo/`, classified by visible appearance. This pass uses simulators and a local mock; physical hardware and reader transfers are outside its scope. Earlier iPad and native upload evidence remains in the linked validation reports. The task-owned simulators, mock reader and companion were stopped after validation; installed apps and ignored local artifacts remain available.

With the final Release installed and a fresh mock running, use a new output directory for each device:

```sh
CROSSPOINT_VISUAL_OUTPUT="$PWD/test-screenshots/ios/<new-run>" \
MAESTRO_BINARY="$PWD/.local/maestro-2.12.1/maestro/bin/maestro" \
npm run test:visual:flows -- --platform ios --device <UDID> \
  --format JUNIT --output "$PWD/test-screenshots/ios/<new-run>/results.xml"
```
