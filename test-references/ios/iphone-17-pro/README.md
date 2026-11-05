# iPhone 17 Pro references

Reviewed iOS 26.5 / Xcode 26.6 native captures from the November 4, 2026 adaptive-layout work. The phone rendered in dark appearance, so these captures are stored in `dark/`. Reference folders reflect the visible app appearance.

The full suite passed 17/17 flows. Rename and resizing were additionally checked on the final prompt implementation. A first-use system keyboard tip in an earlier rename capture was excluded. Landscape captures retain the simulator's physical pixel orientation; rotate them for reading when needed.

These captures verify the current native phone layout and live rotation. They do not establish native Duo folding or SDK 27.1 full-display behavior. See `docs/analysis/adaptive-layout-validation-2026-11-04.md` for the test matrix and platform boundary. Existing references for other devices were not recaptured in this pass.

The three `light/` references are the November 5 follow-up on iOS 26.5, rebuilt with Xcode 27.2 after the shared Android dialog fixes. Both focused native flows passed: Rename, and compact Move folder editing with the software keyboard in landscape, then restoration in portrait. The landscape selection popover comes from the test tap and does not obscure its input or actions. This is a 2/2 focused regression check, separate from the earlier full 17/17 suite. See `docs/analysis/android-visual-validation-2026-11-05.md`.
