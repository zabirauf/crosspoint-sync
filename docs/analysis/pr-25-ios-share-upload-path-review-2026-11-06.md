# PR #25: iOS shared-book upload path review

Reviewed on 2026-11-06 against latest `main` (`ddad6d8`) and
[PR #25](https://github.com/zabirauf/crosspoint-sync/pull/25)
(`366c6e75917a15abe66abf035f013ee75b2ee674`).

## Verdict

The reported bug is real and remains present on current main. The PR chooses
the correct destination and handles successful, delayed settings hydration.
It needs a settings-read failure path and a merge conflict resolution before
integration.

## Evidence for the reported issue

- `plugins/withShareExtension.js` writes `destinationPath: "/"` into every
  shared-file manifest. It has no access to the app's AsyncStorage preference.
- Main's `services/share-import.ts` copies that manifest field directly into
  each new upload job, so a configured `/Books` destination is ignored.
- All four original PR tests fail against main and pass against the PR's
  original importer. This includes `/Books`, delayed settings loading,
  preference changes between imports, and an explicitly configured root.
- `app/_layout.tsx` waits for upload-store hydration on launch, but settings
  hydrate independently. Waiting for the settings read is necessary before
  choosing the shared-book destination.
- Reading `defaultUploadPath` when creating a new job leaves existing jobs'
  destinations intact. Clipped articles use `clipUploadPath` in a separate
  importer; the in-app picker receives an explicit destination. The proposed
  path selection does not change those paths.

## Additional findings

### P2: settings-read failures leave the PR's importer waiting indefinitely

The PR waits for `useSettingsStore.persist.onFinishHydration`. Zustand 5.0.11
only calls this listener on success. A rejected AsyncStorage read or invalid
stored JSON calls `onRehydrateStorage`'s completion callback with an error,
leaves `hasHydrated()` false, and never notifies the PR's listener. An import
started during or after the failure never completes; later foreground imports
also wait without retrying the settings read.

The expanded regression suite uses the real settings store and installed
Zustand middleware with controlled storage reads. Four error/recovery tests
fail against the original PR code, reproducing failed reads during import,
failure before import, recovery on a later attempt, and malformed JSON.

The follow-up tracks the current settings read through `onRehydrateStorage`.
Importers reuse the startup read and settle after either success or failure.
On failure, import returns zero before moving files, deleting manifests, or
running shared-file cleanup. A later import retries hydration and queues the
preserved file only after the saved path is recovered. Successful hydration
with no stored settings still uses the normal `/` default.

### Integration: package.json conflicts with current main

Both branches changed `test:basic`. The follow-up starts at PR #25's original
commit, merges latest main, and retains every existing suite while appending
`test:share-import`. The contributor's original commit remains in history.

## Validation of the follow-up

| Check | Result |
| --- | --- |
| Original PR tests against main / original PR | 0/4 pass / 4/4 pass |
| Expanded tests against original PR implementation | 5/9 pass; four error/recovery cases fail |
| Final share-import suite | 9/9 pass |
| `npm run test:basic` | 59 pass: 14 EPUB, 10 delete, 15 book formats, 7 visual runner, 4 adaptive, 9 share import |
| iOS Expo export | Pass; existing Tamagui configuration/parse warnings |
| `npm run typecheck` | 101 diagnostics, identical to main; no added or removed diagnostic lines |
| `git diff --check` | Pass |

The filesystem and upload queue are in-memory dependencies in the share tests;
settings persistence runs the actual application store and Zustand middleware.
The basic suite's device API/WebSocket tests also pass. No physical iPhone
share-sheet test was performed. A device check should set Upload Path to
`/Books`, share an EPUB on a cold launch and while foregrounding, then repeat
after changing the setting and confirm each new job's destination.
