# Phase 6: Feeds Tab & Navigation Shell

**Goal**: Add the Feeds tab to the tab bar, create the main screen skeleton with empty states, and add the reader route.

**Prerequisites**: Phase 2 (feed-store for reading state).

---

## Modify: `app/(tabs)/_layout.tsx`

Add a new `Tabs.Screen` for feeds. The tab bar becomes 3 tabs:

1. **Library** (`index`) — icon `book`, testID `TabBar.Library`
2. **Feeds** (`feeds`) — icon `rss`, testID `TabBar.Feeds`
3. **Settings** (`settings`) — icon `gear`, testID `TabBar.Settings`

```typescript
<Tabs.Screen
  name="feeds"
  options={{
    title: 'Feeds',
    tabBarIcon: ({ color }) => <TabBarIcon name="rss" color={color} />,
    tabBarTestID: 'TabBar.Feeds',
  }}
/>
```

---

## New file: `app/(tabs)/feeds.tsx`

The main Feeds screen. Structure:

### Header area
- Title: "Feeds" (from tab navigation header)
- **View mode toggle** in the header or below it: `Timeline | Sources`
  - Tamagui `XStack` with two `Button` elements styled as a segmented control
  - Active button: filled background. Inactive: chromeless.
  - Reads/writes `viewMode` from feed store

### Body (conditional on viewMode)
- `'timeline'`: Renders `<FeedTimeline />` (built in Phase 8)
- `'sources'`: Renders `<FeedSources />` (built in Phase 9)

### Empty state (when `feeds.length === 0`)
- Uses existing `EmptyState` component
- Icon: `rss`
- Title: "Your reading list is empty"
- Subtitle: "Subscribe to RSS feeds to read articles on your device"
- Action: "Add a Feed" → opens add dialog

### FAB
- Single-action floating button (not a menu like Library's ActionFAB)
- 56x56 circular, blue (`#1a73e8`), white `plus` icon
- Position: bottom-right
- On press: opens the add feed dialog
- testID: `Feeds.FAB`

### Add Feed dialog
- Reuse `PromptDialog` component
- Title: "Add Feed"
- Placeholder: "Enter RSS URL or website"
- Submit label: "Subscribe"
- Wired to `useAddFeed` hook (Phase 7) — for now, just the dialog shell

### testIDs
- `Feeds.Screen`
- `Feeds.ViewToggle.Timeline`
- `Feeds.ViewToggle.Sources`
- `Feeds.FAB`
- `Feeds.EmptyState`

---

## New file: `app/feed-reader.tsx`

A stack screen for the minimal article reader (not a tab). Skeleton for now, full implementation in Phase 10.

- `headerShown: false` (custom transparent header)
- Receives `itemId` as a route param

---

## Modify: `app/_layout.tsx`

### Add feed-reader route to the root Stack

```typescript
<Stack.Screen
  name="feed-reader"
  options={{
    headerShown: false,
    animation: 'slide_from_right',
  }}
/>
```

### Add feed refresh on app foreground and launch

In the existing `useEffect` that handles foreground/import, add:

```typescript
import { refreshAllFeeds } from '@/services/feed-refresh';
```

- On AppState `'active'`: call `refreshAllFeeds()` alongside `importAll()`
- On initial launch after store hydration: call `refreshAllFeeds()`
- Ensure feed store hydration is awaited (same pattern as upload store hydration check)

---

## Verification

1. App boots with 3 tabs visible in the tab bar
2. Feeds tab shows the empty state with "Your reading list is empty"
3. Tapping the FAB opens the add feed dialog
4. View toggle switches between timeline/sources (both empty for now)
