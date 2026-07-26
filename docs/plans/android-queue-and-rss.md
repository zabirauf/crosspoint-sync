# CrossPoint Sync (Android) — RSS Auto-Fetch & Resilient Article Queue

**Status:** Revised against current code (2026-07-25) — ready for implementation
**Target repo:** fork of `zabirauf/crosspoint-sync` (AGPLv3), building for Android
**Author context:** personal fork, built and sideloaded for own use, not distributed

> **Revision note (2026-07-25):** The original draft assumed a greenfield Android
> article path. Reviewing the actual fork showed much of it already exists (share-time
> fetch, WebView+Defuddle extraction, a Zustand upload queue). Sections below are
> rescoped accordingly: the queue is an **extension of the existing Zustand
> `upload-store`**, not a new SQLite store; the WebView extraction pipeline and
> share-time fetch are marked **done**; and the ad-hoc "fix" is narrowed to the one real
> gap (retry-when-online). RSS is the genuinely net-new feature. See §1.5.

---

## 1. Background

CrossPoint Sync is an Expo/React Native app that wirelessly transfers EPUBs to an
XTEink X4 e-reader running the CrossPoint firmware. It talks to the device over two
local-network protocols:

- **HTTP REST API (port 80):** device status, file listing, folder create/delete, file download.
- **WebSocket upload (port 81):** streams books to the device in 64KB binary chunks with
  progress reporting.
- **Device discovery:** UDP broadcast on the local network (manual IP entry as fallback).

On iOS, the app also ships a Safari Web Clipper extension: the extension runs in-page
(via a bundled content script combining Defuddle + DOMPurify), extracts clean article
content client-side, and hands it to the main app, which generates an e-ink-optimized
EPUB and adds it to an **upload queue**. When the device is discovered on the network,
the queue drains automatically.

The Android build is the same codebase (Expo supports both platforms; the repo already
contains some native Kotlin) and is what's published to Google Play, but Android lacks
an equivalent to the iOS Safari extension. Instead, Android already fetches and converts
a shared URL **at share time** (see §1.5). The one remaining hole in that path is the
"shared while completely offline" case — e.g. already connected to the X4's own Wi-Fi
hotspot, which has no internet access — where the fetch fails and the item is simply
dropped rather than retried when connectivity returns.

This document covers two related features that share infrastructure:

1. **RSS auto-fetch (net-new):** automatically pull new articles from user-configured RSS
   feeds (optionally filtered by keyword) and queue them as EPUBs, ready to sync next time
   the device connects.
2. **Resilient ad-hoc article queue (narrow fix):** share-to-app already fetches and
   converts immediately; add a retry-when-online path so a share made with no connectivity
   is queued rather than lost.

Both features produce the same artifact — a queued, ready-to-upload EPUB — and share the
existing queue store, EPUB generation pipeline, and upload trigger.

---

## 1.5 Current state — what already exists in the fork

Verified against the code on 2026-07-25. This reframes the rest of the doc:

| Capability | Status | Where |
| --- | --- | --- |
| Android share intent → text/URL received | **Done** | `modules/share-intent-receiver/`, `services/android-share-import.ts` |
| Share-time fetch → extract → EPUB → queued `pending` job | **Done** | `android-share-import.ts::handleTextItem` |
| WebView + Defuddle/DOMPurify extraction (with fetch+regex fallback) | **Done** | `services/webview-article-extractor.ts`, `components/HiddenWebViewExtractor.tsx`, `services/generated/defuddle-webview-bundle.ts`, `services/url-article-extractor.ts` |
| EPUB generation | **Done** | `services/epub-generator.ts` |
| Persistent upload queue + lifecycle + processor + card UI | **Done** | `stores/upload-store.ts`, `services/upload-queue.ts`, `components/UploadJobCard.tsx` |
| Retry a share that failed because there was **no connectivity** | **Missing** | new — see §4.2 |
| RSS feeds (config, fetch, filter, schedule) | **Missing** | new — see §4.1, §7.2 |
| Queue items tagged by source (RSS feed vs. share) | **Missing** | new — small `UploadJob` field additions, §7.4 |

**Existing job lifecycle** (`types/upload.ts`): `processing → pending → uploading →
completed`, plus `failed | cancelled | conflict`. The queue persists `pending/failed/
conflict` jobs across restarts (`upload-store.ts` `partialize`). New work extends this
enum with a single `pending-fetch` state rather than replacing it.

---

## 2. The ask

> As the device owner, I want articles — from RSS feeds I follow, and from ad-hoc links
> I share to the app during the day — to be fetched, converted, and staged automatically,
> so that whenever I connect my phone to the X4 (including via the X4's own hotspot,
> which has no internet), everything queued is already ready to transfer with no
> additional network dependency at that point.

Two concrete failure modes being fixed:

- **RSS:** currently nothing exists — no automated ingestion of feed content at all.
- **Ad-hoc share:** already fetches and converts at share time; the remaining failure is
  narrow — a share made with **no connectivity at all** is marked `failed` and dropped
  (`android-share-import.ts` catch block) rather than parked and retried when the network
  returns. This is distinct from "no device present," which the queue already handles.

---

## 3. Goals / non-goals

**Goals**

- Fetch new RSS items on a schedule (or on demand), filter by keyword, convert to EPUB,
  and queue.
- Fix Android sharing so URL → fetch → extract → EPUB → queue happens at share time,
  fully decoupled from device presence.
- One persistent, on-disk queue shared by both sources (RSS + ad-hoc share), surfaced in
  a simple UI screen.
- Queue drains automatically using the existing discovery + WebSocket upload pipeline —
  no changes needed to device-facing protocol code.
- Robust to the "shared with zero internet at all" edge case (distinct from "no device
  present") via a retry-when-online path.

**Non-goals (for this iteration)**

- iOS parity for these two features (Safari extension already solves the equivalent
  problem for the ad-hoc case on iOS; RSS could be added later but isn't in scope here).
- Full-text extraction quality tuning beyond what Defuddle already provides.
- Feed discovery/OPML import UI polish — a minimal add-feed-by-URL flow is sufficient.
- Server-side/cloud component — everything runs on-device.

---

## 4. Functional requirements

### 4.1 RSS auto-fetch

- User can add one or more RSS/Atom feed URLs.
- Per feed, optional keyword filter list (article queued only if title/summary matches
  at least one keyword; empty list = no filtering, queue everything new).
- Periodic background fetch (interval configurable; also support manual "check now").
- Track per-feed "last seen" item (by GUID/link) so re-runs only queue genuinely new items.
- Each matching item goes through the same fetch → extract → EPUB → queue path as ad-hoc
  shares (see 4.2), since most feeds only provide summaries, not full article HTML.
- Queued RSS items should be visually distinguishable from ad-hoc shares in the UI
  (e.g. tagged with source feed name), but treated identically by the upload pipeline.

### 4.2 Ad-hoc article queue (narrow fix)

Already implemented (see §1.5): sharing a URL immediately triggers fetch → extract →
EPUB → `pending` queue entry, fully decoupled from device discovery. **The only new
work** is the offline case:

- If the share-time fetch throws due to **no connectivity at all** (not just no device),
  the item is queued in a `pending-fetch` state instead of `failed`, retaining the source
  URL and any metadata.
- A network-state listener (`@react-native-community/netinfo`) retries `pending-fetch`
  items when connectivity returns, running each back through the existing
  `extractViaWebViewWithFallback → generateEpub → finalize` path.
- Distinguish "no connectivity" from other extraction failures (paywall, parse error) so
  the latter go to `failed`, not an infinite `pending-fetch` retry loop.
- Existing upload-on-device-connect behavior is unchanged.

### 4.3 Shared queue / UI

- **Reuse the existing Zustand `upload-store`** (not a new SQLite store). All three
  writers — share intent handler, RSS job, upload processor — run in the same
  single-threaded JS runtime, so there is no real write-concurrency problem to solve. The
  RSS background job is the only writer that may run in a separate headless JS context;
  it enqueues via the same store API (which persists to AsyncStorage) rather than a
  parallel DB.
- Extend the existing status enum with **one** new value, `pending-fetch`, keeping the
  current lifecycle (`pending → uploading → completed`, `failed`, `cancelled`,
  `conflict`). No wholesale enum rewrite or data migration.
- Add source fields to `UploadJob`: `source` (`'rss' | 'share'`), `sourceLabel` (feed
  name, optional), `originalUrl` (for `pending-fetch` retry).
- A queue screen listing jobs grouped/filterable by status, showing a source badge (feed
  name / "Shared") and basic metadata (title, date added). Reuse `UploadJobCard`.
- Manual controls: retry failed item, remove item — both already exist in the store
  (`retryJob`, `removeJob`).

---

## 5. Non-functional requirements

- **No new dependency on device presence** for anything in the fetch/convert path —
  this is the core bug being fixed, so it should be treated as an invariant, not just a
  target.
- **Offline-safe:** app must not crash or silently drop items when there's no
  connectivity at share-time or fetch-time; everything degrades to a retryable queued state.
- **Battery/background friendly:** RSS polling should use a reasonable interval
  (e.g. 30–60 min default, user-configurable) and Android's background task
  constraints (WorkManager-backed, not a naive setInterval/JS timer that dies when the
  app is backgrounded).
- **Reuse, don't fork, the existing EPUB generation and upload code** — both new
  features are new *inputs* to the existing pipeline, not parallel implementations.

---

## 6. Architecture overview

```
                ┌─────────────────────┐        ┌──────────────────────┐
  RSS feeds ───▶│  RSS Fetch Service   │        │  Share Intent Handler │◀─── Android share sheet
  (background)  │  (WorkManager job)   │        │  (foreground, on share)│
                └──────────┬───────────┘        └───────────┬───────────┘
                           │  new item URLs                  │ shared URL
                           ▼                                  ▼
                ┌─────────────────────────────────────────────────┐
                │   Article Extraction Pipeline  [EXISTS]           │
                │  hidden WebView → injected Defuddle+DOMPurify      │
                │  bundle → clean HTML back via JS bridge            │
                │  (fetch+regex fallback)                           │
                └──────────────────────┬──────────────────────────┘
                                       ▼
                ┌─────────────────────────────────────────────────┐
                │   EPUB Generator (e-ink styled)  [EXISTS]         │
                └──────────────────────┬──────────────────────────┘
                                       ▼
                ┌─────────────────────────────────────────────────┐
                │   Zustand upload-store (AsyncStorage)  [EXISTS]   │
                │   status: processing|pending|uploading|completed| │
                │           failed|cancelled|conflict               │
                │   + NEW: pending-fetch, source, sourceLabel, url  │
                └──────────────────────┬──────────────────────────┘
                                       ▼
                ┌─────────────────────────────────────────────────┐
                │  Existing: UDP Discovery → WebSocket Upload (81)   │
                │  (unchanged — just now drains a pre-populated queue)│
                └─────────────────────────────────────────────────┘
```

Key design principle: **fetch/convert happens as early as possible (share time or
RSS-poll time); upload happens as late as possible (device-connect time).** These two
halves should not share a code path that makes one wait on the other.

---

## 7. Component detail

### 7.1 Article extraction pipeline — **ALREADY EXISTS, reuse as-is**

This section described the extraction pipeline as net-new; it is in fact fully
implemented and needs no new work for either feature. For reference, the existing pieces:

- `components/HiddenWebViewExtractor.tsx` — hidden/off-screen `WebView`.
- `services/generated/defuddle-webview-bundle.ts` — the bundled Defuddle+DOMPurify
  extraction script injected into the WebView.
- `services/webview-article-extractor.ts` — promise bridge (`extractArticleViaWebView`)
  with a 15s timeout; resolves cleaned HTML + image URLs via `postMessage`.
- `services/url-article-extractor.ts` — `fetch()`+regex fallback when the WebView path
  fails, plus `downloadImagesFromUrls`.
- Orchestrated by `android-share-import.ts::extractViaWebViewWithFallback` (WebView first,
  fetch+regex fallback).

**RSS reuses this unchanged**: hand each new item's link to
`extractViaWebViewWithFallback` (extract that helper into a shared module so RSS can call
it without importing the share-intent file). The only new behaviour is classifying a
failure as `pending-fetch` (offline) vs `failed` (§4.2).

### 7.2 RSS Fetch Service

- Android `WorkManager` periodic job (survives backgrounding/reboot better than a JS
  timer).
- Per feed: fetch/parse (e.g. `rss-parser`), diff against stored `lastSeenItemId`,
  filter by keyword list, hand each new matching item's link to the extraction pipeline
  (7.1) → EPUB generator → queue.
- Feed config (URL, keywords, last-seen ID, enabled/disabled) persisted alongside the
  queue store.

### 7.3 Share Intent Handler — **mostly exists; add offline branch only**

The `ACTION_SEND` intent filter, native receiver, and synchronous foreground
fetch→extract→EPUB→`pending` flow already exist (`android-share-import.ts::handleTextItem`,
`modules/share-intent-receiver/`). Only change needed:

- In the `catch` (currently `updateJobStatus(jobId, 'failed', …)`): detect
  no-connectivity errors and set `pending-fetch` (retaining `originalUrl`) instead of
  `failed`, so §4.2's connectivity listener can retry. All other failures stay `failed`.

### 7.4 Queue Store — **extend existing Zustand `upload-store`, no SQLite**

Decision (2026-07-25): reuse `stores/upload-store.ts`. Rationale in §4.3 (single-threaded
JS runtime → no real concurrency to solve; a whole new SQLite store would fork the
processor + `UploadJobCard` UI + persistence that already work).

Changes to `types/upload.ts` `UploadJob`:

```ts
status: … | 'pending-fetch'      // NEW — offline share/RSS item awaiting fetch retry
source?: 'rss' | 'share'          // NEW — provenance for the queue badge
sourceLabel?: string              // NEW — feed name (RSS); undefined ⇒ "Shared"
originalUrl?: string              // NEW — needed to retry pending-fetch items
```

- Persist `pending-fetch` jobs too (add to the `partialize` filter alongside
  `pending/failed/conflict`) so an offline share survives an app restart. Do **not** reset
  its status to `pending` on rehydrate the way the others are.
- RSS feed config is a **separate small store** (`stores/rss-store.ts`, Zustand +
  AsyncStorage), not part of the queue:

  ```ts
  interface RssFeed {
    id: string;
    url: string;
    keywords: string[];          // empty = no filter
    lastSeenItemId: string | null;
    enabled: boolean;
    pollIntervalMinutes: number;
  }
  ```

### 7.5 Upload trigger (existing, unchanged)

- `services/upload-queue.ts` already drains `pending` jobs via discovery + WebSocket
  upload. Since we reuse the same store, **no change** is needed here — new items just
  become `pending` once their EPUB is ready.
- The processor should continue to ignore `pending-fetch` items (they have no
  `fileUri` yet); confirm `getPendingJobs` only returns `status === 'pending'` (it does).
- Retention: `completed` jobs already persist for history via existing logic; apply the
  §9 cleanup policy if the list grows unbounded.

### 7.6 UI additions

- **Queue screen:** list of `UploadJob`s, grouped by status, showing source badge
  (`sourceLabel` / "Shared"), title, timestamp. Actions: retry (failed items), remove —
  wired to the store's existing `retryJob` / `removeJob`. Reuse `UploadJobCard`.
- **RSS settings screen:** add/remove feed by URL, per-feed keyword list editor,
  enable/disable toggle, manual "check now" button, poll interval setting.

---

## 8. Build/platform notes

- Codebase is Expo/React Native; Android build via `npx expo run:android` (requires a
  native dev build — Expo Go won't work due to `react-native-udp` and other native
  modules).
- Repo already contains native Kotlin modules (`modules/share-intent-receiver`,
  `modules/multicast-lock`) and the hidden WebView extractor — confirm coverage before
  adding native code. The share pipeline and extraction pipeline need **no** new native
  work; RSS scheduling is the only piece that may.
- New deps to add: `@react-native-community/netinfo` (connectivity listener, §4.2) and a
  feed parser (`rss-parser` or a small custom XML parse). Both are JS-only.
- License is AGPLv3 (confirmed from the repo's LICENSE file) — personal build/fork/use
  requires no source disclosure; only publishing or letting others use a modified
  version over a network would trigger that.
- Background RSS polling: prefer the higher-level `expo-background-task` (the SDK 54
  successor to the deprecated `expo-background-fetch`; WorkManager-backed on Android) over
  hand-rolled native WorkManager. Neither `expo-task-manager` nor a background lib is
  currently in `package.json`, so this is a net-new dependency + config-plugin step. A
  foreground-only "check now" button works without any of this and is worth shipping
  first.

---

## 9. Open questions / risks

- **WebView extraction reliability:** some sites may detect/block headless-ish WebView
  loads (bot detection, paywalls). Acceptable initial scope: best-effort, with clear
  `failed-fetch` state and manual retry — not a guarantee of 100% extraction success.
- **Background execution limits:** Android's Doze/App Standby may delay WorkManager
  jobs; RSS polling should be treated as "eventually, roughly on schedule," not
  precisely timed.
- **Queue growth/cleanup:** decide a retention policy for `uploaded` items (e.g. keep
  last N days) so the queue store doesn't grow unbounded.
- **Duplicate detection:** if the same article is both RSS-queued and separately shared,
  decide whether to dedupe by URL.

---

## 10. Suggested implementation order (revised)

Steps 1–3 of the original order are already done (§1.5). Extraction pipeline and
share-time fetch exist; the queue is the existing Zustand store. Revised order:

1. **Store extension** — add `pending-fetch` status + `source`/`sourceLabel`/`originalUrl`
   to `UploadJob`; update `partialize` to persist `pending-fetch`. Extract
   `extractViaWebViewWithFallback` into a shared module. (Small, foundational.)
2. **Offline-share retry (§4.2)** — add `@react-native-community/netinfo`; classify
   no-connectivity failures as `pending-fetch`; retry on connectivity return. Closes the
   one real ad-hoc gap and builds the retry path RSS will reuse.
3. **RSS feed store + fetch service (§7.2)** — `rss-store.ts`; fetch/parse, diff vs
   `lastSeenItemId`, keyword filter, feed each new item through the shared extraction
   helper → queue with `source: 'rss'`. Ship with a foreground "check now" first.
4. **Queue screen UI** — reuse `UploadJobCard`, add source badge + status grouping.
5. **RSS settings screen UI** — add/remove feed, keyword editor, enable toggle, interval,
   "check now".
6. **Background scheduling** — wire the RSS fetch into `expo-background-task` (config
   plugin + interval). Last, since foreground "check now" already delivers the feature.

> Per the user's stated preference, land the store extension + queue plumbing (steps 1–2)
> before starting RSS (steps 3+).

---

## 11. Implementation progress

Branch: `store-extension-and-rss`.

- **✅ Step 1 — store extension** (commit `31254dc`). `pending-fetch` status +
  `source`/`sourceLabel`/`originalUrl` on `UploadJob`; `partialize` persists
  `pending-fetch` without rewriting it to `pending`; shared
  `extractViaWebViewWithFallback` moved to `services/article-extraction.ts`.
- **✅ Step 2 — offline-share retry** (commit `a35d9d7`). Added
  `@react-native-community/netinfo` 11.4.1. New `services/article-queue.ts`
  (`runArticleExtractionJob` + `isOffline`) is the single URL→EPUB→queue path shared by
  the share handler and the retry listener (and, later, RSS). New
  `services/pending-fetch-retry.ts` re-drives `pending-fetch` jobs when internet is
  *confirmed* reachable; wired into the effect in `app/_layout.tsx`. `isOffline` treats
  NetInfo's unknown reachability (`null`) as offline so the first share on the X4's
  isolated hotspot is parked as retryable rather than hard-failed.
  - Separate chore commit `d87d4ad` carries the `npm audit fix` `package-lock.json` churn.

- **✅ Step 3 — RSS (foreground).** Parser decision: **`fast-xml-parser@4.5.7`**, not
  `rss-parser` (depends on `xml2js` + node `http`, not RN-safe) and not hand-rolled.
  Pinned to the 4.x line deliberately: 5.10.1 was refactored (July 2026) into six
  sub-packages, while 4.5.7 is the same maintainer, still updated, and carries only
  `strnum`. Node builtins appear solely under `src/cli/`, which the package entry never
  imports, and `expo export --platform android` bundles clean.
  - New: `types/rss.ts`, `constants/Rss.ts`, `services/rss-parser.ts` (RSS 2.0 / RSS 1.0
    RDF / Atom → normalized `ParsedFeed`), `stores/rss-store.ts`, `services/rss-fetch.ts`
    (`subscribeToFeed` / `checkFeed` / `checkAllFeeds`), `app/rss-feeds.tsx`.
  - RSS items go through `runArticleExtractionJob` with `source: 'rss'` and
    `sourceLabel: <feed title>`, so offline parking and retry come for free from step 2.
  - Behaviour decisions: first check queues at most `FEED_INITIAL_ITEM_LIMIT` (3) items
    so subscribing doesn't kick off a 50-article burst; later checks cap at
    `FEED_MAX_ITEMS_PER_CHECK` (10); keyword filter is case-insensitive substring over
    title + summary, empty list = queue everything new; `lastSeenItemId` advances to the
    newest item in the document even when items are filtered out, so rejected items are
    never re-evaluated.
  - `parseTagValue: false` is load-bearing: fast-xml-parser's default numeric coercion
    turns a title of "E1" into `null` (exponent notation) and "2024" into a number.
  - A single `checking` flag serializes all checks — the per-feed refresh button and
    "Check Now" share one hidden WebView extractor.
  - Tests: `npm run test:rss` (23 synthetic cases) and `npm run test:rss:live`
    (4 real feeds), via `scripts/rss-parser-test.ts`.

- **⏭ NEXT — Step 4, queue UI**, then step 5 RSS-settings polish, then step 6 background
  scheduling (`expo-background-task`) to replace the manual "Check Now".

**Verification gaps to close before shipping:**
- Step 2's NetInfo behavior is static/type-checked only — never run. Needs an Android dev
  build (`npx expo run:android`; JDK 17 + Android SDK not yet installed) to exercise the
  reachability probe and retry firing.
- Step 3's parser and store logic are covered by `npm run test:rss`, but the *screen* and
  the end-to-end RSS→EPUB→queue path have never run on a device — same missing Android
  build. `.maestro/flows/16-rss-feeds.yaml` and `.maestro/visual-tests/rss-feeds.yaml`
  are authored but unrun, and no reference screenshots exist for them yet.
- `tsc` baseline is 116 pre-existing Tamagui v2 RC errors (all spurious per CLAUDE.md);
  steps 1–2 added zero new errors, step 3 adds 9 more of the same spurious class (125
  total), all in `app/rss-feeds.tsx` and `app/(tabs)/settings.tsx`.