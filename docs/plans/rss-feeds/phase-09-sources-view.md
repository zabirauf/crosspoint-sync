# Phase 9: Sources View

**Goal**: List subscribed feeds with item counts and unsubscribe capability.

**Prerequisites**: Phase 2 (feed-store).

---

## New file: `components/FeedSources.tsx`

### Overview

A `FlatList` of `FeedSourceRow` components showing all subscribed feeds.

### Props

None — reads directly from `useFeedStore`.

### Implementation

- Data: `useFeedStore(state => state.feeds)`
- For each feed, compute `itemCount` from `getItemsByFeed(feed.id).length`
- On unsubscribe: show `Alert.alert` confirmation, then `removeFeed(feedId)`

### testIDs

- `Feeds.Sources`

---

## New file: `components/FeedSourceRow.tsx`

### Props

```typescript
interface FeedSourceRowProps {
  feed: Feed;
  itemCount: number;
  onUnsubscribe: () => void;
}
```

### Layout

```
┌─────────────────────────────────────────────┐
│  [favicon]  Feed Title                      │
│             12 articles • Updated 2h ago    │
└─────────────────────────────────────────────┘
```

- **Left**: Favicon image (32x32, React Native `Image` with `source={{ uri: feed.favicon }}`, fallback to `rss` icon)
- **Center** (`YStack`):
  - Feed title: `fontWeight: '500'`, `fontSize: "$4"`
  - Subtitle: `"{itemCount} articles • Updated {timeAgo(feed.lastFetchedAt)}"`, `color: "$gray10"`, `fontSize: "$2"`
- **Padding**: `paddingVertical: "$3"`, `paddingHorizontal: "$3.5"`
- **Border**: `borderBottomWidth: 0.5`, `borderBottomColor: "$gray4"`

### Swipe-left action

Wrap in `ReanimatedSwipeable` (same pattern as `SwipeableFileRow`):
- **Right actions** (revealed by swiping left):
  - "Unsubscribe" button
  - Red background (`#FF3B30`)
  - `trash` FontAwesome icon, white
  - Width: 80px
- Completing the swipe calls `onUnsubscribe`
- `onUnsubscribe` shows `Alert.alert` confirmation before removing

### testIDs

- `Feeds.SourceRow.${feed.id}`

---

## Verification

1. Sources view lists all subscribed feeds with favicons
2. Each row shows article count and last-fetched time
3. Swipe left reveals red "Unsubscribe" action
4. Confirming unsubscribe removes the feed and all its items from the store
5. Timeline view updates accordingly (those articles disappear)
