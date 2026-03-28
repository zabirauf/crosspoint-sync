# Phase 4: Feed-to-EPUB Service

**Goal**: Convert a feed article into an EPUB and queue it for upload to the device, reusing existing infrastructure.

**Prerequisites**: Phase 2 (feed-store). Also requires existing services: `url-article-extractor`, `epub-generator`, `upload-store`, `settings-store`.

---

## New file: `services/feed-to-epub.ts`

### Function signature

```typescript
/**
 * Extract full article from a feed item's link, generate EPUB,
 * and add to the upload queue. Marks the item as sent to device.
 *
 * Returns the upload job ID.
 */
export async function queueFeedArticleToDevice(itemId: string): Promise<string>
```

### Implementation flow

Mirrors the `services/clip-import.ts` pattern:

1. **Read item**: Get `FeedItem` from `useFeedStore.getState()` by `itemId`.
2. **Generate job ID**: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
3. **Safe filename**: Sanitize article title → `${safeTitle}.epub` (strip non-alphanumeric, truncate to ~60 chars).
4. **Create processing job**: `useUploadStore.getState().addProcessingJob(jobId, fileName, 'feed')` — this shows the "Processing" state in the upload queue.
5. **Extract full article**: `extractArticleFromUrl(item.link)` from `services/url-article-extractor.ts` — fetches the full article HTML with images (up to 20).
6. **Generate EPUB**: `generateEpub({ title, author, sourceUrl: item.link, html, images, clippedAt: item.pubDate })` from `services/epub-generator.ts` — returns `{ uri, size }`.
7. **Get destination**: `useSettingsStore.getState().clipUploadPath` — reuse the clip upload path (feed articles are articles too, same destination makes sense).
8. **Finalize job**: `useUploadStore.getState().finalizeProcessingJob(jobId, { fileName, fileUri: uri, fileSize: size, destinationPath })` — transitions job from `processing` to `pending`. The upload queue processor auto-picks it up when device is connected.
9. **Mark sent**: `useFeedStore.getState().markItemSentToDevice(itemId)`.
10. **Return** the job ID.

### Error handling

If extraction or EPUB generation fails:
- Call `useUploadStore.getState().updateJobStatus(jobId, 'failed', error.message)`
- Do **NOT** call `markItemSentToDevice` — the item should remain available for retry
- Re-throw or return the error to the caller (so the UI can show feedback)

### Existing services reused

| Service | Function | Purpose |
|---------|----------|---------|
| `services/url-article-extractor.ts` | `extractArticleFromUrl(url)` | Fetch full article content + images |
| `services/epub-generator.ts` | `generateEpub(options)` | Build EPUB ZIP, write to cache |
| `stores/upload-store.ts` | `addProcessingJob()`, `finalizeProcessingJob()` | Upload job lifecycle |
| `stores/settings-store.ts` | `clipUploadPath` | Destination folder on device |
| `services/upload-queue.ts` | (automatic) | Picks up pending jobs when device connected |

---

## Verification

Manually trigger `queueFeedArticleToDevice` for a known feed item. Verify:
1. EPUB file exists at the returned URI
2. Upload job appears in upload store with status `pending`
3. Feed item's `isSentToDevice` is `true`
4. When device connects, the job uploads automatically
