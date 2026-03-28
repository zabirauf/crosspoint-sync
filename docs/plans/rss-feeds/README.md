# RSS Feeds Feature — Implementation Plan

## Feature Overview

CrossPoint Sync is a book syncing app for the XTEink X4 e-ink reader. It discovers devices on local WiFi, browses files, and uploads EPUBs via WebSocket. Users can already clip web articles (Safari Extension on iOS, share intent on Android) which get converted to EPUB and uploaded to the device.

This feature adds **RSS feed support**: users subscribe to feeds, browse an aggregated timeline, preview articles in a distraction-free reader, and queue them as EPUBs for upload to their e-ink device. The RSS experience acts as a **funnel** — catching articles from the web, stripping them to typographic essentials, and routing them to the device.

## Architecture Summary

The feature is built in layers, each phase building on the previous:

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI LAYER                                  │
│  Feeds Tab (timeline/sources toggle)  →  Minimal Reader Screen  │
│  FeedArticleCard (swipe-to-send)      →  Adaptive "Add to       │
│  FeedSourceRow (swipe-to-unsub)           Device" FAB            │
│  EmptyState + Add Feed dialog                                    │
│                                  [Phases 6-10]                   │
├─────────────────────────────────────────────────────────────────┤
│                     HOOK / GLUE LAYER                            │
│  useAddFeed (subscribe flow)                                     │
│  Auto-refresh on foreground/launch/tab focus                     │
│                                  [Phases 7, 11]                  │
├─────────────────────────────────────────────────────────────────┤
│                     SERVICE LAYER                                │
│  feed-parser     → fetch, parse, auto-discover RSS/Atom         │
│  feed-refresh    → orchestrate refresh of all feeds              │
│  feed-to-epub    → article extraction → EPUB gen → upload queue  │
│  sanitize-html   → whitelist-only HTML for reader view           │
│                                  [Phases 1, 3, 4, 5]            │
├─────────────────────────────────────────────────────────────────┤
│                      DATA LAYER                                  │
│  feed-store (Zustand + AsyncStorage)                             │
│  types/feed.ts, constants/Feed.ts                                │
│                                  [Phases 0, 2]                   │
├─────────────────────────────────────────────────────────────────┤
│                EXISTING INFRASTRUCTURE (reused)                   │
│  url-article-extractor  →  epub-generator  →  upload-store       │
│                         →  upload-queue    →  WebSocket upload    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

- **No new npm dependencies.** XML parsing uses regex (RSS/Atom is predictable). Reader uses existing `react-native-webview`. EPUB generation uses existing `jszip`-based pipeline.
- **Reuses the entire existing upload pipeline.** Feed articles follow the same `addProcessingJob → generateEpub → finalizeProcessingJob` flow as web clips. The upload queue processor auto-picks them up when the device is connected.
- **Typography-focused timeline.** No image thumbnails in the feed list — just source name, headline (serif, bold), snippet, and time. Matches the e-ink reading ethos.
- **Minimal reader with WebView.** Sanitized HTML rendered in a WebView with injected serif CSS. Handles complex article HTML better than native Text components.
- **7-day auto-cleanup.** Feed items older than 7 days that haven't been sent to the device are automatically purged to manage storage.
- **Swipe gestures.** Swipe right on article card → quick "Send to Device". Swipe left on source row → unsubscribe. Follows existing `SwipeableFileRow` pattern.

## Existing Codebase Patterns to Follow

| Pattern | Where to look |
|---------|---------------|
| Zustand store with AsyncStorage persistence | `stores/upload-store.ts`, `stores/device-store.ts` |
| Upload job lifecycle (processing → pending → uploading → completed) | `stores/upload-store.ts`, `services/upload-queue.ts` |
| Article extraction from URL | `services/url-article-extractor.ts` |
| EPUB generation from HTML + images | `services/epub-generator.ts` |
| Clip import flow (manifest → EPUB → upload queue) | `services/clip-import.ts` |
| Bottom sheets (Tamagui Sheet) | `components/ConnectionSheet.tsx`, `components/UploadQueueSheet.tsx` |
| Swipeable rows (ReanimatedSwipeable) | `components/SwipeableFileRow.tsx` |
| FAB with animated menu | `components/ActionFAB.tsx` |
| Empty states | `components/EmptyState.tsx` |
| Prompt dialogs for text input | `components/PromptDialog.tsx` |
| Tab configuration | `app/(tabs)/_layout.tsx` |
| App lifecycle hooks (foreground, hydration) | `app/_layout.tsx` |
| testID convention | `ScreenName.ElementName` (e.g., `Library.FAB`, `Connection.Sheet`) |
| Logger categories | `services/logger.ts` |

## Data Model

```typescript
// types/feed.ts
interface Feed {
  id: string;                   // Generated: timestamp-random
  feedUrl: string;              // RSS/Atom feed URL
  siteUrl: string;              // Website homepage URL
  title: string;                // Feed title from XML
  favicon: string | null;       // Google S2 favicon URL
  lastFetchedAt: number | null; // Epoch ms
  addedAt: number;              // Epoch ms
}

interface FeedItem {
  id: string;                   // GUID from feed or hash of link
  feedId: string;               // FK to Feed.id
  title: string;
  link: string;                 // Article URL
  pubDate: number;              // Epoch ms
  snippet: string;              // Plain-text excerpt, max ~200 chars
  contentHtml: string | null;   // RSS content HTML
  isRead: boolean;
  isSentToDevice: boolean;      // True once EPUB upload job created
}

type FeedViewMode = 'timeline' | 'sources';
```

## File Inventory

### New files (15):
| File | Phase | Purpose |
|------|-------|---------|
| `types/feed.ts` | 0 | Type definitions |
| `constants/Feed.ts` | 0 | Constants (timeouts, limits) |
| `services/feed-parser.ts` | 1 | RSS/Atom fetch, parse, auto-discover |
| `stores/feed-store.ts` | 2 | Zustand store for feeds + items |
| `services/feed-refresh.ts` | 3 | Refresh orchestration |
| `services/feed-to-epub.ts` | 4 | Article → EPUB → upload queue |
| `utils/sanitize-html.ts` | 5 | HTML whitelist sanitizer |
| `utils/time-ago.ts` | 5 | Relative time formatting |
| `app/(tabs)/feeds.tsx` | 6 | Feeds tab screen |
| `app/feed-reader.tsx` | 6 | Minimal reader screen |
| `hooks/use-add-feed.ts` | 7 | Subscription hook |
| `components/FeedTimeline.tsx` | 8 | Timeline FlatList |
| `components/FeedArticleCard.tsx` | 8 | Article card with swipe |
| `components/FeedSources.tsx` | 9 | Sources FlatList |
| `components/FeedSourceRow.tsx` | 9 | Source row with swipe |

### Modified files (4):
| File | Phase | Change |
|------|-------|--------|
| `types/upload.ts` | 0 | Add `'feed'` to `UploadJobType` |
| `services/logger.ts` | 0 | Add `'feed'` to `LogCategory` |
| `app/(tabs)/_layout.tsx` | 6 | Add Feeds tab |
| `app/_layout.tsx` | 6, 11 | Add feed-reader route + auto-refresh |

## Phase Index

| Phase | File | Summary |
|-------|------|---------|
| 0 | [phase-00-types-and-constants.md](./phase-00-types-and-constants.md) | Type definitions & constants |
| 1 | [phase-01-feed-parser.md](./phase-01-feed-parser.md) | Feed parser service |
| 2 | [phase-02-feed-store.md](./phase-02-feed-store.md) | Feed store (Zustand) |
| 3 | [phase-03-feed-refresh.md](./phase-03-feed-refresh.md) | Feed refresh service |
| 4 | [phase-04-feed-to-epub.md](./phase-04-feed-to-epub.md) | Feed-to-EPUB service |
| 5 | [phase-05-utilities.md](./phase-05-utilities.md) | HTML sanitizer & time-ago utilities |
| 6 | [phase-06-feeds-tab-and-navigation.md](./phase-06-feeds-tab-and-navigation.md) | Feeds tab & navigation shell |
| 7 | [phase-07-subscription-flow.md](./phase-07-subscription-flow.md) | Feed subscription flow |
| 8 | [phase-08-timeline-view.md](./phase-08-timeline-view.md) | Timeline view |
| 9 | [phase-09-sources-view.md](./phase-09-sources-view.md) | Sources view |
| 10 | [phase-10-minimal-reader.md](./phase-10-minimal-reader.md) | Minimal reader screen |
| 11 | [phase-11-auto-refresh.md](./phase-11-auto-refresh.md) | Integration & auto-refresh |
| 12 | [phase-12-polish.md](./phase-12-polish.md) | Polish & edge cases |

## End-to-End Verification

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
