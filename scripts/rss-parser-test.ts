#!/usr/bin/env npx tsx
/**
 * RSS/Atom Parser Test Suite
 *
 * Validates services/rss-parser.ts against synthetic edge cases (RSS 2.0, RSS 1.0/RDF,
 * Atom, malformed input) and, with --live, against real feeds over the network.
 *
 * Usage:
 *   npm run test:rss           # Synthetic cases only (offline)
 *   npm run test:rss:live      # Also fetch and parse real feeds
 */
import { parseFeedXml, fetchAndParseFeed } from '../services/rss-parser';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

console.log('\nRSS 2.0');
{
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel><title>Ars &amp; Co</title>
      <item>
        <title>Numeric title 2024</title>
        <link>https://ex.com/a</link>
        <guid isPermaLink="false">tag:ex,1</guid>
        <pubDate>Wed, 02 Oct 2024 13:00:00 GMT</pubDate>
        <description><![CDATA[<p>Hello <b>world</b> &amp;amp; more</p>]]></description>
      </item>
      <item>
        <title>E1</title>
        <link>https://ex.com/b</link>
        <pubDate>Thu, 03 Oct 2024 13:00:00 GMT</pubDate>
        <content:encoded><![CDATA[<p>body only</p>]]></content:encoded>
      </item>
    </channel></rss>`;
  const feed = parseFeedXml(xml);
  check('channel title entity-decoded', feed.title === 'Ars & Co', feed.title);
  check('two items', feed.items.length === 2, feed.items.length);
  check('sorted newest-first', feed.items[0].link === 'https://ex.com/b', feed.items.map(i => i.link));
  check('numeric-looking title survives', feed.items[1].title === 'Numeric title 2024', feed.items[1].title);
  check('exponent-looking title survives', feed.items[0].title === 'E1', feed.items[0].title);
  check('guid preferred as id', feed.items[1].id === 'tag:ex,1', feed.items[1].id);
  check('link used as id when no guid', feed.items[0].id === 'https://ex.com/b', feed.items[0].id);
  // Single decode pass, matching browser behaviour: the source's double-encoded
  // "&amp;amp;" correctly resolves to the literal text "&amp;", not "&".
  check('CDATA html stripped to text', feed.items[1].summary === 'Hello world &amp; more', feed.items[1].summary);
  check('content:encoded fallback', feed.items[0].summary === 'body only', feed.items[0].summary);
  check('pubDate parsed', feed.items[1].publishedAt === Date.parse('Wed, 02 Oct 2024 13:00:00 GMT'));
}

console.log('\nSingle item (no array collapse)');
{
  const feed = parseFeedXml(`<rss><channel><title>T</title><item><title>Only</title><link>https://x/1</link></item></channel></rss>`);
  check('one item parsed', feed.items.length === 1, feed.items.length);
}

console.log('\nAtom');
{
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Blog</title>
    <entry>
      <title>Post One</title>
      <link rel="self" href="https://ex.com/self"/>
      <link rel="alternate" href="https://ex.com/post-1"/>
      <id>urn:uuid:1</id>
      <updated>2024-10-02T13:00:00Z</updated>
      <summary type="html">&lt;p&gt;Escaped &lt;i&gt;html&lt;/i&gt;&lt;/p&gt;</summary>
    </entry></feed>`;
  const feed = parseFeedXml(xml);
  check('atom title', feed.title === 'Atom Blog', feed.title);
  check('prefers rel=alternate link', feed.items[0].link === 'https://ex.com/post-1', feed.items[0].link);
  check('atom id', feed.items[0].id === 'urn:uuid:1', feed.items[0].id);
  check('escaped html stripped', feed.items[0].summary === 'Escaped html', feed.items[0].summary);
  check('updated parsed', feed.items[0].publishedAt === Date.parse('2024-10-02T13:00:00Z'));
}

console.log('\nRSS 1.0 / RDF');
{
  const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel><title>RDF Feed</title></channel>
    <item><title>RDF Item</title><link>https://ex.com/rdf-1</link><dc:date>2024-10-02T13:00:00Z</dc:date></item>
  </rdf:RDF>`;
  const feed = parseFeedXml(xml);
  check('rdf title', feed.title === 'RDF Feed', feed.title);
  check('rdf item', feed.items[0]?.link === 'https://ex.com/rdf-1', feed.items[0]);
  check('dc:date parsed', feed.items[0]?.publishedAt === Date.parse('2024-10-02T13:00:00Z'));
}

console.log('\nMalformed / hostile input');
{
  check('html page rejected', (() => {
    try { parseFeedXml('<html><body>not a feed</body></html>'); return false; } catch { return true; }
  })());
  check('empty string rejected', (() => {
    try { parseFeedXml(''); return false; } catch { return true; }
  })());
  const noLink = parseFeedXml(`<rss><channel><title>T</title><item><title>No link</title></item></channel></rss>`);
  check('item without link dropped', noLink.items.length === 0, noLink.items);
  const undated = parseFeedXml(`<rss><channel><title>T</title><item><title>A</title><link>https://x/1</link><pubDate>garbage</pubDate></item></channel></rss>`);
  check('unparseable date → null', undated.items[0].publishedAt === null, undated.items[0].publishedAt);
}

async function live() {
  const urls = [
    'https://news.ycombinator.com/rss',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.theverge.com/rss/index.xml',
    'https://lwn.net/headlines/newrss',
  ];
  console.log('\nLive feeds');
  for (const url of urls) {
    try {
      const feed = await fetchAndParseFeed(url);
      const first = feed.items[0];
      const ok = feed.items.length > 0 && !!first.link && !!first.title && !!first.id;
      check(`${url} → "${feed.title}" (${feed.items.length} items)`, ok);
      if (first) {
        console.log(`      newest: ${first.title.slice(0, 60)}`);
        console.log(`      link:   ${first.link.slice(0, 70)}`);
        console.log(`      date:   ${first.publishedAt ? new Date(first.publishedAt).toISOString() : 'null'}`);
        console.log(`      sum:    ${first.summary.slice(0, 70)}`);
      }
    } catch (e) {
      check(`${url}`, false, e instanceof Error ? e.message : String(e));
    }
  }
}

(async () => {
  if (process.argv.includes('--live')) await live();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
