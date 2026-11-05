# Resizable app references

Reviewed captures from `npm run test:responsive:web`, November 4, 2026. These show the actual Metro web export at representative app-window sizes. They are browser layout references, not iPhone Duo device/simulator screenshots.

The browser test uses a local mock reader, five real book/image fixtures, additional synthetic rows for scroll checks, and one failed upload to exercise the upload status bar and raised add menu. Native iPhone/iPad checks are recorded separately in `docs/analysis/adaptive-layout-validation-2026-11-04.md`.

- Outer window: 466×678.
- Inner window: 890×626.
- Tablet: 1194×834.
- Narrow tablet split window: 375×834.
- Short add-menu window: 700×320.

The script checks mounted view/input identity, draft and scroll retention, the saved long Settings value, and layout bounds. Review new screenshots before replacing these references when the intended design changes.
