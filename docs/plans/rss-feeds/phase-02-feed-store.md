# Phase 2: Feed Store (Zustand)

**Goal**: Persistent store for feeds and feed items, with all CRUD operations and cleanup logic.

**Prerequisites**: Phase 0 (types).

---

## New file: `stores/feed-store.ts`

### Store interface

```typescript
interface FeedState {
  feeds: Feed[];
  items: FeedItem[];
  viewMode: FeedViewMode;

  // Feed management
  addFeed: (feed: Omit<Feed, 'id' | 'addedAt' | 'lastFetchedAt'>) => string; // returns feed ID
  removeFeed: (feedId: string) => void;

  // Item management
  upsertItems: (feedId: string, items: Array<Omit<FeedItem, 'feedId' | 'isRead' | 'isSentToDevice'>>) => void;
  markItemRead: (itemId: string) => void;
  markItemSentToDevice: (itemId: string) => void;
  updateFeedLastFetched: (feedId: string, timestamp: number) => void;

  // Cleanup
  purgeOldItems: () => void;

  // View
  setViewMode: (mode: FeedViewMode) => void;

  // Derived (computed from state, not stored)
  getTimelineItems: () => FeedItem[];
  getItemsByFeed: (feedId: string) => FeedItem[];
  getFeedById: (feedId: string) => Feed | undefined;
}
```

### Persistence config

- **Store name**: `'crosspointsync-feeds'`
- **Storage**: `createJSONStorage(() => AsyncStorage)` (same pattern as other stores)
- **Partialize**: Persist `feeds`, `items`, and `viewMode` — all state is small text records.

### Key behaviors

- **`addFeed`**: Generates ID as `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` matching the existing upload-store ID pattern. Sets `addedAt: Date.now()`, `lastFetchedAt: null`.

- **`removeFeed(feedId)`**: Removes the feed AND all items with `feedId === feedId`.

- **`upsertItems(feedId, items[])`**: Deduplicates by item `id` (GUID). Only inserts items whose `id` is not already present in the store's `items` array. Sets `feedId`, `isRead: false`, `isSentToDevice: false` on new items.

- **`purgeOldItems()`**: Filters out items where `pubDate < Date.now() - FEED_ITEM_MAX_AGE_MS` AND `isSentToDevice === false`. Items the user sent to the device are preserved as a record.

- **`getTimelineItems()`**: Returns all `items` sorted by `pubDate` descending (newest first).

### Reference: existing store pattern

Follow `stores/upload-store.ts` for the Zustand + persist + AsyncStorage boilerplate:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
```

---

## Verification

Import store temporarily in root layout. Add a feed, upsert items, restart app, verify persistence via AsyncStorage.
