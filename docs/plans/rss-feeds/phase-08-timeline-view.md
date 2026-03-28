# Phase 8: Timeline View

**Goal**: Build the aggregated reverse-chronological article list with swipe-to-send functionality.

**Prerequisites**: Phase 2 (feed-store), Phase 3 (feed-refresh), Phase 4 (feed-to-epub), Phase 5 (time-ago utility).

---

## New file: `components/FeedTimeline.tsx`

### Overview

A `FlatList` that renders all feed items from all subscribed feeds in reverse chronological order.

### Props

None — reads directly from `useFeedStore`.

### Implementation

- Data: `useFeedStore(state => state.getTimelineItems())`
- Pull-to-refresh: `RefreshControl` that calls `refreshAllFeeds()` from `services/feed-refresh.ts`
- Renders `FeedArticleCard` for each item
- Joins feed title by looking up `getFeedById(item.feedId)?.title`
- Tracks which items are currently being sent (local `Set<string>` state for `sendingItemIds`)
- On card press: `router.push({ pathname: '/feed-reader', params: { itemId: item.id } })`
- On send to device: calls `queueFeedArticleToDevice(item.id)`, manages `sendingItemIds`

### testIDs

- `Feeds.Timeline`
- `Feeds.Timeline.RefreshControl`

---

## New file: `components/FeedArticleCard.tsx`

### Props

```typescript
interface FeedArticleCardProps {
  item: FeedItem;
  feedTitle: string;
  onPress: () => void;
  onSendToDevice: () => void;
  isSending: boolean;
}
```

### Card anatomy (typography-focused, no images)

```
┌─────────────────────────────────────────────┐
│  HACKER NEWS • 3H AGO                    ✓  │  ← Eyebrow row (checkmark if sent)
│                                              │
│  Article Headline Goes Here in             │  ← Headline (serif, bold)
│  Serif Bold Font                            │
│                                              │
│  First two lines of the article snippet     │  ← Snippet (serif, gray)
│  text goes here truncated to three lines... │
└─────────────────────────────────────────────┘
```

- **Eyebrow row** (`XStack`):
  - Source name: feed title, uppercase, `fontSize: "$1"`, `letterSpacing: 1`, `color: "$gray10"`
  - Separator: ` • `
  - Relative time: `timeAgo(item.pubDate)`, same styling
  - Right-aligned: green checkmark icon if `isSentToDevice`
- **Headline** (`Text`):
  - `fontFamily: 'Georgia'` (or platform serif)
  - `fontWeight: '700'`
  - `fontSize: "$4"` (Tamagui scale)
  - `lineHeight` tight
- **Snippet** (`Text`):
  - `fontFamily: 'Georgia'`
  - `color: "$gray11"`
  - `fontSize: "$3"`
  - `numberOfLines: 3`
- **Container**:
  - `padding: "$3.5"`
  - `borderBottomWidth: 0.5`
  - `borderBottomColor: "$gray4"`
  - Pressable with `opacity: 0.7` press style
  - If `isRead`: subtle opacity reduction (`opacity: 0.7` on the whole card)

### Swipe-right action

Wrap card in `ReanimatedSwipeable` from `react-native-gesture-handler` (same pattern as `components/SwipeableFileRow.tsx`):
- **Left actions** (revealed by swiping right):
  - "Send to Device" button
  - Blue background (`#1a73e8`)
  - `paper-plane` FontAwesome icon, white
  - Width: 80px
- Completing the swipe calls `onSendToDevice`
- Disabled if `isSentToDevice` or `isSending`

### testIDs

- `Feeds.ArticleCard.${item.id}`

---

## New file: `utils/time-ago.ts`

(Already specified in Phase 5, included here for reference)

```typescript
export function timeAgo(epochMs: number): string
```

---

## Verification

1. Timeline renders article cards with eyebrow, headline, snippet
2. Pull-to-refresh triggers feed refresh and new items appear
3. Swipe right on a card reveals "Send to Device" action
4. Tapping a card navigates to the reader screen
5. Sent articles show a checkmark and are slightly dimmed
