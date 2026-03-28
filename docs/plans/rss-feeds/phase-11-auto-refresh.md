# Phase 11: Integration & Auto-Refresh

**Goal**: Wire feed refresh into the app lifecycle so feeds stay fresh automatically.

**Prerequisites**: Phase 3 (feed-refresh), Phase 6 (feeds tab).

---

## Modify: `app/_layout.tsx`

### Add refresh on app foreground

In the existing `useEffect` that handles `AppState` changes and calls `importAll()`:

```typescript
import { refreshAllFeeds } from '@/services/feed-refresh';

// Inside the AppState 'active' handler:
const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    importAll();
    refreshAllFeeds(); // Add this — fire-and-forget, errors logged internally
  }
});
```

### Add refresh on initial launch

After store hydration (same pattern as existing `importAll()` on hydration):

```typescript
// In the hydration callback:
refreshAllFeeds();
```

Ensure the feed store is hydrated before calling refresh. Follow the same hydration check pattern used for the upload store:

```typescript
import { useFeedStore } from '@/stores/feed-store';

// Check if already hydrated
if (useFeedStore.persist.hasHydrated()) {
  refreshAllFeeds();
} else {
  const unsub = useFeedStore.persist.onFinishHydration(() => {
    refreshAllFeeds();
    unsub();
  });
}
```

---

## Modify: `app/(tabs)/feeds.tsx`

### Add debounced refresh on tab focus

```typescript
import { useFocusEffect } from 'expo-router';
import { refreshAllFeeds } from '@/services/feed-refresh';

// Track last refresh time
const lastRefreshRef = useRef<number>(0);

useFocusEffect(
  useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current > 60_000) { // Skip if refreshed < 60s ago
      lastRefreshRef.current = now;
      refreshAllFeeds();
    }
  }, [])
);
```

This ensures feeds are refreshed when the user navigates to the Feeds tab, but not on every tab switch if they're rapidly navigating.

---

## Verification

1. Background the app, wait a moment, foreground → feeds refresh (check `lastFetchedAt` updates)
2. Launch app fresh → feeds refresh on startup after hydration
3. Switch to Feeds tab → refresh fires if > 60s since last refresh
4. Rapidly switch tabs → does NOT re-refresh within 60s window
