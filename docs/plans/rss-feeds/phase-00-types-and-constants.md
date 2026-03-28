# Phase 0: Type Definitions & Constants

**Goal**: Establish the data model everything builds on.

**Prerequisites**: None — this is the foundation phase.

---

## New file: `types/feed.ts`

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

---

## Modify: `types/upload.ts` (line 10)

Add `'feed'` to `UploadJobType`:
```typescript
export type UploadJobType = 'book' | 'sleep-background' | 'clip' | 'feed';
```

---

## New file: `constants/Feed.ts`

```typescript
export const FEED_ITEM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const FEED_SNIPPET_MAX_LENGTH = 200;
export const FEED_FETCH_TIMEOUT_MS = 15_000;
export const FEED_USER_AGENT = 'CrossPointSync/1.0 RSS Reader';
```

---

## Modify: `services/logger.ts` (line 3)

Add `'feed'` to the `LogCategory` union:
```typescript
export type LogCategory = 'discovery' | 'connection' | 'api' | 'upload' | 'queue' | 'store' | 'scheduler' | 'clip' | 'feed';
```

---

## Verification

`npx tsc --noEmit` compiles cleanly with no errors.
