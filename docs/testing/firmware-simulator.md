# Testing against the CrossPoint firmware simulator

[crosspoint-simulator](https://github.com/crosspoint-reader/crosspoint-simulator)
compiles CrossPoint firmware as a host program and displays its framebuffer in an
SDL window. It can run the firmware-owned HTTP and WebSocket routes, EPUB parser,
cache builder and renderer. Use it when a change's acceptance depends on those
behaviors, alongside the app's fast unit, mock and native UI checks.

## Choose the relevant test

| Change | Simulator acceptance check |
| --- | --- |
| Generated EPUB/XHTML or image preparation | Generate through the app, upload, open on the reader, and inspect the affected text/images. |
| HTTP APIs, paths, CRUD or upload protocol | Exercise the actual app request against the firmware handler; verify its response and stored result. |
| Firmware capabilities, settings or reader model | Use the matching release/profile and verify the reported fields and relevant app behavior. |
| Sleep-image dimensions or other reader output | Upload the generated artifact and inspect its headers and supported reader behavior with the target profile. |
| UI-only, docs or purely local state | Use the relevant lightweight checks; no firmware build is required. |

Keep controlled mock failures for timeouts, disconnects and errors that are hard
to induce in the simulator. It does not verify physical WiFi discovery, OS network
permissions, FAT32 case behavior, ESP heap ceilings or e-ink refresh quality.
Record what a test actually covers. In particular, a host/browser image decoder
does not establish native iOS or Android codec support.

## Set up an isolated build

Read the simulator's current [README](https://github.com/crosspoint-reader/crosspoint-simulator#readme)
and its sample config for the host OS. Reuse a checkout already identified in the
session, or set `CROSSPOINT_FIRMWARE_SOURCE` to an existing checkout in local
configuration. Otherwise, clone upstream under the ignored test directory as
shown below. Read the firmware's agent instructions too.
Create a detached worktree for testing, preserve existing work, and keep builds,
local config and SD contents under this app's ignored `.local/` directory.

The following macOS setup was validated for PR #32. It is a reproducible baseline,
not a requirement to use these revisions forever. For a new feature, choose a
firmware release/revision that contains its API and a compatible simulator, then
record the exact firmware, SDK and simulator commits. Initialize the firmware's
pinned SDK submodule rather than substituting the SDK's latest branch.

Run from this app's repository root, using a new test directory:

```bash
export CROSSPOINT_TEST_ROOT="$PWD/.local/firmware-simulator"
export CROSSPOINT_FIRMWARE_SOURCE="${CROSSPOINT_FIRMWARE_SOURCE:-$CROSSPOINT_TEST_ROOT/source}"
mkdir -p "$CROSSPOINT_TEST_ROOT"

if ! git -C "$CROSSPOINT_FIRMWARE_SOURCE" rev-parse --git-dir >/dev/null 2>&1; then
  git clone --filter=blob:none https://github.com/crosspoint-reader/crosspoint-reader.git \
    "$CROSSPOINT_FIRMWARE_SOURCE"
fi
git -C "$CROSSPOINT_FIRMWARE_SOURCE" fetch origin tag 2.0.0
git -C "$CROSSPOINT_FIRMWARE_SOURCE" worktree add --detach \
  "$CROSSPOINT_TEST_ROOT/firmware" 2.0.0
git clone https://github.com/crosspoint-reader/crosspoint-simulator.git \
  "$CROSSPOINT_TEST_ROOT/crosspoint-simulator"
git -C "$CROSSPOINT_TEST_ROOT/crosspoint-simulator" checkout \
  04332e7ab5e048fe7909d6a788a9641ece14941b
git -C "$CROSSPOINT_TEST_ROOT/firmware" submodule update --init --depth 1

python3 -m venv "$CROSSPOINT_TEST_ROOT/venv"
"$CROSSPOINT_TEST_ROOT/venv/bin/pip" install platformio==6.2.0
brew install sdl2
```

On Linux/WSL use the upstream Linux/WSL sample and install its SDL2/OpenSSL
development prerequisites. Native Windows is not supported by this simulator.

For the macOS baseline, adapt the upstream sample to the local sibling checkout:

```bash
python3 - <<'PY'
import os
from pathlib import Path

root = Path(os.environ["CROSSPOINT_TEST_ROOT"])
config = (root / "crosspoint-simulator/sample-platformio-macos.ini").read_text()
config = config.replace(
    "simulator=https://github.com/crosspoint-reader/crosspoint-simulator",
    "simulator=symlink://../crosspoint-simulator",
).replace(
    "pre:.pio/libdeps/$PIOENV/simulator/skip_device_content_protection.py",
    "pre:../crosspoint-simulator/skip_device_content_protection.py",
).replace("dev-simulator", "2.0.0-simulator")
(root / "firmware/platformio.local.ini").write_text(config)
PY

"$CROSSPOINT_TEST_ROOT/venv/bin/pio" run \
  --project-dir "$CROSSPOINT_TEST_ROOT/firmware" -e simulator -j 4
```

Use a release-prefixed `CROSSPOINT_VERSION` such as `2.0.0-simulator` when testing
app capability gates; the default `dev-simulator` label is not a semantic version.
Match that prefix to the actual firmware being built.

Retain `CROSSPOINT_SIMULATOR_PROJECT_WEBSERVER` in the sample flags and compile
the firmware's `CrossPointWebServer.cpp` and `WebDAVHandler.cpp`. A legacy reduced
simulator web server does not validate those firmware handlers. Keep
`platformio.local.ini` ignored and uncommitted. Use the documented default image
backends first; native decoder opt-in is a separate configuration to validate.

The sample also includes profiles such as `simulator_x3`. Select the profile
relevant to the change and verify `/api/status.device`, geometry and capabilities.
A successful X4 test does not establish X3-specific behavior.

An existing build at `$CROSSPOINT_TEST_ROOT/firmware/.pio/build/simulator/program`
may be reusable after checking its revisions and configuration. Rebuild when its
inputs change; documentation-only changes do not require rebuilding firmware.

## Run the app against it

Use a fresh SD directory per case, including separate before/after directories.
This prevents last-book auto-reopen and old section/image caches from masking
results. Create only the fixture files/settings needed for that case.

```bash
mkdir -p "$CROSSPOINT_TEST_ROOT/sd-case" "$CROSSPOINT_TEST_ROOT/artifacts"
CROSSPOINT_SIM_SD="$CROSSPOINT_TEST_ROOT/sd-case" \
CROSSPOINT_SIM_HTTP_PORT=18080 \
CROSSPOINT_SIM_SCREEN_TEXT=1 \
  "$CROSSPOINT_TEST_ROOT/firmware/.pio/build/simulator/program" \
  2>&1 | tee "$CROSSPOINT_TEST_ROOT/artifacts/firmware.log"
```

Choose **File Transfer → Create Hotspot** in the simulator. Keep that screen open
during transfers. Firmware port 80 is exposed on host port 18080 and WebSocket
port 81 on host port 18081. Check `/api/status` before starting the scenario:

```bash
curl --fail http://127.0.0.1:18080/api/status
```

Connect the iOS simulator app to `127.0.0.1:18080`. The Android emulator generally
uses `10.0.2.2:18080` to reach the host loopback service; verify connectivity for
the selected emulator. This setup does not exercise UDP discovery or a real
hotspot. Physical-phone access requires a separately verified host/LAN setup.

For a content-generation test, run the actual import/generation/conversion and
queue path in the native app, then upload to the firmware. Capture the firmware's
upload result, download the file over HTTP and compare it with the virtual SD
file. Refresh the app's parent listing if the upload created a new destination
folder. Exit File Transfer only after the network checks are finished, browse to
the book in the simulator, and verify indexing and the affected content.

Copying an EPUB into the virtual SD directory is useful for parser/rendering
tests, but it does not test the app's import, native codecs or upload transport.
Similarly, invoking app services with browser/filesystem adapters is not a native
codec test. State those narrower boundaries when that is the intended test.

## Automate navigation and capture evidence

The simulator supports these environment variables; consult the pinned version's
README for their exact syntax:

- `CROSSPOINT_SIM_INPUT_SCRIPT`: scheduled buttons/touches plus `WAIT:<regex>`,
  `SHOT:<path>` and `QUIT` actions.
- `CROSSPOINT_SIM_SCREEN_TEXT=1`: firmware screen text in the serial log.
- `CROSSPOINT_SIM_SCREENSHOTS`: time-based BMP captures.
- `CROSSPOINT_SIM_WAIT_TIMEOUT_MS`: timeout for scripted log waits.

Prefer waits for firmware activity/readiness messages to arbitrary delays. Check
menu order and screen text for the selected revision/profile before reusing a
navigation script. Create screenshot directories first. On macOS the default
desktop SDL driver produced captures in the validated setup; `SDL_VIDEODRIVER=dummy`
worked for HTTP checks but did not produce framebuffer screenshots. Choose the
driver for the evidence needed rather than assuming headless capture works.

Use Maestro/native capture tools for the app and the simulator's `SHOT` captures
for the reader. Keep the simulator in a tracked foreground tool session while
the app connects; finish with `QUIT` or terminate that test process. Restore app
settings and temporary test adapters, and stop only processes started for the test.

Compare identical inputs and the same firmware/profile across the app's base
and changed revisions. Retain:

- App, firmware, simulator and SDK SHAs; host OS and native app platform.
- Fixtures, expected outcomes, actual API responses and upload/reader logs.
- Uploaded files or hashes, XML/image checks and reader screenshots as relevant.
- Any test-only adapters and the boundary they bypassed.

If a fixture needs a test-only import adapter, keep it identical in both builds,
leave production logic unchanged, describe it in the evidence, and restore it
after exporting the test builds. It must not become a production change.

For a user-visible fix, include a useful before/after GIF or screenshots in the
PR along with the outcome and remaining hardware/platform checks. Captions must
identify actual native/SDL captures versus browser previews or mocked output.
When the GitHub connector cannot upload attachments, a separate media branch
with commit-pinned raw image URLs can host the PR evidence.

## Validated example: PR #32

[PR #32](https://github.com/zabirauf/crosspoint-sync/pull/32) exercised a native
iOS clip import and upload against CrossPoint 2.0.0 with simulator commit
`04332e7` and the firmware's SDK commit `5e94fe7`:

- Main uploaded an EPUB, but the firmware reported **Failed to index - invalid
  book** and logged an undefined entity in an image attribute.
- The fixed app converted AVIF/WebP to PNG, uploaded the EPUB, and the firmware
  indexed four pages and rendered both illustrations.
- A test-only adapter supplied the same captured clip from Documents in both
  builds. The Safari extension/App Group handoff was not exercised.

The [pinned setup, GIF, fixtures, generated EPUBs and logs](https://github.com/zabirauf/crosspoint-sync/blob/3e76e3e945cc2872c4b481b7e0e5bff7cad6a8c1/docs/pr-demos/simulator-pr32.md)
provide a working reference. Physical-reader memory/refresh behavior and Android
native codecs remained outside that test.
