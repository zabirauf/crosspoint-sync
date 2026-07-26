import { XMLParser } from 'fast-xml-parser';
import { ParsedFeed, ParsedFeedItem } from '@/types/rss';
import {
  FEED_FETCH_TIMEOUT_MS,
  FEED_MAX_BYTES,
  FEED_SUMMARY_MAX_CHARS,
} from '@/constants/Rss';

/**
 * `parseTagValue: false` is essential: with fast-xml-parser's default numeric coercion,
 * a title like "E1" is read as exponent notation and comes back as null, and "2024"
 * becomes a number. Feeds are text — keep every value a string.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

/** fast-xml-parser collapses a single repeated tag to an object rather than a 1-element array. */
function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Narrows an arbitrary parsed value to an element node, or an empty node if it isn't one. */
function asNode(value: unknown): XmlNode {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : {};
}

/** Element children as nodes, handling the single-child-collapses-to-object case. */
function childNodes(value: unknown): XmlNode[] {
  return toArray(value as unknown[]).map(asNode);
}

/** Reads element text whether it came back as a bare string or as `{ '#text': ... }`. */
function text(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') {
    const t = (node as Record<string, unknown>)['#text'];
    return t === undefined ? '' : text(t);
  }
  return '';
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Feeds routinely double-encode: the XML parser decodes one layer, leaving literal
 * "&amp;#8217;" style sequences in the text. Decode what remains.
 */
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/** Feed summaries carry HTML; the timeline and the keyword filter both want plain text. */
function toPlainText(html: string, maxChars = FEED_SUMMARY_MAX_CHARS): string {
  const stripped = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const collapsed = decodeEntities(stripped).replace(/\s+/g, ' ').trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars).trimEnd()}…` : collapsed;
}

/** Handles RFC 822 (RSS) and ISO 8601 (Atom); returns null rather than NaN. */
function parseDate(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Atom `<link>` is an attribute-carrying element and often repeats; prefer
 * rel="alternate", then the first link that has an href and isn't a self/edit ref.
 */
function atomLink(node: unknown): string {
  const links = toArray(node as Record<string, unknown> | Record<string, unknown>[]);
  const withHref = links.filter((l) => l && typeof l === 'object' && '@_href' in l);
  const alternate = withHref.find((l) => String(l['@_rel'] ?? 'alternate') === 'alternate');
  const chosen = alternate ?? withHref[0];
  if (chosen) return String(chosen['@_href'] ?? '').trim();
  // Some generators emit a plain-text <link> in an otherwise-Atom document.
  return text(node).trim();
}

function itemIdentity(guid: string, link: string, title: string): string {
  return guid.trim() || link.trim() || title.trim();
}

function parseRssItem(raw: Record<string, unknown>): ParsedFeedItem | null {
  const title = decodeEntities(text(raw.title)).trim();
  const link = text(raw.link).trim() || text(raw['@_rdf:about']).trim();
  const guid = text(raw.guid) || text(raw.id);
  const id = itemIdentity(guid, link, title);
  if (!id || !link) return null;

  // content:encoded is the full article body when a publisher provides it; description
  // is the summary. Prefer description for the excerpt, fall back to the body.
  const summarySource = text(raw.description) || text(raw['content:encoded']);

  return {
    id,
    title: title || link,
    link,
    summary: toPlainText(summarySource),
    publishedAt: parseDate(text(raw.pubDate) || text(raw['dc:date']) || text(raw.date)),
  };
}

function parseAtomEntry(raw: Record<string, unknown>): ParsedFeedItem | null {
  const title = decodeEntities(text(raw.title)).trim();
  const link = atomLink(raw.link);
  const guid = text(raw.id);
  const id = itemIdentity(guid, link, title);
  if (!id || !link) return null;

  const summarySource = text(raw.summary) || text(raw.content);

  return {
    id,
    title: title || link,
    link,
    summary: toPlainText(summarySource),
    publishedAt: parseDate(text(raw.published) || text(raw.updated)),
  };
}

/**
 * Sorts newest-first. Feeds are conventionally already in that order, so items missing a
 * date keep their document position rather than being shuffled to the end.
 */
function sortNewestFirst(items: ParsedFeedItem[]): ParsedFeedItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.publishedAt === null || b.item.publishedAt === null) return a.index - b.index;
      return b.item.publishedAt - a.item.publishedAt;
    })
    .map(({ item }) => item);
}

/** Parses an RSS 2.0, RSS 1.0 (RDF) or Atom document. Throws if it is none of those. */
export function parseFeedXml(xml: string): ParsedFeed {
  let doc: XmlNode;
  try {
    doc = asNode(parser.parse(xml));
  } catch (e) {
    throw new Error(`Feed is not valid XML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const collect = (
    channel: XmlNode,
    rawItems: unknown,
    parse: (raw: XmlNode) => ParsedFeedItem | null,
  ): ParsedFeed => ({
    title: decodeEntities(text(channel.title)).trim(),
    items: sortNewestFirst(
      childNodes(rawItems)
        .map(parse)
        .filter((i): i is ParsedFeedItem => i !== null),
    ),
  });

  // RSS 2.0: <rss><channel>
  if (doc.rss !== undefined) {
    const channel = childNodes(asNode(doc.rss).channel)[0] ?? {};
    return collect(channel, channel.item, parseRssItem);
  }

  // RSS 1.0: <rdf:RDF> with <channel> and <item> as siblings.
  const rdf = doc['rdf:RDF'] ?? doc.RDF;
  if (rdf !== undefined) {
    const rdfNode = asNode(rdf);
    const channel = childNodes(rdfNode.channel)[0] ?? {};
    return collect(channel, rdfNode.item, parseRssItem);
  }

  // Atom: <feed><entry>
  if (doc.feed !== undefined) {
    const feed = asNode(doc.feed);
    return collect(feed, feed.entry, parseAtomEntry);
  }

  throw new Error('Not an RSS or Atom feed');
}

/** Fetches a feed document and parses it. Throws on network error, HTTP error, or bad XML. */
export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        // Some hosts 403 requests without a browser-ish UA.
        'User-Agent': 'Mozilla/5.0 (Android) CrossPointSync/1.0',
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.text();
  if (body.length > FEED_MAX_BYTES) {
    throw new Error('Feed document too large');
  }

  const parsed = parseFeedXml(body);
  return {
    ...parsed,
    title: parsed.title || hostnameOf(url),
  };
}

/** Display fallback when a feed omits its title. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
