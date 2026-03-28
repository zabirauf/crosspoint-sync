# Phase 1: Feed Parser Service

**Goal**: Pure functions to fetch, auto-discover, parse, and validate RSS/Atom feeds. No UI, no store — purely testable logic.

**Prerequisites**: Phase 0 (types and constants).

---

## New file: `services/feed-parser.ts`

### Function signatures

```typescript
/** Fetch and parse an RSS or Atom feed XML into normalized items. */
export async function parseFeed(feedUrl: string): Promise<{
  title: string;
  siteUrl: string;
  items: Array<{
    guid: string;
    title: string;
    link: string;
    pubDate: number;
    snippet: string;
    contentHtml: string | null;
  }>;
}>

/**
 * Given a website URL (not a feed URL), fetch the HTML and look for
 * <link rel="alternate" type="application/rss+xml" href="...">
 * or <link rel="alternate" type="application/atom+xml" href="...">.
 * Returns the discovered feed URL, or null.
 */
export async function discoverFeedUrl(websiteUrl: string): Promise<string | null>

/**
 * Validate that a URL points to a parseable RSS/Atom feed.
 * Returns feed metadata on success, throws on failure.
 */
export async function validateFeed(url: string): Promise<{ feedUrl: string; title: string; siteUrl: string }>

/**
 * Attempts to resolve a user-entered URL to a valid feed URL.
 * 1. Try parsing it directly as a feed.
 * 2. If that fails, try auto-discovery from the HTML.
 * 3. Validate the discovered URL.
 */
export async function resolveFeedUrl(inputUrl: string): Promise<{ feedUrl: string; title: string; siteUrl: string }>

/** Strip HTML tags, decode entities, truncate to maxLength chars. */
export function extractSnippet(html: string, maxLength?: number): string

/** Generate a favicon URL for a given site URL using Google S2 service. */
export function getFaviconUrl(siteUrl: string): string
```

### Implementation notes

- Use the global `fetch()` with `FEED_USER_AGENT` header and `AbortController` timeout (`FEED_FETCH_TIMEOUT_MS`).
- **No XML parser dependency.** Parse XML using regex-based extraction — RSS/Atom structure is simple and predictable:
  - RSS 2.0: Extract `<channel>`, `<item>`, `<title>`, `<link>`, `<pubDate>`, `<description>`, `<content:encoded>`, `<guid>`.
  - Atom: Detect `<feed xmlns="http://www.w3.org/2005/Atom">`, extract `<entry>`, `<title>`, `<link href="...">`, `<updated>`, `<summary>`, `<content>`, `<id>`.
- **Date parsing**:
  - RSS `<pubDate>`: RFC 2822 format → `new Date(pubDateStr).getTime()`
  - Atom `<updated>`: ISO 8601 format → `new Date(updatedStr).getTime()`
- **`extractSnippet`**: Strip all HTML tags, collapse whitespace, decode `&amp;`/`&lt;`/`&gt;`/`&#...;` entities, truncate to `FEED_SNIPPET_MAX_LENGTH`.
- **`getFaviconUrl`**: Return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`.
- **`discoverFeedUrl`**: Fetch the HTML of the website, search for `<link rel="alternate" type="application/rss+xml" href="...">` or the Atom equivalent. Resolve relative URLs to absolute.
- **`resolveFeedUrl`**: The main entry point for user input. Tries direct parsing first (user pasted a feed URL), falls back to auto-discovery (user pasted a website URL), then validates the discovered URL.

---

## Verification

Write and run a test script (`scripts/feed-parser-test.ts`) with `npx tsx` against known public feeds:
- Hacker News RSS (`https://hnrss.org/newest`)
- A WordPress blog feed
- An Atom feed

Verify: title extraction, item count, date parsing, snippet generation, and auto-discovery from a website URL.
