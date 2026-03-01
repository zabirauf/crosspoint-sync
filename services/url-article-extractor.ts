import { Directory, Paths } from 'expo-file-system';
import { log } from '@/services/logger';
import type { ClipImage } from '@/types/clip';

const MAX_IMAGES = 20;

interface ExtractedArticle {
  title: string;
  author: string;
  sourceUrl: string;
  html: string;
  images: Array<ClipImage & { data: Uint8Array }>;
}

/**
 * Fetches a URL and extracts article content using heuristics.
 * Used on Android as a replacement for the Safari Web Extension's Defuddle-based extraction.
 */
export async function extractArticleFromUrl(url: string): Promise<ExtractedArticle> {
  log('clip', `Fetching article from ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  const title = extractTitle(html, url);
  const author = extractAuthor(html);
  const articleHtml = extractArticleContent(html);
  const { rewrittenHtml, downloaded } = await downloadImages(articleHtml, url);

  log('clip', `Extracted: "${title}" by ${author || 'unknown'} (${downloaded.length} images)`);

  return {
    title,
    author,
    sourceUrl: url,
    html: rewrittenHtml,
    images: downloaded,
  };
}

function extractTitle(html: string, url: string): string {
  // Try og:title first
  const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"/i)?.[1]
    ?? html.match(/<meta\s+content="([^"]*)"\s+(?:property|name)="og:title"/i)?.[1];
  if (ogTitle?.trim()) return decodeEntities(ogTitle.trim());

  // Try <title> tag
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  if (titleTag?.trim()) return decodeEntities(titleTag.trim());

  // Fallback to URL hostname
  try {
    return new URL(url).hostname;
  } catch {
    return 'Article';
  }
}

function extractAuthor(html: string): string {
  // Try meta author
  const metaAuthor = html.match(/<meta\s+name="author"\s+content="([^"]*)"/i)?.[1]
    ?? html.match(/<meta\s+content="([^"]*)"\s+name="author"/i)?.[1];
  if (metaAuthor?.trim()) return decodeEntities(metaAuthor.trim());

  // Try JSON-LD author
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const author = ld.author?.name ?? ld.author?.[0]?.name;
      if (author) return author;
    } catch {
      // Invalid JSON-LD
    }
  }

  return '';
}

function extractArticleContent(html: string): string {
  // Remove script, style, nav, footer, header, aside tags
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to find <article> tag
  const articleMatch = content.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[1];

  // Try <main> tag
  const mainMatch = content.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];

  // Try role="main"
  const roleMainMatch = content.match(/<[^>]+role="main"[^>]*>([\s\S]*?)<\/\w+>/i);
  if (roleMainMatch) return roleMainMatch[1];

  // Fallback: extract body content
  const bodyMatch = content.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1] ?? content;
}

async function downloadImages(
  html: string,
  baseUrl: string,
): Promise<{ rewrittenHtml: string; downloaded: Array<ClipImage & { data: Uint8Array }> }> {
  const downloaded: Array<ClipImage & { data: Uint8Array }> = [];
  let rewrittenHtml = html;

  // Find all img src URLs
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  const urls = new Set<string>();
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    if (urls.size >= MAX_IMAGES) break;
    const src = match[1];
    if (src && !src.startsWith('data:')) {
      urls.add(src);
    }
  }

  const imgDir = new Directory(Paths.cache, 'clip-images-tmp');
  if (!imgDir.exists) {
    imgDir.create();
  }

  for (const src of urls) {
    try {
      const absoluteUrl = resolveUrl(src, baseUrl);
      const response = await fetch(absoluteUrl, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const mimeType = contentType.split(';')[0].trim();

      if (!mimeType.startsWith('image/')) continue;

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);

      if (data.length === 0) continue;

      const localPath = `clip-images-tmp/img-${downloaded.length}`;

      downloaded.push({
        originalUrl: src,
        localPath,
        mimeType,
        data,
      });
    } catch {
      // Skip failed images — article text is still readable
    }
  }

  // No URL rewriting needed here — epub-generator.ts handles rewriting
  // originalUrl → local path when building the EPUB.

  return { rewrittenHtml, downloaded };
}

/**
 * Downloads images from a pre-extracted list of absolute URLs.
 * Used by the WebView extraction path which already has resolved image URLs.
 */
export async function downloadImagesFromUrls(
  imageUrls: string[],
): Promise<Array<ClipImage & { data: Uint8Array }>> {
  const downloaded: Array<ClipImage & { data: Uint8Array }> = [];

  const imgDir = new Directory(Paths.cache, 'clip-images-tmp');
  if (!imgDir.exists) {
    imgDir.create();
  }

  for (const rawUrl of imageUrls.slice(0, MAX_IMAGES)) {
    try {
      // Resolve protocol-relative URLs before fetching
      const url = rawUrl.startsWith('//') ? 'https:' + rawUrl : rawUrl;
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const mimeType = contentType.split(';')[0].trim();

      if (!mimeType.startsWith('image/')) continue;

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);

      if (data.length === 0) continue;

      const localPath = `clip-images-tmp/img-${downloaded.length}`;

      downloaded.push({
        originalUrl: rawUrl,
        localPath,
        mimeType,
        data,
      });
    } catch {
      // Skip failed images
    }
  }

  return downloaded;
}

function resolveUrl(src: string, baseUrl: string): string {
  // Protocol-relative URLs
  if (src.startsWith('//')) {
    return 'https:' + src;
  }
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}
