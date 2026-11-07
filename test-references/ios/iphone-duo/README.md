# iPhone Duo native references — November 4, 2026

Actual iPhone Duo simulator captures, device type `com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`, iOS 27.1 (24A94425), app built with Xcode 27.2 (27B52) / iOS Simulator SDK 27.2. Light appearance. A local mock reader and public-domain/synthetic fixtures are used.

These manually reviewed captures cover outer/inner Library, file actions, keyboard drafts, Move, first-opening crop safe areas, crop return, actual upload progress/completion, Settings, and the native Debug Logs header. Natural active-display pixel dimensions and simulator masks are preserved. `crop-initial-outer.png` is from the fixed first opening before a fold; unsafe reproductions are retained only in ignored local artifacts.

The design review and native validation report document the checks and scope. These additional pose names do not replace other device baselines. The standalone `.maestro/manual-flows/sleep-preview-safe-area.yaml` check provisions its crop route/image externally and submits that disposable fixture; its screenshot name matches `crop-initial-outer`.

The November 5 full rerun on final product source `4703e5f` passed 17/17 in one clean outer-display run and added 20 reviewed named captures, classified by visible light/dark appearance. Maestro's landscape-named captures retain portrait-shaped outer presentation; use the separate `full-fold-*` references for actual physical rotation/folding. Those six captures verify the same typed Move draft, destination and process through outer portrait, outer landscape, inner, partial fold and outer return, with the software keyboard visible. See `docs/analysis/ios-full-suite-validation-2026-11-05.md`.
