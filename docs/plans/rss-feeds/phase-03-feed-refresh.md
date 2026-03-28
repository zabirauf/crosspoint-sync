# Phase 3: Feed Refresh Service

**Goal**: Orchestration layer that fetches all subscribed feeds and updates the store.

**Prerequisites**: Phase 1 (feed-parser), Phase 2 (feed-store).

---

## New file: `services/feed-refresh.ts`

### Function signatures

```typescript
/**
 * Refresh a single feed: fetch, parse, upsert new items, update lastFetchedAt.
 * Returns the number of new items added.
 */
export async function refreshFeed(feedId: string): Promise<number>

/**
 * Refresh all subscribed feeds in parallel (max 5 concurrent).
 * Calls purgeOldItems() after all feeds are refreshed.
 * Returns total new items across all feeds.
 */
export async function refreshAllFeeds(): Promise<number>
```

### Implementation notes

- **`refreshFeed`**:
  1. Read feed from `useFeedStore.getState().getFeedById(feedId)`
  2. Call `parseFeed(feed.feedUrl)` from `services/feed-parser.ts`
  3. Call `useFeedStore.getState().upsertItems(feedId, parsedItems)`
  4. Call `useFeedStore.getState().updateFeedLastFetched(feedId, Date.now())`
  5. Return count of newly inserted items (can be computed by comparing items length before/after, or by return value from `upsertItems` if we add that)
  6. Log via `log('feed', ...)`

- **`refreshAllFeeds`**:
  1. Read all feeds from `useFeedStore.getState().feeds`
  2. Refresh in parallel with concurrency limit of 5 (simple batching via `Promise.allSettled`)
  3. After all feeds complete, call `useFeedStore.getState().purgeOldItems()`
  4. Return total new items across all feeds
  5. **Silent failure per-feed**: If one feed fails, log the error and continue with others. Do not throw.

- **Concurrency limiter**: Simple approach — split feeds into chunks of 5, process each chunk with `Promise.allSettled`, then next chunk. No need for a fancy queue library.

---

## Verification

Subscribe to a test feed via the store, call `refreshAllFeeds()`, verify items appear in the store's `items` array.
