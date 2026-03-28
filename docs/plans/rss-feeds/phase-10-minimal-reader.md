# Phase 10: Minimal Reader Screen

**Goal**: Distraction-free article reading view with an "Add to Device" CTA. This is the heart of the RSS feature.

**Prerequisites**: Phase 2 (feed-store), Phase 4 (feed-to-epub), Phase 5 (sanitize-html).

---

## File: `app/feed-reader.tsx`

### Navigation

Reached via: `router.push({ pathname: '/feed-reader', params: { itemId } })`

Receives `itemId` as a route param. Reads the `FeedItem` and parent `Feed` from the store.

### Layout

#### Transparent header

- Absolute-positioned `XStack` at top, `zIndex: 10`
- Left: Back chevron (`chevron-left` icon), chromeless circular button
- Center: Source domain text (e.g., `zohaib.me`), `fontSize: 12`, `color: "$gray10"`
- Background: semi-transparent, becomes slightly opaque on scroll

#### ScrollView body

- Paper background: `#FAFAFA` (light) / `#1A1A1A` (dark)
- **Article title**: Serif, bold, `fontSize: 24`, `lineHeight: 34`, `paddingHorizontal: 24`
- **Byline**: `fontSize: 14`, uppercase, `color: "$gray10"` — source name + formatted date
- **Article content**: Rendered in a `WebView` with sanitized HTML

#### Content loading strategy

1. If `item.contentHtml` is substantial (> 500 chars after stripping tags): use it directly, sanitized via `sanitizeArticleHtml()`
2. Otherwise: show a "Loading full article..." state with `ActivityIndicator`, and fetch the full article via `extractArticleFromUrl(item.link)` in a `useEffect`
3. The fetched content replaces the loading state

#### WebView Reader CSS (injected)

```css
body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
  line-height: 1.6;
  margin: 0;
  padding: 24px;
  color: #1a1a1a;        /* dark mode: #e0e0e0 */
  background: #fafafa;   /* dark mode: #1a1a1a */
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.3;
  margin-top: 1.2em;
}
img {
  max-width: 100%;
  height: auto;
}
a {
  color: #1a73e8;
}
blockquote {
  border-left: 3px solid #ccc;
  margin-left: 0;
  padding-left: 16px;
  color: #555;            /* dark mode: #999 */
}
```

Theme-aware: inject different color values based on `useColorScheme()`.

### Adaptive FAB ("Add to Device")

Bottom-right floating button with three states:

#### State 1: Idle
- Pill-shaped button: `XStack` with icon + text
- Icon: `paper-plane` (FontAwesome)
- Text: "Add to Device"
- Background: `#1a73e8` (blue)
- Color: white

#### State 2: Loading
- Same shape, `ActivityIndicator` spinner replaces icon
- Text: "Adding..."
- Disabled (not pressable)

#### State 3: Success
- Background transitions to green (`#4caf50`)
- Icon: `check` (FontAwesome)
- Text: "Added"
- After 1.5s, slides off-screen to the right via `withTiming` (react-native-reanimated) `translateX` animation

#### Already sent
- If `item.isSentToDevice` is already `true` when the screen opens, show the FAB in "Added" state initially, or hide it entirely

#### Implementation
- On press: calls `queueFeedArticleToDevice(item.id)` from `services/feed-to-epub.ts`
- Manage local state: `'idle' | 'loading' | 'success'`
- Error: show `Alert.alert` with error message, revert to `'idle'`

### Mark as read

Call `useFeedStore.getState().markItemRead(itemId)` on mount. This allows the timeline to dim read articles.

### testIDs

- `FeedReader.Screen`
- `FeedReader.BackButton`
- `FeedReader.Content`
- `FeedReader.SendFAB`

---

## Verification

1. Tap article in timeline → reader opens with slide animation
2. Article renders with serif typography, wide margins, paper background
3. Dark mode: colors invert appropriately
4. "Add to Device" button visible at bottom-right
5. Tapping "Add to Device" → spinner → "Added" (green) → slides away
6. EPUB appears in upload queue
7. Back button returns to timeline, article card shows checkmark
8. Re-opening a sent article shows "Added" state (or no FAB)
