# Folder creation error handling (A1.P2) — 2026-11-08

CrossPoint's [`handleCreateFolder` in 2.0.0](https://github.com/crosspoint-reader/crosspoint-reader/blob/2.0.0/src/network/CrossPointWebServer.cpp#L1051)
returns HTTP 400 for missing, empty, or unsafe names, and for an existing item.
The existing-item check does not distinguish a file from a directory. Protected
names return 403; failed storage creation returns 500. The older
[1.1.1 handler](https://github.com/crosspoint-reader/crosspoint-reader/blob/1.1.1/src/network/CrossPointWebServer.cpp#L691)
also uses 400 for missing/empty names and existing items.

The app now accepts a 400 "Folder already exists" or a 409 conflict only when
listing the parent confirms a directory with that name, case-insensitively for
FAT32. Validation, protected-item and storage errors retain the HTTP status and
firmware response text. Failed, malformed, disconnected or empty verification
listings cannot turn a conflict into success. Verification uses the same endpoint
and scheduler slot as mkdir, avoiding a nested single-slot scheduler deadlock.

`ensureRemotePath` catches listing failures separately from mkdir failures. It
attempts creation once and caches a segment only after finding or successfully
creating/verifying its directory. A failed mkdir no longer gets retried by the
listing fallback.

Validation:

- `npm run test:folders`: all 19 checks pass using real HTTP requests, multipart
  fields, the production API module and the production request scheduler. Only
  native and persistent-storage boundaries are stubbed.
- iOS and Android production exports pass.
- Typechecking retains existing Tamagui UI errors; the changed API module and
  new protocol test have no diagnostics.
- The final complete `npm run test:basic` passes (78 checks). An earlier aggregate
  run hit the intermittent queue recovery timeout also observed before this change;
  the isolated suite and final aggregate passed. No queue production code was
  changed. No physical reader was used for these fault cases.

This fixes the demonstrated A1.P2 false-success path. It does not establish the
cause of every reported connection or folder-navigation failure.
