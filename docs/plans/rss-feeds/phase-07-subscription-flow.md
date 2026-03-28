# Phase 7: Feed Subscription Flow

**Goal**: Wire the "Add Feed" dialog to discover, validate, and subscribe to feeds, with loading and error states.

**Prerequisites**: Phase 1 (feed-parser), Phase 2 (feed-store), Phase 3 (feed-refresh), Phase 6 (feeds tab with dialog).

---

## New file: `hooks/use-add-feed.ts`

### Interface

```typescript
export function useAddFeed(): {
  isLoading: boolean;
  error: string | null;
  addFeed: (inputUrl: string) => Promise<boolean>; // true if subscribed
}
```

### Flow inside `addFeed(inputUrl)`

1. Set `isLoading = true`, `error = null`
2. **Normalize URL**: Prepend `https://` if no protocol present
3. **Resolve feed**: Call `resolveFeedUrl(normalizedUrl)` from `services/feed-parser.ts`
   - This tries direct parsing, then auto-discovery, then validation
4. **Check duplicate**: `useFeedStore.getState().feeds.some(f => f.feedUrl === feedUrl)`
   - If duplicate, set `error = "Already subscribed to this feed"`, return `false`
5. **Subscribe**: Call `useFeedStore.getState().addFeed({ feedUrl, siteUrl, title, favicon: getFaviconUrl(siteUrl) })`
   - Returns the new feed ID
6. **Initial refresh**: Call `refreshFeed(feedId)` to immediately populate items
7. **Haptic feedback**: `Haptics.notificationAsync(NotificationFeedbackType.Success)`
8. Set `isLoading = false`, return `true`

### Error handling

Wrap the entire flow in try/catch:
- Network failure: `"Could not reach this URL. Check your connection."`
- Not a valid feed (resolveFeedUrl throws): `"Could not find a valid RSS feed at this link."`
- Already subscribed: `"Already subscribed to this feed."`
- Set `isLoading = false` in finally block

---

## Integrate into `app/(tabs)/feeds.tsx`

Update the `PromptDialog` integration:

- **Submit handler**: Calls `addFeed(url)` from the hook
- **Loading state**: While `isLoading`, show a spinner replacing the "Subscribe" button (or disable the button with a loading indicator)
- **Error display**: Show `error` as inline red text below the input field
- **Success**: Close the dialog, switch `viewMode` to `'timeline'`

---

## Verification

1. Enter a known RSS feed URL (e.g., `https://hnrss.org/newest`) → feed appears in sources, items in timeline
2. Enter a website URL with discoverable feed (e.g., `theverge.com`) → auto-discovery finds feed, subscribes
3. Enter garbage URL → error message: "Could not find a valid RSS feed at this link."
4. Enter an already-subscribed feed URL → error message: "Already subscribed to this feed."
5. Haptic feedback fires on successful subscription
