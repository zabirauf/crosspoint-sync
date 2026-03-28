# Phase 12: Polish & Edge Cases

**Goal**: Handle all edge cases, add tactile feedback, and ensure robustness.

**Prerequisites**: All prior phases (0–11).

---

## Items

### 1. Haptic feedback on swipe-to-send

When the swipe-to-send gesture completes on a `FeedArticleCard`:

```typescript
import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
```

Also add haptic on successful subscription (already in Phase 7's `useAddFeed`).

### 2. Duplicate feed protection

In `hooks/use-add-feed.ts`, check for duplicates before subscribing:

```typescript
const existing = useFeedStore.getState().feeds.some(f => f.feedUrl === feedUrl);
if (existing) {
  setError('Already subscribed to this feed.');
  return false;
}
```

This is specified in Phase 7 but listed here as a reminder to verify.

### 3. Mark as read — visual dimming

In `FeedArticleCard`, when `item.isRead` is `true`:
- Apply `opacity: 0.7` to the entire card
- This gives a subtle visual distinction without being jarring

### 4. Error handling strategy

| Scenario | Behavior |
|----------|----------|
| Background refresh fails for one feed | Log error, continue others. No user-visible error. |
| Background refresh fails for all feeds | Log. No toast. User will see stale data. |
| `queueFeedArticleToDevice` fails | Show `Alert.alert` with error message. Revert FAB to idle state. |
| Feed subscription fails | Show inline error in the add dialog (already in Phase 7). |
| Network offline during refresh | Catch gracefully. Leave existing items untouched. |

### 5. Network-offline handling

In `services/feed-refresh.ts`, wrap each `refreshFeed` call:

```typescript
try {
  await refreshFeed(feedId);
} catch (err) {
  log('feed', `Failed to refresh ${feedId}: ${err}`);
  // Do not throw — leave existing items in store
}
```

### 6. Empty feed handling

If a feed returns 0 items after parsing, this is valid — do not show an error. The feed simply has no articles at the moment.

### 7. EPUB cleanup

Generated EPUBs live in the expo cache directory. Two cleanup strategies:
- **Option A**: Let the OS manage cache cleanup (simplest, recommended)
- **Option B**: In `services/upload-queue.ts` `onComplete` handler, add `'feed'` to the job types that trigger file cleanup (similar to `'sleep-background'`)

### 8. Large feed stores

If a user subscribes to many feeds, the `items` array could grow. Mitigations:
- `purgeOldItems()` runs on every `refreshAllFeeds()` call (7-day window)
- Items are small (no images stored, just text metadata)
- AsyncStorage handles this fine for typical use (hundreds to low thousands of items)

---

## Verification (Full end-to-end)

1. Add an RSS feed via URL → items appear in timeline
2. Pull-to-refresh → new items load
3. Tap article → minimal reader opens with serif typography
4. Tap "Add to Device" → EPUB generated → job appears in upload queue
5. Connect device → EPUB uploads automatically
6. Article card shows checkmark in timeline
7. Swipe right on article card → quick send to device with haptic
8. Sources view → swipe to unsubscribe → feed and items removed
9. Background/foreground app → feeds auto-refresh
10. Articles older than 7 days (not sent) → auto-purged
11. Read articles appear slightly dimmed
12. Offline → no crash, existing items preserved
