# iPhone Duo demos — November 4, 2026

## Native simulator demo

`iphone-duo-native-demo.mp4` is a new recording of the actual native Release app on Apple's iPhone Duo simulator, using iOS 27.1 (24A94425), built with Xcode 27.2 (27B52) / iOS Simulator SDK 27.2. It is approximately 70 seconds, H.264/yuv420p, 1440×1080 at 30 fps, 2.7 MB, silent with no audio track and fast-start metadata.

The recording shows connected browsing on the outer display, opening into the inner layout with the same folder and ongoing upload, the same upload queue through a close, a typed rename draft and software keyboard through open/partial poses, bounded Settings on both displays, safe crop controls on first opening, preservation of an off-center crop, and return to the same library. The rename and crop are cancelled. The recorded upload completed once with bytes identical to its source.

This is continuous native display footage with captions and a display-fitting presentation zoom added for readability. It includes normal brief simulator display handoffs. No browser or synthetic app frames are used. The local reader is a disposable mock; the EPUB is a public-domain fixture with synthetic transfer padding. One pending job is staged in the simulator's test store before recording; actual native file reads and WebSocket transfer perform the upload. No private books or physical reader were used.

`iphone-duo-native-demo.json` contains device/toolchain provenance, action timing, output metadata, checksum and playback validation. The raw recording is retained locally at `.local/duo-native-demo/raw.mp4`. A full decode, seven decoded seek frames, browser play/advancing time and six exact browser seek positions were checked. Representative encoded frames were independently reviewed for readability and safe edges.

See [native validation](../../native-duo-setup-2026-11-04.md) and [design review](../../iphone-duo-design-review-2026-11-04.md) for the test history, native crop fix and scope. Reviewed native pose references are in `test-references/ios/iphone-duo/light/`.

## Earlier browser preview

`iphone-duo-responsive-demo.mp4` is the earlier live Expo web recording, made before the Duo toolchain was installed. It shows representative 466×678 / 890×626 windows and is explicitly labeled as a browser responsive preview throughout. It does not establish native fold/system-bar/keyboard behavior. Its pointer rings, original timestamps and assertions remain in `iphone-duo-responsive-demo.json`.

That earlier artifact is H.264, 1280×960 at 30 fps, approximately 72 seconds and 1.4 MB. The native recording above is the requested replacement demonstration on the installed simulator.
