# PR #32: native app → CrossPoint firmware simulator

Validated November 8, 2026. [Before/after GIF](pr-32-app-simulator.gif).

The simulator adds reader-side acceptance coverage beyond the earlier browser
validation: it compiles the actual firmware EPUB parser, cache builder, renderer,
and file-transfer routes. No app-side mock device server was used in this test.

| Component | Pinned revision |
| --- | --- |
| Before app | `fbed6fa2a2209d760da2a4add106569f76fbb28e` |
| After app / PR #32 | `521578d405b22b946f29ba727f6601c7006c9225` |
| CrossPoint firmware | release `2.0.0`, `42d58daaabcf469a2e5e1ba871714fb9dcf51d29` |
| crosspoint-simulator | `04332e7ab5e048fe7909d6a788a9641ece14941b` |
| Firmware's FreeInk SDK | `5e94fe7480f019c89fbf691aef87523eb1b46704` |
| Native app | iPhone 16 Pro simulator, iOS 18.4; Expo 54 / RN 0.81 native shell |

## Result

| Check | Main | PR #32 |
| --- | --- | --- |
| Native app uploads to firmware | succeeds, 26,801 bytes | succeeds, 199,695 bytes |
| Chapter XML | undefined entity at line 11 | valid; all five resources parse |
| Image resources | AVIF + WebP | PNG 1000×667 + PNG 600×1200 |
| Firmware opens the uploaded book | **Failed to index - invalid book** | **four pages indexed** |
| Firmware image rendering | blocked by invalid chapter | both illustrations decoded and rendered |
| HTTP download equals virtual SD file | byte-for-byte match | byte-for-byte match |

The app ran its production clip importer, EPUB generator, native iOS image
converter, upload queue, HTTP path creation and WebSocket uploader. The after run
therefore verifies actual native iOS AVIF/WebP decoding and PNG conversion,
including the 1200-pixel resize limit. The firmware log independently records the
upload, chapter parsing, image extraction and PNG decode. The GIF uses actual
iOS app and SDL framebuffer captures, composed into a comparison.

## Input and harness scope

The same owned synthetic clip is supplied in both runs. It reproduces the #9
failure mechanism: `&nbsp;` in an image attribute and AVIF/WebP image resources.
It is not the reporter's full publisher article. [HTML](simulator-pr32/article.html),
[manifest](simulator-pr32/manifest.json), and both original image files are included.

A **test-only input adapter** changes `getAppGroupPath()` to return
`Paths.document.uri + '/simulator-clips'`, identically for main and PR #32. This
supplies the fixture without requiring a provisioned Safari App Group. The
production EPUB/import/conversion/queue/network modules are unchanged. The adapter
was restored after the two exports and is not committed to the app PR.

This does not test Safari's extension-to-App-Group handoff, Android's native
codecs, the reporter's original article on hardware, or physical-reader acceptance.
The simulator uses its documented default image-preview backends. The optional
native JPEGDEC/PNGdec configuration did not compile in this pinned setup; no
simulator or firmware C++ source was modified to work around it. Host heap metrics
and SDL rendering do not model the X4's memory ceiling, waveforms, ghosting or
refresh timings.

## Reproduce

1. Check out the pinned firmware and simulator side by side, initialize the
   firmware's pinned `freeink-sdk` submodule, install PlatformIO and SDL2.
2. Copy the simulator's `sample-platformio-macos.ini` to the firmware's ignored
   `platformio.local.ini`. Use `simulator=symlink://../crosspoint-simulator` and
   `pre:../crosspoint-simulator/skip_device_content_protection.py`. Keep the
   documented `CROSSPOINT_SIMULATOR_PROJECT_WEBSERVER` flag and default image
   backends. Set the reported version to `2.0.0-simulator-pr32` for app capability
   detection. Build with `pio run -e simulator -j 4`.
3. For each app version, export its iOS bundle with the identical input-path
   adapter above and install it in a compatible native development/release shell.
   Copy the provided fixture into `Documents/simulator-clips/` using the manifest's
   relative paths, including `manifests/clip-simulator-fixture.json`.
4. Start each firmware run with a separate empty `CROSSPOINT_SIM_SD` directory,
   X4 defaults, `CROSSPOINT_SIM_HTTP_PORT=18080`, and
   `CROSSPOINT_SIM_SCREEN_TEXT=1`. Choose File Transfer → Create Hotspot.
5. Launch the native app, observe its generated clip waiting in the queue, and
   connect it to `127.0.0.1:18080`. Its HTTP/WebSocket requests reach the real
   firmware handlers on ports 18080/18081. After upload, refresh the root listing
   and browse Articles to see the file. Download it over the firmware HTTP route
   and compare it to the virtual SD file.
6. Exit File Transfer on the firmware, Browse Files → Articles, and open
   `Simulator-Reading-Test.epub`. Main produces the indexing error. PR #32 opens
   and renders the article; advance to its third page to see the second image.
   Capture the renderer with the simulator's scripted `SHOT` action.

The default headless SDL driver did not produce framebuffer screenshots on this
macOS host, so the capture runs used the normal desktop SDL driver. Both runs
used fresh SD roots and separate caches. The generated books are included for
reader-only replay: [before EPUB](simulator-pr32/before.epub),
[after EPUB](simulator-pr32/after.epub). This replay alone does not repeat the
native app conversion or upload steps.

[Evidence and SHA-256 hashes](simulator-pr32/evidence.json) ·
[Before firmware log](simulator-pr32/before-firmware.log) ·
[After firmware log](simulator-pr32/after-firmware.log)
