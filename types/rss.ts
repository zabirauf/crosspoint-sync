/** A user-configured RSS/Atom subscription. Persisted in `stores/rss-store.ts`. */
export interface RssFeed {
  id: string;
  url: string;
  /** Feed title resolved at subscribe time; falls back to the URL hostname. */
  title: string;
  /** Case-insensitive substring filters against item title + summary. Empty = queue everything new. */
  keywords: string[];
  /**
   * Subfolder beneath the RSS upload path for this feed's articles, e.g. "lwn-net"
   * lands them in /Rss/lwn-net. Empty string = write straight to the RSS upload path.
   */
  folderName: string;
  /** GUID/link of the newest item seen on the last successful check. */
  lastSeenItemId: string | null;
  enabled: boolean;
  addedAt: number;
  lastCheckedAt: number | null;
  /** Error from the most recent check, cleared on success. */
  lastError: string | null;
}

/** One entry parsed out of a feed document, normalized across RSS 1.0/2.0 and Atom. */
export interface ParsedFeedItem {
  /** Stable identity for diffing: guid/id, falling back to link, then title. */
  id: string;
  title: string;
  link: string;
  /** Plain-text excerpt, entity-decoded and truncated. */
  summary: string;
  publishedAt: number | null;
}

/** A parsed feed document. `items` are ordered newest-first. */
export interface ParsedFeed {
  title: string;
  items: ParsedFeedItem[];
}
