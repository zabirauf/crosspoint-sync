# ACSM uploads and Protected Content fulfillment — research (2026-11-21)

Request: [zabirauf/crosspoint-sync#30](https://github.com/zabirauf/crosspoint-sync/issues/30).
Allow `.acsm` files through the same share → upload-queue path as EPUBs, and,
when possible, have the reader turn them into books through the **Protected
Content** SD plugin.

## What an `.acsm` is

An Adobe Content Server Message is a few KB of XML (root
`<fulfillmentToken xmlns="http://ns.adobe.com/adept">`). It is a fulfillment
*token*, not a book. Libby/OverDrive and many stores hand it out for the
"Adobe EPUB" option. A licensed ADEPT client, such as Adobe Digital Editions or
an activated e-reader, exchanges it with the `operatorURL` for an encrypted
EPUB plus its license. Nothing here removes DRM: the book stays encrypted on the
card and loans still expire.

## Firmware evidence (crosspoint-reader)

Checked against `crosspoint-reader` `develop` at `ca1a8c1` (2026-11-20) and
release tags. The plugin job queue, `/plugins-run`, `/api/book-key` and
`lib/Epub/ContentProtection.cpp` are absent from tags 1.4.1, 1.5.0, 1.6.0 and
1.6.5. They are present in **2.0.0**.

| Need | Firmware (2.0.0+) |
| --- | --- |
| Store the `.acsm` | WebSocket `START:<name>:<size>:<path>` has no extension filter (`CrossPointWebServer::onWebSocketEvent`). Only sensitive/hidden paths are refused. |
| Detect the plugin | `GET /api/plugins` → `[{name, dir, title, mount, …}]`. While plugins are disabled the route still answers, but with `[]` (`PluginLocations::scanPlugins` checks `SETTINGS.pluginsEnabled`), so a disabled plugin looks absent. 2.0.0 omits `hasPluginJs`, which `develop` adds. |
| Trigger an action | `POST /api/plugin-jobs {plugin, action, args}` → `{id}`. Returns `403 plugin system disabled` when **Settings → Connectivity → Plugins** is off, `400` for bad names or for args of 192+ bytes of JSON, and `503` when the 6-slot pool is full. |
| Run it | Jobs run only while a page hosting the plugin is open. `GET /plugins-run` is the headless host: it loads every plugin with its UI hidden, and `plugin-host.js` claims jobs every 2.5 s. |
| Track it | `GET /api/plugin-jobs/status?id=` → `{id, state, result}` with `pending`, `running`, `done`, `error` or `unknown` (slot recycled). A claimed job's lease is 10 minutes. |
| Read the book | `ContentProtection` decrypts OCF `encryption.xml` entries on read with the key the plugin stored via `POST /api/book-key` (`<book>.key`, wrapped to the device). |

See the firmware's `docs/sd-plugins.md` (“Surface 2: the plugin job queue” and
“Protected content and loan expiry”) and `docs/webserver-endpoints.md`.

## The Protected Content plugin

Plugin Hub (`crosspoint-plugin-hub` `catalog.json`) lists `protected-content`
1.0.5 by Diirge, `mount: files`, served from a Railway host rather than GitHub.
That host was not reachable from the research environment. Its job contract
was read from a published copy (v1.0.0, `dezren39/sd-plugins`
`protected-content/plugin.js`) and confirmed by two independent callers:

```js
//   POST /api/plugin-jobs {plugin:"protected-content", action:"fulfill", args:{path:"/folder/book.acsm"}}
api.registerAction('fulfill', async (args) => {
  const path = String((args && args.path) || '');
  if (!path.startsWith('/')) throw new Error('args.path must be an absolute .acsm path');
  if (!session || !session.act || !session.act.deviceUuid) {
    throw new Error('device not activated; open the plugin UI once to sign in');
  }
  const acsmResponse = await fetch('/download?path=' + encodeURIComponent(path));
  ...
  const r = await fulfill(await acsmResponse.text(), destDir);   // book lands beside the .acsm
  await writeCredential();
  await deleteFile(path);                                        // .acsm removed on success
  return { title: r.title, dest: r.dest, bytes: r.bytes || 0 };
});
```

- A `libby` plugin (josmerod, preserved in forks) enqueues exactly
  `{plugin:'protected-content', action:'fulfill', args:{path}}` and polls status.
- `ruqqq/crosspoint-plugins` `libby/plugin.js`, which shares most of this
  engine, registers the same `fulfill(args.path)` contract under its own name.
- The plugin also registers `renew {book, acsm}`; this change does not use it.
- On initialization the plugin restores its session from the credential on SD.
  The headless runner therefore needs no UI interaction once the user has
  signed in, one time, from the reader's web page (Settings/File Manager card).
- The plugin README describes a third-party desktop app that sends `.acsm`
  files to the reader in the same way ("Send To CrossPoint").

## Design chosen

1. `.acsm` is a recognized upload format (`kind: 'fulfillment'`, 0.14.0+
   through the generic uploader), so the picker, iOS Share Extension and
   Android share intent all enqueue it like an EPUB.
2. After the WebSocket upload, the same queue job enters a fulfillment phase.
   It stays `uploading` (holding the queue and keep-awake, and pausing status
   polling) while `services/acsm-fulfillment.ts`:
   - skips with guidance on firmware < 2.0.0, if the plugin is missing or
     plugins are disabled — the `.acsm` stays on the card for later use;
   - enqueues `protected-content/fulfill {path}`;
   - opens `/plugins-run` in a hidden 1×1 WebView (`HiddenPluginRunner`);
   - polls status until `done`/`error`, with start and overall timeouts and
     tolerance for transient status failures while the reader streams the book.
3. Results: **done** → completed with "Fetched “title” to /path.epub" and a library
   refresh. **skipped** → completed, and the note remains in the queue sheet until
   dismissed. **error** → failed with the plugin's reason ("not signed in" is
   reworded into the fix). Retry reuses the `.acsm` already on the card without
   uploading it again.
4. Backgrounding does not restart a job in its fulfillment phase, because that
   would upload the `.acsm` again. "Stop Waiting" stops polling only; the
   reader may still finish a job it has claimed.

## Firmware simulator check (CrossPoint 2.0.0)

Pinned: firmware `2.0.0` (`42d58da`), FreeInk SDK `5e94fe7`, simulator
`04332e7`, X4 profile, `CROSSPOINT_VERSION=2.0.0-simulator`, Linux host,
`SDL_VIDEODRIVER=dummy`. The actual app queue, WebSocket uploader, device API
and plugin-job client ran under Node (`scripts/acsm-simulator-check.ts`). Headless
Chromium loaded the firmware's own `/plugins-run` page whenever the app requested
a runner, standing in for the native hidden WebView. Each case used a fresh SD
directory.

| Case | SD setup | Result |
| --- | --- | --- |
| 1 | empty (plugins default off) | `/api/plugins` `[]`, `POST /api/plugin-jobs` `403 plugin system disabled`. The `.acsm` was stored by the firmware WebSocket handler (1312 B). The job completed as **skipped**, and no runner opened. |
| 2 | test-adapter plugin, `pluginsEnabled: 1` | Job 1 was queued, claimed by the firmware `plugin-host.js` in `/plugins-run` and completed. The EPUB appeared beside the `.acsm`, which was removed. The job completed as **done**: "Fetched “The Gettysburg Address” to /Library/The Gettysburg Address.epub". The downloaded EPUB SHA-256 matches the fixture. |
| 3 | as 2, adapter used multipart `/delete` | The plugin's thrown error came back through `/api/plugin-jobs/complete` → status `error`. The job **failed** with that message and the `.acsm` was kept. |
| 4 | plugin installed, `pluginsEnabled: 0` | `/api/plugins` `[]`. The job was **skipped** with guidance that now mentions turning plugins on. Before this run, the message assumed an empty list meant "not installed". |

Test adapters, described so the boundary is clear:

- A local, uncommitted firmware patch opened File Transfer → Create Hotspot at
  boot (`CROSSPOINT_TEST_AUTO_HOTSPOT`). Synthetic key input was unreliable with
  the dummy SDL driver (later presses were dropped). The HTTP/WebSocket handlers
  were unchanged.
- `test-fixtures/acsm/simulator-protected-content/` stands in for the plugin. It
  has the same `fulfill {path}` contract but copies a fixture EPUB instead of
  performing ADEPT fulfillment, and stores no book key.
- `/Library` was created with a URL-encoded `/mkdir`. The simulator's web-server
  shim did not parse multipart form fields from Node or Chromium (`/mkdir`
  answered "Missing folder name"; case 3 `/delete`). This is a shim limitation,
  not part of this change.

Not covered: real ADEPT fulfillment and `/api/book-key`, the encrypted-EPUB
read path (the simulator skips the device content-protection binding), native
iOS/Android WebView behaviour, physical WiFi and device memory.

## Limits and follow-ups

- Real ADEPT fulfillment was not exercised: it needs the Railway-hosted plugin,
  a content account and a real loan. Tests use a mock reader whose simulated
  plugin writes a fixture EPUB (`npm run test:acsm`), plus the firmware
  simulator for the firmware-owned routes.
- The hidden WebView is a dependency of the plugin design. If the OS throttles
  an offscreen WebView, the start timeout reports it. The `.acsm` remains on the
  card, and opening the reader's File Manager in a browser also runs the job.
- Android has no `.acsm` MIME mapping, so `application/octet-stream` shares
  are accepted and then filtered by recognized extension. "Open with" (VIEW)
  intents are not registered.
- The plugin enforces that the content account is activated. The app cannot
  sign in on the user's behalf and does not attempt to.
