import { useRssStore, toFolderName } from '@/stores/rss-store';
import { useUploadStore } from '@/stores/upload-store';
import { useSettingsStore } from '@/stores/settings-store';
import { log } from '@/services/logger';
import { fetchAndParseFeed, hostnameOf } from '@/services/rss-parser';
import { runArticleExtractionJob } from '@/services/article-queue';
import { RssFeed, ParsedFeedItem } from '@/types/rss';
import { FEED_INITIAL_ITEM_LIMIT, FEED_MAX_ITEMS_PER_CHECK } from '@/constants/Rss';

/**
 * Only one check runs at a time. The article extractor drives a single shared hidden
 * WebView (`components/HiddenWebViewExtractor.tsx`), so overlapping checks would have
 * their extractions clash.
 */
let checking = false;

export function isCheckInProgress(): boolean {
  return checking;
}

/** Case-insensitive substring match over title + summary. No keywords = everything matches. */
function matchesKeywords(item: ParsedFeedItem, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return keywords.some((k) => {
    const needle = k.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Items published since `lastSeenItemId`, newest-first.
 *
 * If the marker isn't found the feed has rolled past everything we saw (or the publisher
 * regenerated its GUIDs), so we treat the visible window as new and let the caller's cap
 * bound it. If there is no marker at all this is a first check — see FEED_INITIAL_ITEM_LIMIT.
 */
function newItemsSince(items: ParsedFeedItem[], lastSeenItemId: string | null): ParsedFeedItem[] {
  if (lastSeenItemId === null) return items;
  const index = items.findIndex((i) => i.id === lastSeenItemId);
  return index === -1 ? items : items.slice(0, index);
}

/**
 * Where a feed's articles land on the device: the RSS upload path, plus the feed's own
 * subfolder when it has one. An empty `folderName` writes straight to the base path.
 */
export function destinationForFeed(feed: RssFeed): string {
  const base = useSettingsStore.getState().rssUploadPath.replace(/\/+$/, '') || '';
  const folder = feed.folderName?.trim();
  const path = folder ? `${base}/${folder}` : base;
  return path.startsWith('/') ? path : `/${path}`;
}

/** Skip URLs already represented in the upload queue (re-added feed, cross-posted article). */
function alreadyQueued(url: string): boolean {
  return useUploadStore
    .getState()
    .jobs.some((j) => j.originalUrl === url && j.status !== 'failed' && j.status !== 'cancelled');
}

/**
 * Checks one feed and queues EPUB jobs for new matching items.
 * Returns the number of items queued. Never throws — failures are recorded on the feed.
 *
 * Unguarded: callers must hold the `checking` flag. Use the exported `checkFeed`.
 */
async function checkFeedInternal(feedId: string): Promise<number> {
  const store = useRssStore.getState();
  const feed = store.getFeed(feedId);
  if (!feed) return 0;

  store.setChecking(feedId, true);
  try {
    const parsed = await fetchAndParseFeed(feed.url);

    // Advance the marker to the newest item in the document regardless of filtering, so
    // items rejected by the keyword filter aren't re-evaluated on every future check.
    const newestId = parsed.items[0]?.id ?? feed.lastSeenItemId;

    const isFirstCheck = feed.lastSeenItemId === null;
    const candidates = newItemsSince(parsed.items, feed.lastSeenItemId)
      .filter((item) => matchesKeywords(item, feed.keywords))
      .slice(0, isFirstCheck ? FEED_INITIAL_ITEM_LIMIT : FEED_MAX_ITEMS_PER_CHECK);

    useRssStore.getState().updateFeed(feedId, {
      lastSeenItemId: newestId,
      lastCheckedAt: Date.now(),
      lastError: null,
      // Backstop only — subscribeToFeed always stores a non-empty title.
      title: feed.title || parsed.title || hostnameOf(feed.url),
    });

    if (candidates.length === 0) {
      log('rss', `${feed.title}: no new matching items`);
      return 0;
    }

    log('rss', `${feed.title}: queueing ${candidates.length} new item(s)`);

    const destinationPath = destinationForFeed(feed);

    let queued = 0;
    for (const item of candidates) {
      if (alreadyQueued(item.link)) {
        log('rss', `${feed.title}: skipping already-queued ${item.link}`);
        continue;
      }

      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      useUploadStore
        .getState()
        .addProcessingJob(jobId, `Clipping ${item.title}...`, 'clip', {
          source: 'rss',
          sourceLabel: feed.title,
          originalUrl: item.link,
          destinationPath,
        });

      // Sequential: one shared WebView extractor. Each item parks itself as
      // 'pending-fetch' or 'failed' internally, so one bad article can't abort the run.
      await runArticleExtractionJob(jobId, item.link, { destinationPath });
      queued += 1;
    }

    return queued;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    useRssStore.getState().updateFeed(feedId, {
      lastCheckedAt: Date.now(),
      lastError: message,
    });
    log('rss', `${feed.title}: check failed — ${message}`);
    return 0;
  } finally {
    useRssStore.getState().setChecking(feedId, false);
  }
}

/**
 * Checks a single feed. Ignored (returns 0) if any check is already running — the
 * per-feed refresh button and "Check Now" share the one WebView extractor.
 */
export async function checkFeed(feedId: string): Promise<number> {
  if (checking) {
    log('rss', 'Check already in progress, skipping');
    return 0;
  }
  checking = true;
  try {
    return await checkFeedInternal(feedId);
  } finally {
    checking = false;
  }
}

/**
 * Checks every enabled feed in sequence. Returns the total number of items queued.
 * Concurrent invocations are ignored (returns 0) — see the `checking` guard.
 */
export async function checkAllFeeds(): Promise<number> {
  if (checking) {
    log('rss', 'Check already in progress, skipping');
    return 0;
  }

  const feeds = useRssStore.getState().getEnabledFeeds();
  if (feeds.length === 0) return 0;

  checking = true;
  log('rss', `Checking ${feeds.length} feed(s)`);
  try {
    let total = 0;
    for (const feed of feeds) {
      // Re-read: the feed may have been removed or disabled mid-run.
      const current = useRssStore.getState().getFeed(feed.id);
      if (!current || !current.enabled) continue;
      total += await checkFeedInternal(feed.id);
    }
    log('rss', `Check complete — ${total} item(s) queued`);
    return total;
  } finally {
    checking = false;
  }
}

/**
 * Validates and subscribes to a feed URL. Resolves the feed title up front so the list
 * shows something meaningful, and rejects URLs that don't parse as RSS/Atom.
 * Returns the new feed's id.
 */
export async function subscribeToFeed(url: string): Promise<RssFeed> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Feed URL must start with http:// or https://');
  }
  if (useRssStore.getState().hasFeedUrl(trimmed)) {
    throw new Error('You are already subscribed to that feed');
  }

  // Throws if unreachable or not a feed — we don't want to persist a broken subscription.
  const parsed = await fetchAndParseFeed(trimmed);

  const title = parsed.title || hostnameOf(trimmed);
  // A title in a non-Latin script slugs to nothing; fall back to the hostname so the
  // feed still gets its own folder instead of sharing the base path.
  const folderName = toFolderName(title) || toFolderName(hostnameOf(trimmed));

  const id = useRssStore.getState().addFeed({ url: trimmed, title, folderName });

  const feed = useRssStore.getState().getFeed(id)!;
  log('rss', `Subscribed to "${feed.title}" (${feed.url})`);
  return feed;
}
