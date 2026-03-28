# RSS Feeds Feature — Implementation Plan

## Context

CrossPoint Sync currently supports uploading EPUBs and clipping web articles (via Safari Extension on iOS, share intent on Android) to an XTEink e-ink reader. Users have no way to subscribe to RSS feeds and route articles to their device. This plan adds a full RSS feed experience: subscribe, browse a timeline, preview articles in a minimal reader, and queue them as EPUBs for upload — reusing the existing EPUB generation and upload pipeline.

---

## Phase 0: Type Definitions & Constants

**Goal**: Establish the data model everything builds on.

### New file: `types/feed.ts`

```typescript
export interface Feed {
  id: string;                   // Generated ID (timestamp-random)
  feedUrl: string;              // The RSS/Atom feed URL
  siteUrl: string;              // Website homepage URL
  title: string;                // Feed title from XML
  favicon: string | null;       // Favicon URL (Google S2 fallback)
  lastFetchedAt: number | null; // Epoch ms of last successful fetch
  addedAt: number;              // Epoch ms when subscribed
}

export interface FeedItem {
  id: string;                   // GUID from feed or hash of link
  feedId: string;               // FK to Feed.id
  title: string;
  link: string;                 // Article URL
  pubDate: number;              // Epoch ms
  snippet: string;              // Plain-text excerpt, max ~200 chars
  contentHtml: string | null;   // RSS <content:encoded> or <description> HTML
  isRead: boolean;
  isSentToDevice: boolean;      // True once EPUB upload job created
}

export type FeedViewMode = 'timeline' | 'sources';
```

### Modify: `types/upload.ts` (line 10)

Add `'feed'` to `UploadJobType`:
```typescript
export type UploadJobType = 'book' | 'sleep-background' | 'clip' | 'feed';
```

### New file: `constants/Feed.ts`

```typescript
export const FEED_ITEM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const FEED_SNIPPET_MAX_LENGTH = 200;
export const FEED_FETCH_TIMEOUT_MS = 15_000;
export const FEED_USER_AGENT = 'CrossPointSync/1.0 RSS Reader';
```

### Modify: `services/logger.ts` (line 3)

Add `'feed'` to `LogCategory` union.

**Verification**: `npx tsc --noEmit` compiles cleanly.

---

## Phase 1: Feed Parser Service

**Goal**: Pure functions to fetch, auto-discover, parse, and validate RSS/Atom feeds. No UI, no store.

### New file: `services/feed-parser.ts`

| Function | Purpose |
|----------|---------|
| `parseFeed(feedUrl)` | Fetch + parse RSS/Atom XML into normalized `{title, siteUrl, items[]}` |
| `discoverFeedUrl(websiteUrl)` | Fetch HTML, find `<link rel="alternate" type="application/rss+xml">` |
| `validateFeed(url)` | Confirm URL is a valid feed, return metadata |
| `resolveFeedUrl(inputUrl)` | Try direct parse -> fallback to auto-discovery -> validate |
| `extractSnippet(html, maxLength?)` | Strip tags, decode entities, truncate |
| `getFaviconUrl(siteUrl)` | Return Google S2 favicon URL for domain |

**Implementation notes**:
- `fetch()` with `FEED_USER_AGENT` header and `AbortController` timeout
- Regex-based XML parsing (no new dependency) — RSS/Atom structure is predictable enough
- Handle both RSS 2.0 (`<channel>/<item>`) and Atom (`<feed>/<entry>`) formats
- Date parsing: `<pubDate>` (RSS, RFC 2822) and `<updated>` (Atom, ISO 8601)
- `getFaviconUrl`: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

**Verification**: Test script (`scripts/feed-parser-test.ts`) run with `npx tsx` against Hacker News RSS, a WordPress blog, and an Atom feed.

---

## Phase 2: Feed Store (Zustand)

**Goal**: Persistent store for feeds and items with CRUD and cleanup.

### New file: `stores/feed-store.ts`

**State**: `feeds: Feed[]`, `items: FeedItem[]`, `viewMode: FeedViewMode`

**Actions**:
- `addFeed(feed)` → returns feed ID. ID format: `${Date.now()}-${random}` (matches upload-store pattern)
- `removeFeed(feedId)` → removes feed AND all its items
- `upsertItems(feedId, items[])` → deduplicates by item `id`, only inserts new
- `markItemRead(itemId)`, `markItemSentToDevice(itemId)`
- `updateFeedLastFetched(feedId, timestamp)`
- `purgeOldItems()` → remove items where `pubDate` older than 7 days AND `isSentToDevice === false`
- `setViewMode(mode)`
- `getTimelineItems()` → all items sorted by `pubDate` desc
- `getItemsByFeed(feedId)`, `getFeedById(feedId)`

**Persistence**: AsyncStorage, key `'crosspointsync-feeds'`, persist all state.

**Verification**: Import store temporarily in root layout, add feed + items, restart app, verify persistence.

---

## Phase 3: Feed Refresh Service

**Goal**: Orchestration to fetch all subscribed feeds and update the store.

### New file: `services/feed-refresh.ts`

| Function | Purpose |
|----------|---------|
| `refreshFeed(feedId)` | Parse feed, upsert new items, update lastFetchedAt. Returns new item count. |
| `refreshAllFeeds()` | Refresh all feeds (max 5 concurrent via `Promise.allSettled`), then `purgeOldItems()`. Returns total new items. |

- Reads feed store via `useFeedStore.getState()`
- Logs via `log('feed', ...)`
- Silent failure per-feed (log error, continue others)

**Verification**: Subscribe to a test feed, call `refreshAllFeeds()`, verify items appear in store.

---

## Phase 4: Feed-to-EPUB Service

**Goal**: Convert a feed article into an EPUB and queue for upload, reusing existing infrastructure.

### New file: `services/feed-to-epub.ts`

```typescript
export async function queueFeedArticleToDevice(itemId: string): Promise<string>
```

**Flow** (mirrors `services/clip-import.ts` pattern):
1. Read `FeedItem` from feed store
2. Generate job ID: `feed-${Date.now()}-${random}`
3. `addProcessingJob(jobId, safeFileName, 'feed')` — from `stores/upload-store.ts`
4. `extractArticleFromUrl(item.link)` — from `services/url-article-extractor.ts`
5. `generateEpub({title, author, sourceUrl, html, images, clippedAt})` — from `services/epub-generator.ts`
6. `finalizeProcessingJob(jobId, {fileName, fileUri, fileSize, destinationPath})` — destination from `settings-store.clipUploadPath`
7. `markItemSentToDevice(itemId)` in feed store
8. On error: `updateJobStatus(jobId, 'failed', error.message)`, do NOT mark sent

**Verification**: Trigger for a known feed item, verify EPUB in upload queue and item marked sent.

---

## Phase 5: HTML Sanitizer Utility

**Goal**: Sanitize HTML for the in-app reader, keeping only safe content tags.

### New file: `utils/sanitize-html.ts`

```typescript
export function sanitizeArticleHtml(html: string): string
```

Whitelist: `p`, `h1`-`h6`, `blockquote`, `ul`, `ol`, `li`, `em`, `strong`, `a` (href only), `br`, `img` (src only).
Strip all other tags and attributes. Regex-based.

### New file: `utils/time-ago.ts`

```typescript
export function timeAgo(epochMs: number): string  // "2m ago", "3h ago", "1d ago"
```

**Verification**: Test with HTML containing scripts, iframes, style tags — only safe tags survive.

---

## Phase 6: Feeds Tab & Navigation Shell

**Goal**: Add the Feeds tab, empty states, and reader route.

### Modify: `app/(tabs)/_layout.tsx`

Add Feeds tab between Library and Settings (3 tabs total):
1. Library (`index`) — icon `book`
2. **Feeds** (`feeds`) — icon `rss`, testID `TabBar.Feeds`
3. Settings (`settings`) — icon `gear`

### New file: `app/(tabs)/feeds.tsx`

- Header: "Feeds"
- View mode toggle: `Timeline | Sources` (Tamagui XStack with styled Buttons)
- Conditional render: `<FeedTimeline />` or `<FeedSources />`
- Single-action FAB (not menu) for "Add Feed"
- `PromptDialog` for URL input (placeholder: "Enter RSS URL or website")
- `EmptyState` when no feeds: icon `rss`, "Your reading list is empty", action "Add a Feed"

**testIDs**: `Feeds.ViewToggle.Timeline`, `Feeds.ViewToggle.Sources`, `Feeds.FAB`, `Feeds.EmptyState`

### New file: `app/feed-reader.tsx`

Stack screen for the minimal reader (not a tab). `headerShown: false`, slide animation.

### Modify: `app/_layout.tsx`

- Add `feed-reader` Stack.Screen route
- Add `refreshAllFeeds()` call on app foreground and after store hydration (alongside existing `importAll()`)
- Wait for feed store hydration before refreshing

**Verification**: App boots with 3 tabs. Feeds shows empty state. FAB opens URL input dialog.

---

## Phase 7: Feed Subscription Flow

**Goal**: Wire "Add Feed" dialog to discover, validate, and subscribe.

### New file: `hooks/use-add-feed.ts`

```typescript
export function useAddFeed(): {
  isLoading: boolean;
  error: string | null;
  addFeed: (inputUrl: string) => Promise<boolean>;
}
```

Flow: normalize URL → `resolveFeedUrl()` → check duplicate → `addFeed()` in store → `refreshFeed()` → haptic feedback.

Error states: network failure, invalid feed, already subscribed.

### Integrate into `app/(tabs)/feeds.tsx`

PromptDialog submit → `addFeed(url)`. Spinner while loading. Inline error on failure. Close + switch to timeline on success.

**Verification**: Enter RSS URL → feed in sources, items in timeline. Enter website URL → auto-discovered. Enter garbage → error.

---

## Phase 8: Timeline View

**Goal**: Aggregated reverse-chronological article list with swipe-to-send.

### New file: `components/FeedTimeline.tsx`

FlatList reading from feed store. Pull-to-refresh → `refreshAllFeeds()`.

### New file: `components/FeedArticleCard.tsx`

Props: `item: FeedItem`, `feedTitle: string`, `onPress`, `onSendToDevice`, `isSending: boolean`

**Card anatomy** (typography-focused, no images):
- **Eyebrow**: Source name + relative time (`timeAgo`), all caps, small, gray. Checkmark if `isSentToDevice`.
- **Headline**: Serif, bold, `fontSize: "$4"`. Visual anchor.
- **Snippet**: Serif, gray, `numberOfLines: 3`.
- Generous padding (`$3.5`), subtle bottom border (0.5px `$gray4`).

**Swipe right**: `ReanimatedSwipeable` (same pattern as `SwipeableFileRow`). Reveals "Send to Device" with blue background and `paper-plane` icon.

**testIDs**: `Feeds.Timeline`, `Feeds.ArticleCard.${item.id}`

**Verification**: Timeline renders cards. Pull-to-refresh works. Swipe right reveals send action.

---

## Phase 9: Sources View

**Goal**: List subscribed feeds with unsubscribe.

### New file: `components/FeedSources.tsx`

FlatList of `FeedSourceRow` components.

### New file: `components/FeedSourceRow.tsx`

Props: `feed: Feed`, `itemCount: number`, `onUnsubscribe`

Layout: Favicon (32x32) | Title + item count + last fetched | Swipe left → "Unsubscribe" (red, trash icon) with Alert confirmation.

**testIDs**: `Feeds.Sources`, `Feeds.SourceRow.${feed.id}`

**Verification**: Sources lists all feeds. Swipe + confirm removes feed and its items.

---

## Phase 10: Minimal Reader Screen

**Goal**: Distraction-free article reading with "Add to Device" CTA.

### File: `app/feed-reader.tsx`

Navigation: `router.push({ pathname: '/feed-reader', params: { itemId } })`

**Layout**:
- **Header**: Transparent, absolute. Back chevron + source domain text.
- **Body**: ScrollView with WebView for article content.
  - Paper background: `#FAFAFA` light / `#1A1A1A` dark
  - Massive margins: `paddingHorizontal: 24`
  - Title: serif, bold, 24pt
  - Byline: sans-serif, 14pt, gray
  - Content: WebView with sanitized HTML + injected CSS (Georgia serif, 18px, line-height 1.6)
  - If `contentHtml` is sparse, fetch full article via `extractArticleFromUrl()` with loading state

- **Adaptive FAB**:
  - Idle: "Add to Device" pill with `paper-plane` icon (blue)
  - Loading: `ActivityIndicator` spinner
  - Success: "Added" with checkmark (green), slides off-screen after 1.5s via `withTiming` animation
  - Already sent: show "Added" state or hide entirely

- Marks item as read on open (`markItemRead`)

**Reader CSS**:
```css
body { font-family: Georgia, serif; font-size: 18px; line-height: 1.6;
       padding: 24px; color: #1a1a1a; background: #fafafa; }
blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 16px; }
img { max-width: 100%; height: auto; }
```

**testIDs**: `FeedReader.BackButton`, `FeedReader.Content`, `FeedReader.SendFAB`

**Verification**: Tap article → reader opens. Serif typography renders. "Add to Device" creates EPUB + shows success. Back returns to timeline with checkmark on card.

---

## Phase 11: Integration & Auto-Refresh

### Modify: `app/_layout.tsx`

- Add `refreshAllFeeds()` to the AppState `'active'` handler (alongside `importAll()`)
- Add `refreshAllFeeds()` on initial launch after store hydration

### Modify: `app/(tabs)/feeds.tsx`

- `useFocusEffect` → `refreshAllFeeds()` debounced (skip if last refresh < 60s ago)

**Verification**: Background/foreground app → feeds refresh. Switch to Feeds tab → refresh if stale.

---

## Phase 12: Polish & Edge Cases

1. **Haptic feedback**: On swipe-to-send activation (`Haptics.impactAsync(Medium)`)
2. **Duplicate feed protection**: Check `feeds.some(f => f.feedUrl === feedUrl)` in `addFeed`
3. **Mark as read**: Subtle opacity reduction on read articles in timeline
4. **Error handling**: Silent failure for background refresh (log only). Alert for `queueFeedArticleToDevice` failure.
5. **Network-offline**: Catch fetch failures gracefully, leave existing items untouched
6. **Empty feed**: 0 items is valid, not an error

---

## File Summary

### New files (15):
| File | Phase |
|------|-------|
| `types/feed.ts` | 0 |
| `constants/Feed.ts` | 0 |
| `services/feed-parser.ts` | 1 |
| `stores/feed-store.ts` | 2 |
| `services/feed-refresh.ts` | 3 |
| `services/feed-to-epub.ts` | 4 |
| `utils/sanitize-html.ts` | 5 |
| `utils/time-ago.ts` | 5 |
| `app/(tabs)/feeds.tsx` | 6 |
| `app/feed-reader.tsx` | 6 |
| `hooks/use-add-feed.ts` | 7 |
| `components/FeedTimeline.tsx` | 8 |
| `components/FeedArticleCard.tsx` | 8 |
| `components/FeedSources.tsx` | 9 |
| `components/FeedSourceRow.tsx` | 9 |

### Modified files (4):
| File | Phase | Change |
|------|-------|--------|
| `types/upload.ts` | 0 | Add `'feed'` to `UploadJobType` |
| `services/logger.ts` | 0 | Add `'feed'` to `LogCategory` |
| `app/(tabs)/_layout.tsx` | 6 | Add Feeds tab |
| `app/_layout.tsx` | 6, 11 | Add feed-reader route + auto-refresh |

### No new npm dependencies.
Reuses: `react-native-webview` (reader), `jszip` (via epub-generator), `react-native-gesture-handler` (swipeable cards), `react-native-reanimated` (FAB animation), `zustand` + `async-storage` (store).

### Existing services reused:
- `services/url-article-extractor.ts` → `extractArticleFromUrl()` for full article fetch
- `services/epub-generator.ts` → `generateEpub()` for EPUB creation
- `stores/upload-store.ts` → `addProcessingJob()` / `finalizeProcessingJob()` for upload pipeline
- `stores/settings-store.ts` → `clipUploadPath` for destination
- `services/upload-queue.ts` → auto-picks up pending jobs when device connected

---

## Verification (End-to-End)

1. Add an RSS feed via URL → items appear in timeline
2. Pull-to-refresh → new items load
3. Tap article → minimal reader opens with serif typography
4. Tap "Add to Device" → EPUB generated → job appears in upload queue
5. Connect device → EPUB uploads automatically
6. Article card shows checkmark in timeline
7. Swipe right on article card → quick send to device
8. Sources view → swipe to unsubscribe → feed and items removed
9. Background/foreground app → feeds auto-refresh
10. Articles older than 7 days (not sent) → auto-purged
