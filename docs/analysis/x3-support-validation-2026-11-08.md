# X3 support validation — 2026-11-08

Branch: `codex/first-class-x3-support`, based on main `fbed6fa`.

CrossPoint 2.0.0 includes X3 in its shared X3/X4 status and file-transfer implementation.
Its pinned [SDK BoardConfig](https://github.com/Free-Ink/freeink-sdk/blob/5e94fe7480f019c89fbf691aef87523eb1b46704/libs/hardware/BoardConfig/include/BoardConfig.h)
defines the X3 panel as 792×528 landscape; the app exports portrait sleep images at
528×792. X4 remains 480×800. Missing model fields in an actual status response preserve legacy behavior;
unknown reported models retain file transfers but cannot generate a guessed sleep image.

Validation:

- `npm run test:basic` passes, including both models against disk and memory mock
  readers: all five formats list, upload over WebSocket, download byte-for-byte,
  rename, move, and delete through the actual app services.
- Six reader tests verify model fallback, both BMP output dimensions and
  crop invariance across window resizing, and actual file-browser hook behavior
  when switching readers or receiving out-of-order responses. They also mount the
  actual crop screen and generate BMPs after delayed X3 status, explicit offline
  choices and reader changes. No status cannot silently select X4; legacy status
  without a model still can. The new offline regression fails on the original PR.
- `npm run check:bundles` exports both iOS and Android successfully.
- `tsc --noEmit` still reports existing Tamagui UI typing errors; no new reader
  profile, file-browser, sleep service, or reader-test errors remain.
- iPhone 16 Pro simulator, iOS 18.4: reused the installed native release shell
  with this branch's newly exported iOS Hermes bundle (no native source changes).
  Maestro `x3-reader.yaml` confirms XTEink X3 identity. `x3-sleep-preview.yaml`
  confirms the 528×792 editor, completes native crop/conversion and upload.
  Downloading the result from the real mock HTTP server confirms a 528×792,
  24-bit grayscale BMP, 1,254,582 bytes. Reviewed screenshots are committed under
  `test-references/ios/iphone-16-pro/light/x3-*.png`.
- One initial queue recovery timing check failed; the isolated book suite and
  subsequent complete basic suite both passed. No queue behavior was changed.

## Offline crop review fix

Commit `8af47aa` requires a known target before cropping: adopt a received reader
status or explicitly choose X3/X4 offline. Keep that choice fixed so the preview
and queued BMP agree. The updated reader suite (6 checks), adaptive suite (4) and
book-format suite (17) pass; fresh iOS and Android production exports pass.
Maestro verifies the offline choice, X3 crop/queue and connected X3 preview;
reviewed references include `sleep-reader-choice.png` and `sleep-offline-x3.png`.

The actual native iOS crop, codec, queue and HTTP/WebSocket upload path was then
tested against the official `simulator_x3` profile, using firmware 2.0.0
`42d58daaabcf469a2e5e1ba871714fb9dcf51d29`, its pinned SDK above and simulator
`04332e7ab5e048fe7909d6a788a9641ece14941b`. Each case used a fresh virtual SD card
and the same staged source image, with the production JS bundle in the existing
native shell. No codec, queue or upload adapter was used.

- Original PR `0bab1d5`: offline preview implicitly queued 480×800 / 1,152,054 bytes
  and uploaded it unchanged to a reader reporting X3.
- Fixed `8af47aa`: choosing X3 offline queued and uploaded 528×792 / 1,254,582 bytes.
- HTTP downloads matched virtual SD bytes in both cases. Firmware loaded both
  images as custom sleep screens; the original output acquired side margins
  when fitted to X3, while the fixed output matched its aspect ratio.

[Native/SDL before-and-after GIF, headers, hashes and sanitized logs](https://github.com/zabirauf/crosspoint-sync/blob/codex/pr-demo-media-2026-11-08/docs/pr-demos/pr-33-offline-x3-simulator.md)
record the scenario. This validates native iOS generation and firmware acceptance;
it does not validate physical WiFi, FAT32, memory ceilings, e-ink refresh or Android
native codecs. Input staging bypassed only the photo-picker interaction.

The original reporter's physical X3 empty-folder symptom cannot be confirmed
without that hardware/card. Tests expose and fix a concrete app bug: switching
readers while connected retained the old path and accepted stale listings.
Physical X3 rendering and Android visual validation remain outstanding.
