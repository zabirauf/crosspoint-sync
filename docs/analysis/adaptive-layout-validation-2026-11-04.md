# Foldable iPhone and tablet layout validation — November 4, 2026

The implementation started from `origin/main` at `cf3ab7a` on `codex/iphone-duo`. The target is the new foldable iPhone, plus tablet and narrow split-window use.

## Resulting behavior

- Navigation uses bottom tabs at compact widths and a right rail when the usable window is wide enough. Library keeps one mounted file list and adds a small reader/queue context panel only when the measured scene can accommodate it.
- Settings stays within a readable column. Narrow windows and larger text stack values below labels; long paths wrap instead of colliding.
- Connection, upload queue, file actions, move and text prompts use one adaptive native Modal presentation with a local safe-area provider. Its content tree stays mounted during a resize. Compact windows bottom-align the dialog; expanded windows center it at a maximum of 560 points. Dialog bodies scroll, keyboard avoidance reduces available height, and text-prompt buttons remain pinned below the scrolling body. A focused text field scrolls into view whenever the body resizes, so the field stays readable in a short window with the software keyboard open. Each task has an explicit close/cancel action.
- The crop editor fits its 3:5 frame to the actual safe-area canvas. Normalized pan and zoom retain the same source-image crop through resizing. Incremental pan updates also avoid rebasing an ongoing drag on an old display size.
- Content clears current safe areas. More-actions and connection targets are at least 44 points tall. The add menu scrolls within the measured Library pane in short windows, including when an upload status bar occupies space.
- Orientation is unlocked in Expo configuration. Prebuild was run, and both generated iPhone/iPad orientation arrays include portrait and landscape; `UIRequiresFullScreen` remains false.

The independent design review and its follow-up are in [iphone-duo-design-review-2026-11-04.md](iphone-duo-design-review-2026-11-04.md). Its crop, Settings, presentation, touch target, swipe-back and short-menu findings were addressed.

## Repeatable checks

`npm run test:adaptive` runs four native-boundary component/geometry tests: task mount and draft retention, real prompt input identity/submission, source crop invariance/bounds, and compact layout selection for narrow windows or larger text.

Browser resize testing uses the actual Metro web export, not a separate mock layout:

```sh
npx expo export --platform web --output-dir .local/duo-web
python3 -m http.server 8097 --bind 127.0.0.1 --directory .local/duo-web
# In another terminal, start a disposable mock reader, then:
npm run test:responsive:web
```

The script expects the mock reader at localhost:8082 (HTTP) / 8083 (WebSocket). `RESPONSIVE_APP_URL` and `RESPONSIVE_OUTPUT` can override the app URL and screenshot output directory. It adds browser CORS headers at the test boundary because the native reader protocol does not use CORS. Thirty synthetic browser-only list entries exercise scrolling beyond one viewport; a failed upload fixture exercises the upload bar and raised add menu. The real legal book fixtures remain the file-action targets. Browser storage is isolated from native app data.

Window cases are 466×678, 890×626, 1194×834, 375×834, 678×466 and 700×320. These are representative app-window sizes rather than assertions about fixed hardware or safe-area dimensions. Assertions cover one mounted file list, retained folder and 500-point scroll offset, retained native input identity and full rename draft, the complete saved long Settings path, bounded file actions, crop frame fit, short-menu fit, and absence of runtime errors.

The web Babel preset enables Expo's import.meta transform so Zustand's web build can load. Keep-awake requests tolerate an already released/inactive lock; these best-effort calls must not produce unhandled UI errors.

## Recorded validation

- Adaptive component/geometry checks: 4 passed.
- Browser end-to-end resize checks: passed after the final prompt refinement; eight reviewed references are in `test-references/web/resizable/light/`. Full captures are under `test-screenshots/responsive/2026-11-04T19-26-29-951Z/`.
- iOS and Android Metro exports: passed. The configured Tamagui RC emits existing parser/type warnings.
- TypeScript: 101 Tamagui RC prop-definition errors after the change, versus 112 before. No diagnostics in the new layout hook, modal, crop geometry or tests. This is not a clean project-wide typecheck.
- Combined `npm run test:basic` recheck: passed (14 EPUB, 10 delete, 15 book format/API/WebSocket, 7 visual runner, 4 adaptive checks). The first combined run timed out waiting for the queue while native/web builds were running; the isolated recheck and later combined run both passed. Logs retain the original failure. Queue/API implementation was not changed.
- Visual runner recovery checks: 7 passed.
- iOS Release simulator build: passed with Xcode 26.6 / iOS 26.5 SDK, including the final focused-field visibility fix.
- Final prompt checks: rename and resize flows passed 2/2 on the pinned-action implementation. Visual review then caught input clipping in the short keyboard layout that the accessibility assertions missed; the final implementation also reveals the focused field after resize. The dedicated final focus-event flow passed (exit 0); screenshot review confirmed the complete draft field and both actions above the software keyboard. Artifacts: `test-screenshots/duo-ios-focus-event-final/`. The shared focus-event implementation also passed the full browser matrix. An intermediate native-only focus query was replaced after the browser check caught its incompatibility with HTML input refs.
- Native iPhone suite: 17/17 flows passed in 22m 51s on iPhone 17 Pro / iOS 26.5, including folder creation and draft retention through rotation. Artifacts: `test-screenshots/duo-ios-phone-final/`.
- Native iPad: connected browsing, bounded Settings and file actions were visually checked on iPad Pro 11-inch (M5) / iOS 26.5, including portrait/landscape changes without dismissing file actions. The final iPad upload-path prompt retained its entire draft and input focus through rotation, using the attached keyboard. The phone captures also exercise the software keyboard. Reviewed native references are in `test-references/ios/ipad-pro-11-m5/light/` and `test-references/ios/iphone-17-pro/dark/`. Captures are classified by their visible appearance; a first-use keyboard tip was excluded and replaced by the final-build rename capture.

## Completed native Duo follow-up

The earlier Xcode 26.6 toolchain limitation was resolved. Xcode 27.2 and the actual iPhone Duo simulator/iOS 27.1 runtime are installed. Native scene lifecycle, first-opening crop safe areas, folder/scroll and keyboard drafts, Move state, real upload continuity/checksum, and the final native demo are documented in [native-duo-setup-2026-11-04.md](native-duo-setup-2026-11-04.md). The native crop review found and fixed a modal-local inset defect that browser resizing could not establish. The shared browser matrix and four adaptive checks passed again after that fix. Physical hardware/reader testing remains outside this validation scope.
