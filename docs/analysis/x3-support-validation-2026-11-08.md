# X3 support validation — 2026-11-08

Branch: `codex/first-class-x3-support`, based on main `fbed6fa`.

CrossPoint 2.0.0 includes X3 in its shared X3/X4 status and file-transfer implementation.
Its pinned [SDK BoardConfig](https://github.com/Free-Ink/freeink-sdk/blob/5e94fe7480f019c89fbf691aef87523eb1b46704/libs/hardware/BoardConfig/include/BoardConfig.h)
defines the X3 panel as 792×528 landscape; the app exports portrait sleep images at
528×792. X4 remains 480×800. Missing model fields preserve legacy behavior;
unknown reported models retain file transfers but cannot generate a guessed sleep image.

Validation:

- `npm run test:basic` passes, including both models against disk and memory mock
  readers: all five formats list, upload over WebSocket, download byte-for-byte,
  rename, move, and delete through the actual app services.
- Three new reader tests verify model fallback, both BMP output dimensions and
  crop invariance across window resizing, and actual file-browser hook behavior
  when switching readers or receiving out-of-order responses.
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

The original reporter's physical X3 empty-folder symptom cannot be confirmed
without that hardware/card. Tests expose and fix a concrete app bug: switching
readers while connected retained the old path and accepted stale listings.
Physical X3 rendering and Android visual validation remain outstanding.
