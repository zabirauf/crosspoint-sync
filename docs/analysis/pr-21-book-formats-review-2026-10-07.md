# PR 21 book format review

[PR 21](https://github.com/zabirauf/crosspoint-sync/pull/21) adds selection and browsing support for XTC and XTCH alongside EPUB. Its upload transport already handles binary files without format-specific changes. The main improvements are a shared extension policy, accurate EPUB metadata, visible feedback for unsupported selections, and tests using real files.

The branch `codex/pr-21-book-formats` starts from main at `815d1b3` and cherry-picks the PR commit `cac1ea7` as `d6bd904`, followed by the improvements below.

## Review findings and changes

| Finding in the original PR | Change on this branch |
| --- | --- |
| Supported extensions are duplicated in the picker and API client. | `constants/BookFormats.ts` owns `SUPPORTED_EXTENSIONS` and `isSupportedBook`. The picker, library rows, move-sheet rows, and mock fixture loader reuse it. |
| XTC and XTCH are marked `isEpub`. | The firmware meaning stays EPUB-specific. Library and move-sheet book icons use `isSupportedBook` directly. The final API client matches main; no response fields or transport behavior change. |
| The picker supplies EPUB, octet-stream, and wildcard MIME entries together. | It supplies only `type: '*/*'`, then checks filename extensions. The narrower entries add nothing when the wildcard is present. |
| Unsupported selections disappear with only a debug log. | An alert reports skipped files and accepted formats. Supported files in a mixed selection still queue. |
| The PR has manual Android evidence but no automated regression coverage or XTC fixtures. | Both mock backends serve real EPUB/XTC/XTCH samples. New integration tests exercise actual app code and a Maestro flow captures the formats and XTCH action sheet. |

## Why the MIME wildcard remains

The PR uses the MIME wildcard `*/*`; `**/*` would be a filesystem glob and is unrelated to this picker API. Expo DocumentPicker accepts MIME types, without an extension allowlist. In the [installed iOS implementation](https://github.com/expo/expo/blob/sdk-54/packages/expo-document-picker/ios/DocumentPickerModule.swift), `*/*` becomes `UTType.item`; MIME strings become Uniform Type Identifiers. Android uses `ACTION_OPEN_DOCUMENT` with the supplied MIME filters.

An EPUB plus octet-stream filter only admits XTC/XTCH when the document provider labels them octet-stream. Providers can instead return a vendor type or a generic unknown type. Keeping the wildcard plus the shared extension check avoids relying on provider labels. Restricting the native picker itself to these three extensions would require platform-specific type registration or native picker work, plus tests against multiple providers. That is larger than this PR.

## Firmware contract

[Firmware 1.3.0](https://github.com/crosspoint-reader/crosspoint-reader/blob/8959836e462d4deff7fddb92b82a9b10c34ccddf/src/network/CrossPointWebServer.cpp) defines `isEpub` using `FsHelpers::hasEpubExtension`, includes that flag in `/api/files`, and downloads other formats as `application/octet-stream`. This branch preserves those meanings. A book icon describes the app's supported formats independently of the firmware flag.

The mock's memory backend now retains fixture and uploaded bytes through rename and move. Its WebSocket completion message follows persistence, making successful transfers testable by downloading the stored bytes.

## Fixtures and validation

The samples come from a downloaded [public-domain Project Gutenberg EPUB](https://www.gutenberg.org/ebooks/4), converted to real XTC and XTCH files with the original notices included. They are not prebuilt XTC/XTCH downloads. [Fixture provenance and regeneration instructions](../../test-fixtures/book-formats/README.md) record the source, converter revision, settings, and hashes.

Validation completed:

- `npm run test:basic`: 14 EPUB tests, 10 delete-contract tests, and all 9 reported book-format tests pass. The new tests cover cancellation, mixed and unsupported selections, unknown MIME types, uppercase extensions, icons in both themes, fixture structure, and actual API/WebSocket transfers against both mock backends. Uploads, downloads, rename, move, and delete are checked with real files.
- `npm run check:bundles`: iOS and Android exports pass.
- `npm run build:android:apk`: release APK builds successfully.
- Android Maestro: setup, connected library, and supported-format flows pass 3/3. The new flow also passes separately with explicit assertions for Save, Rename, Move, and Delete.
- Android screenshots were inspected and two Pixel 7 light baselines saved. Each format has the same blue book icon; the XTCH action sheet exposes all expected actions.
- TypeScript reports the same 112 existing errors before and after the change, with none added. The project guidance documents the Tamagui RC prop-definition failures.

The picker integration test replaces the native picker boundary while exercising the real hook. The Maestro flow checks browsing and file actions on Android. It does not automate selecting files inside the OS picker, iOS screenshots, or physical-reader rendering. The Claude visual judge was not run; screenshot QA was performed directly.

## Further improvement

The native share-sheet path remains a separate gap. `plugins/withAndroidShareIntent.js` registers EPUB file MIME types, and `plugins/withShareExtension.js` loads EPUB attachments. PR 21 only changes the in-app picker and browser, so sharing XTC/XTCH from another app still needs native extension and intent-filter work. That follow-up should apply the same extension policy at import boundaries while preserving the existing Android URL-sharing behavior.
