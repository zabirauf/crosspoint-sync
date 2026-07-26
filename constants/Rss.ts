/** Network timeout for fetching a feed document. Feeds are on the internet, not the
 *  local device, so this is independent of `REQUEST_TIMEOUT_MS` in Protocol.ts. */
export const FEED_FETCH_TIMEOUT_MS = 15_000;

/** Guard against a malformed/huge feed document eating memory on a phone. */
export const FEED_MAX_BYTES = 5 * 1024 * 1024;

/** Characters kept in an item's plain-text summary. */
export const FEED_SUMMARY_MAX_CHARS = 300;

/** On first subscribe there is no `lastSeenItemId`, so the whole feed looks "new".
 *  Queue only this many of the newest matching items so adding a feed doesn't kick off
 *  a 50-article extraction burst. */
export const FEED_INITIAL_ITEM_LIMIT = 3;

/** Ceiling on items queued from one feed in one check. Also bounds the damage when a
 *  publisher regenerates every GUID and the whole feed reads as new. */
export const FEED_MAX_ITEMS_PER_CHECK = 10;

/** Default poll interval for the (later) background scheduler. */
export const FEED_DEFAULT_POLL_INTERVAL_MINUTES = 60;
