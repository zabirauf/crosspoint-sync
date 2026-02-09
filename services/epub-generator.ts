import JSZip from 'jszip';
import { File, Directory, Paths } from 'expo-file-system';
import { log } from '@/services/logger';
import type { ClipImage } from '@/types/clip';

// ──────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────

interface EpubOptions {
  title: string;
  author: string;
  sourceUrl: string;
  html: string; // Pre-sanitized HTML content (from DOMPurify in extension)
  images: Array<ClipImage & { data: Uint8Array }>; // Images with binary data loaded
  clippedAt: number;
}

/**
 * Generates an EPUB file from clipped article HTML + images.
 * Returns the file URI of the generated EPUB in the cache directory.
 */
export async function generateEpub(options: EpubOptions): Promise<{ uri: string; size: number }> {
  const { title, author, sourceUrl, html, images, clippedAt } = options;
  const bookId = `zync-clip-${clippedAt}-${Math.random().toString(36).slice(2, 9)}`;
  const sanitizedTitle = escapeXml(title);
  const sanitizedAuthor = escapeXml(author);

  // Rewrite image src URLs to local paths and prepare image manifest entries
  const { rewrittenHtml, imageEntries } = rewriteImageSources(html, images);

  // Convert to XHTML
  const xhtml = wrapInXhtml(sanitizedTitle, fixupXhtml(rewrittenHtml));

  const zip = new JSZip();

  // mimetype MUST be first entry, uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.file('META-INF/container.xml', CONTAINER_XML);

  // OEBPS/content.opf
  zip.file('OEBPS/content.opf', buildContentOpf(bookId, sanitizedTitle, sanitizedAuthor, sourceUrl, clippedAt, imageEntries));

  // OEBPS/toc.ncx (EPUB 2.0 fallback)
  zip.file('OEBPS/toc.ncx', buildTocNcx(bookId, sanitizedTitle));

  // OEBPS/nav.xhtml (EPUB 3.0 navigation)
  zip.file('OEBPS/nav.xhtml', buildNavXhtml(sanitizedTitle));

  // OEBPS/chapter.xhtml
  zip.file('OEBPS/chapter.xhtml', xhtml);

  // OEBPS/styles.css
  zip.file('OEBPS/styles.css', EINK_STYLESHEET);

  // OEBPS/images/*
  for (const img of imageEntries) {
    zip.file(`OEBPS/images/${img.filename}`, img.data);
  }

  // Generate the zip buffer
  const buffer = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' });

  // Write to cache directory
  const outputDir = new Directory(Paths.cache, 'generated-epubs');
  if (!outputDir.exists) {
    outputDir.create();
  }

  const safeFilename = title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) || 'article';
  const outputFile = new File(outputDir, `${safeFilename}-${Date.now()}.epub`);
  outputFile.write(buffer);

  log('clip', `Generated EPUB: ${outputFile.name} (${buffer.length} bytes, ${imageEntries.length} images)`);

  return { uri: outputFile.uri, size: buffer.length };
}

// ──────────────────────────────────────────────────────
// XHTML fixup
// ──────────────────────────────────────────────────────

/** Lightweight XHTML fixup for content that's already been through DOMPurify */
function fixupXhtml(html: string): string {
  // Self-close void elements
  const voidElements = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
  let result = html;
  for (const tag of voidElements) {
    // Match <tag ...> that isn't already self-closed
    const re = new RegExp(`<(${tag})(\\s[^>]*)?\\/?>(?!\\s*<\\/${tag}>)`, 'gi');
    result = result.replace(re, (_, name, attrs) => `<${name}${attrs || ''}/>`);
  }

  // Escape bare ampersands (not already part of entity)
  result = result.replace(/&(?!#?\w+;)/g, '&amp;');

  return result;
}

function wrapInXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${title}</h1>
  ${bodyHtml}
</body>
</html>`;
}

// ──────────────────────────────────────────────────────
// Image rewriting
// ──────────────────────────────────────────────────────

interface ImageEntry {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

function rewriteImageSources(
  html: string,
  images: Array<ClipImage & { data: Uint8Array }>
): { rewrittenHtml: string; imageEntries: ImageEntry[] } {
  const imageEntries: ImageEntry[] = [];
  let rewrittenHtml = html;

  for (const img of images) {
    const ext = mimeToExtension(img.mimeType);
    const filename = `img-${imageEntries.length}${ext}`;
    imageEntries.push({ filename, mimeType: img.mimeType, data: img.data });

    // Replace all occurrences of the original URL with the local path
    rewrittenHtml = rewrittenHtml.split(img.originalUrl).join(`images/${filename}`);
  }

  return { rewrittenHtml, imageEntries };
}

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
  };
  return map[mime] || '.bin';
}

// ──────────────────────────────────────────────────────
// EPUB template files
// ──────────────────────────────────────────────────────

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function buildContentOpf(
  bookId: string,
  title: string,
  author: string,
  sourceUrl: string,
  clippedAt: number,
  images: ImageEntry[]
): string {
  const date = new Date(clippedAt).toISOString().split('T')[0];
  const imageManifest = images
    .map((img, i) => `    <item id="img-${i}" href="images/${img.filename}" media-type="${img.mimeType}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:source>${escapeXml(sourceUrl)}</dc:source>
    <dc:date>${date}</dc:date>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date(clippedAt).toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${imageManifest}
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter"/>
  </spine>
</package>`;
}

function buildTocNcx(bookId: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
  </head>
  <docTitle>
    <text>${title}</text>
  </docTitle>
  <navMap>
    <navPoint id="chapter" playOrder="1">
      <navLabel>
        <text>${title}</text>
      </navLabel>
      <content src="chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
}

function buildNavXhtml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="chapter.xhtml">${title}</a></li>
    </ol>
  </nav>
</body>
</html>`;
}

const EINK_STYLESHEET = `/* E-ink optimized styles */
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 1em;
  padding: 0;
  color: #000;
  background: #fff;
}

h1 {
  font-size: 1.4em;
  line-height: 1.3;
  margin-bottom: 0.5em;
  page-break-after: avoid;
}

h2, h3, h4, h5, h6 {
  line-height: 1.3;
  margin-top: 1em;
  margin-bottom: 0.5em;
  page-break-after: avoid;
}

p {
  margin: 0.5em 0;
  text-align: justify;
  orphans: 2;
  widows: 2;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0.5em auto;
}

a {
  color: #000;
  text-decoration: underline;
}

blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 2px solid #666;
}

pre, code {
  font-family: "Courier New", monospace;
  font-size: 0.9em;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 1em 0;
  padding: 0.5em;
  border: 1px solid #ccc;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

td, th {
  border: 1px solid #ccc;
  padding: 0.3em 0.5em;
}

figure {
  margin: 1em 0;
  text-align: center;
}

figcaption {
  font-size: 0.9em;
  font-style: italic;
  margin-top: 0.3em;
}
`;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
