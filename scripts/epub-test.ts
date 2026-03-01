#!/usr/bin/env npx tsx
/**
 * EPUB Generator Test Suite
 *
 * Validates epub-generator.ts by running test cases through buildEpubZip()
 * and inspecting the resulting ZIP structure.
 *
 * Usage:
 *   npm run test:epub              # Run all tests (unit + integration if available)
 *   npm run test:epub:unit         # Unit tests only
 *   npm run test:epub:integration  # Integration tests only (fetches real URLs)
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import JSZip from 'jszip';

// Import the pure functions from epub-generator (no expo-file-system needed)
import {
  buildEpubZip,
  rewriteImageSources,
  fixupXhtml,
  escapeXml,
  mimeToExtension,
  type EpubBuildOptions,
} from '../services/epub-generator';

// ──────────────────────────────────────────────────────
// Test infrastructure
// ──────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
}

const results: TestResult[] = [];
let currentTest: TestResult | null = null;

function startTest(name: string) {
  currentTest = { name, passed: true, errors: [] };
}

function fail(message: string) {
  if (currentTest) {
    currentTest.passed = false;
    currentTest.errors.push(message);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) fail(message);
}

function endTest() {
  if (currentTest) {
    results.push(currentTest);
    const icon = currentTest.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${currentTest.name}`);
    if (!currentTest.passed) {
      for (const err of currentTest.errors) {
        console.log(`    \x1b[31m→ ${err}\x1b[0m`);
      }
    }
    currentTest = null;
  }
}

// 1x1 pixel test images (minimal valid files)
const TEST_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
  0xae, 0x42, 0x60, 0x82,
]);

// Minimal JPEG (smallest valid JFIF)
const TEST_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b,
  0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
  0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c,
  0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
  0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
  0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04,
  0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03,
  0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61,
  0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1,
  0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34,
  0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
  0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
  0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93,
  0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6,
  0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9,
  0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3,
  0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5,
  0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7,
  0xf8, 0xf9, 0xfa,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7b, 0x40,
  0x1b, 0x00,
  0xff, 0xd9,
]);

function getTestImageData(mimeType: string): Uint8Array {
  if (mimeType === 'image/png') return TEST_PNG;
  // Use JPEG bytes for all other types (they won't be decoded, just stored)
  return TEST_JPEG;
}

// ──────────────────────────────────────────────────────
// Unit tests from helper functions
// ──────────────────────────────────────────────────────

function runHelperTests() {
  console.log('\n\x1b[1mHelper function tests\x1b[0m');

  // escapeXml
  startTest('escapeXml escapes all XML special characters');
  assert(escapeXml('Tom & Jerry') === 'Tom &amp; Jerry', 'ampersand not escaped');
  assert(escapeXml('<tag>') === '&lt;tag&gt;', 'angle brackets not escaped');
  assert(escapeXml('"quoted"') === '&quot;quoted&quot;', 'quotes not escaped');
  assert(escapeXml("it's") === "it&apos;s", 'apostrophe not escaped');
  endTest();

  // mimeToExtension
  startTest('mimeToExtension returns correct extensions');
  assert(mimeToExtension('image/jpeg') === '.jpg', 'jpeg');
  assert(mimeToExtension('image/png') === '.png', 'png');
  assert(mimeToExtension('image/gif') === '.gif', 'gif');
  assert(mimeToExtension('image/webp') === '.webp', 'webp');
  assert(mimeToExtension('image/svg+xml') === '.svg', 'svg');
  assert(mimeToExtension('image/avif') === '.avif', 'avif');
  assert(mimeToExtension('image/bmp') === '.bin', 'unknown type falls back to .bin');
  endTest();

  // fixupXhtml
  startTest('fixupXhtml self-closes void elements');
  const fixed = fixupXhtml('<p>Hello<br>world</p><hr><img src="x" alt="y">');
  assert(fixed.includes('<br/>'), `br not self-closed: ${fixed}`);
  assert(fixed.includes('<hr/>'), `hr not self-closed: ${fixed}`);
  assert(fixed.includes('/>'), 'img not self-closed');
  endTest();

  startTest('fixupXhtml escapes bare ampersands');
  const ampFixed = fixupXhtml('<p>Tom & Jerry &amp; friends</p>');
  assert(ampFixed.includes('Tom &amp; Jerry'), 'bare & not escaped');
  assert(!ampFixed.includes('&amp;amp;'), 'already-escaped &amp; was double-escaped');
  endTest();

  // rewriteImageSources
  startTest('rewriteImageSources rewrites URLs and creates entries');
  const { rewrittenHtml, imageEntries } = rewriteImageSources(
    '<img src="https://example.com/a.jpg"><img src="https://example.com/b.png">',
    [
      { originalUrl: 'https://example.com/a.jpg', localPath: 'x', mimeType: 'image/jpeg', data: TEST_JPEG },
      { originalUrl: 'https://example.com/b.png', localPath: 'x', mimeType: 'image/png', data: TEST_PNG },
    ]
  );
  assert(imageEntries.length === 2, `expected 2 entries, got ${imageEntries.length}`);
  assert(rewrittenHtml.includes('images/img-0.jpg'), 'first image not rewritten');
  assert(rewrittenHtml.includes('images/img-1.png'), 'second image not rewritten');
  assert(!rewrittenHtml.includes('example.com'), 'original URL still present');
  endTest();
}

// ──────────────────────────────────────────────────────
// YAML-driven EPUB build tests
// ──────────────────────────────────────────────────────

interface TestCase {
  name: string;
  description: string;
  input: {
    title: string;
    author: string;
    sourceUrl: string;
    html: string;
    images: Array<{ originalUrl: string; mimeType: string }>;
  };
  expect: {
    hasValidStructure?: boolean;
    imageCount?: number;
    imagesRewritten?: boolean;
    noExternalImageUrls?: boolean;
    manifestHasAllImages?: boolean;
    xmlWellFormed?: boolean;
    xhtmlValid?: boolean;
    bodyContains?: string[];
  };
}

async function runYamlTests() {
  console.log('\n\x1b[1mEPUB build tests (from test-cases.yaml)\x1b[0m');

  const yamlPath = path.resolve(__dirname, '..', 'test-fixtures', 'epub', 'test-cases.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
  const testCases: TestCase[] = YAML.parse(yamlContent);

  for (const tc of testCases) {
    startTest(tc.name);

    try {
      // Build images with test binary data
      const images = tc.input.images.map((img) => ({
        originalUrl: img.originalUrl,
        localPath: 'test',
        mimeType: img.mimeType,
        data: getTestImageData(img.mimeType),
      }));

      const options: EpubBuildOptions = {
        title: tc.input.title,
        author: tc.input.author,
        sourceUrl: tc.input.sourceUrl,
        html: tc.input.html,
        images,
        clippedAt: Date.now(),
        bookId: `test-${tc.name.replace(/\s+/g, '-').toLowerCase()}`,
      };

      const result = await buildEpubZip(options);
      const zip = await JSZip.loadAsync(result.buffer);

      // ── Validate structure ──
      if (tc.expect.hasValidStructure) {
        assert(zip.file('mimetype') !== null, 'missing mimetype');
        assert(zip.file('META-INF/container.xml') !== null, 'missing container.xml');
        assert(zip.file('OEBPS/content.opf') !== null, 'missing content.opf');
        assert(zip.file('OEBPS/toc.ncx') !== null, 'missing toc.ncx');
        assert(zip.file('OEBPS/nav.xhtml') !== null, 'missing nav.xhtml');
        assert(zip.file('OEBPS/chapter.xhtml') !== null, 'missing chapter.xhtml');
        assert(zip.file('OEBPS/styles.css') !== null, 'missing styles.css');

        const mimetypeContent = await zip.file('mimetype')!.async('string');
        assert(mimetypeContent === 'application/epub+zip', `mimetype content wrong: ${mimetypeContent}`);
      }

      // ── Validate image count ──
      if (tc.expect.imageCount !== undefined) {
        assert(
          result.imageEntries.length === tc.expect.imageCount,
          `expected ${tc.expect.imageCount} images, got ${result.imageEntries.length}`
        );

        // Verify image files exist in ZIP with correct binary data
        for (let idx = 0; idx < result.imageEntries.length; idx++) {
          const entry = result.imageEntries[idx];
          const zipPath = `OEBPS/images/${entry.filename}`;
          assert(zip.file(zipPath) !== null, `image file missing from ZIP: ${zipPath}`);

          // Byte-for-byte round-trip integrity check
          const stored = await zip.file(zipPath)!.async('uint8array');
          const expected = images[idx].data;
          assert(stored.length === expected.length,
            `image ${entry.filename}: size mismatch (stored=${stored.length}, expected=${expected.length})`);
          let bytesMatch = true;
          for (let b = 0; b < expected.length; b++) {
            if (stored[b] !== expected[b]) { bytesMatch = false; break; }
          }
          assert(bytesMatch, `image ${entry.filename}: binary data differs after round-trip through ZIP`);
        }
      }

      // ── Validate images rewritten + renderable ──
      if (tc.expect.imagesRewritten) {
        const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');

        // Every rewritten src path in chapter.xhtml must point to a real file in the ZIP
        const srcMatches = [...chapter.matchAll(/src="([^"]+)"/g)];
        for (const [, srcValue] of srcMatches) {
          if (srcValue.startsWith('data:')) continue;
          // src paths in XHTML are relative to OEBPS/chapter.xhtml
          const zipPath = `OEBPS/${srcValue}`;
          assert(
            zip.file(zipPath) !== null,
            `chapter.xhtml references "${srcValue}" but ${zipPath} doesn't exist in ZIP`
          );
        }

        // Every image entry should be referenced in the chapter
        for (let i = 0; i < result.imageEntries.length; i++) {
          assert(
            chapter.includes(`images/${result.imageEntries[i].filename}`),
            `chapter.xhtml missing rewritten path for image ${i}: images/${result.imageEntries[i].filename}`
          );
        }

        // No original URLs should remain in img src attributes
        for (const img of tc.input.images) {
          const srcAttrPattern = `src="${img.originalUrl}"`;
          assert(
            !chapter.includes(srcAttrPattern),
            `chapter.xhtml still has original URL in src: ${img.originalUrl}`
          );
        }
      }

      // ── Validate no external image URLs ──
      if (tc.expect.noExternalImageUrls) {
        const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');
        // Check that no src attributes point to http(s):// or // URLs
        const externalSrcMatch = chapter.match(/src="(https?:\/\/[^"]+|\/\/[^"]+)"/);
        assert(
          !externalSrcMatch,
          `chapter.xhtml still contains external image URL: ${externalSrcMatch?.[1]}`
        );
      }

      // ── Validate manifest has all images ──
      if (tc.expect.manifestHasAllImages) {
        const opf = await zip.file('OEBPS/content.opf')!.async('string');
        for (const entry of result.imageEntries) {
          assert(
            opf.includes(`href="images/${entry.filename}"`),
            `content.opf missing manifest entry for ${entry.filename}`
          );
          assert(
            opf.includes(`media-type="${entry.mimeType}"`),
            `content.opf missing media-type for ${entry.filename}`
          );
        }
      }

      // ── Validate XML well-formedness ──
      if (tc.expect.xmlWellFormed) {
        const opf = await zip.file('OEBPS/content.opf')!.async('string');
        // Basic check: no unescaped < > & in text content
        assert(opf.includes('<?xml'), 'content.opf missing XML declaration');
        // Title and author should be escaped
        assert(!opf.includes('Tom & Jerry'), 'unescaped & in content.opf');
      }

      // ── Validate XHTML fixup ──
      if (tc.expect.xhtmlValid) {
        const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');
        // Void elements should be self-closed
        const openBr = chapter.match(/<br[^/]*>(?!\s*<\/br>)/);
        assert(!openBr, `unclosed <br> found in chapter.xhtml`);
        const openHr = chapter.match(/<hr[^/]*>(?!\s*<\/hr>)/);
        assert(!openHr, `unclosed <hr> found in chapter.xhtml`);
      }

      // ── Validate body contains ──
      if (tc.expect.bodyContains) {
        const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');
        for (const expected of tc.expect.bodyContains) {
          assert(chapter.includes(expected), `chapter.xhtml missing expected content: "${expected}"`);
        }
      }
    } catch (err: any) {
      fail(`Exception: ${err.message}`);
    }

    endTest();
  }
}

// ──────────────────────────────────────────────────────
// Integration tests (--integration flag)
// ──────────────────────────────────────────────────────

async function runIntegrationTests() {
  console.log('\n\x1b[1mIntegration tests (real URL fetch → EPUB)\x1b[0m');

  // These test the url-article-extractor → buildEpubZip pipeline
  // Only run when explicitly requested since they hit the network
  const testUrls = [
    { url: 'https://example.com', minContentLength: 50 },
  ];

  for (const { url, minContentLength } of testUrls) {
    startTest(`Extract and build EPUB from ${url}`);

    try {
      // Dynamic import to avoid pulling in expo-file-system at module level
      // url-article-extractor uses expo-file-system for its Directory/Paths imports
      // so we skip it in integration tests and just test buildEpubZip directly
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 CrossPointSync-Test' },
        signal: AbortSignal.timeout(15_000),
      });
      assert(response.ok, `fetch failed: HTTP ${response.status}`);

      const html = await response.text();
      assert(html.length >= minContentLength, `content too short: ${html.length} chars`);

      // Build a basic EPUB from the fetched content
      const result = await buildEpubZip({
        title: 'Integration Test',
        author: 'Test',
        sourceUrl: url,
        html: `<p>${html.slice(0, 2000)}</p>`,
        images: [],
        clippedAt: Date.now(),
        bookId: 'integration-test',
      });

      assert(result.buffer.length > 0, 'EPUB buffer is empty');

      const zip = await JSZip.loadAsync(result.buffer);
      assert(zip.file('mimetype') !== null, 'missing mimetype in integration EPUB');
      assert(zip.file('OEBPS/chapter.xhtml') !== null, 'missing chapter.xhtml in integration EPUB');
    } catch (err: any) {
      fail(`Exception: ${err.message}`);
    }

    endTest();
  }
}

// ──────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const unitOnly = args.includes('--unit');
  const integrationOnly = args.includes('--integration');
  const runAll = !unitOnly && !integrationOnly;

  console.log('\x1b[1m\x1b[36m━━━ EPUB Generator Test Suite ━━━\x1b[0m');

  if (runAll || unitOnly) {
    runHelperTests();
    await runYamlTests();
  }

  if (runAll || integrationOnly) {
    await runIntegrationTests();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('\n\x1b[1m━━━ Results ━━━\x1b[0m');
  console.log(`  Total:  ${total}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);
  }

  if (failed > 0) {
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  \x1b[31m✗ ${r.name}\x1b[0m`);
      for (const err of r.errors) {
        console.log(`    → ${err}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll tests passed!\x1b[0m');
  }
}

main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err);
  process.exit(1);
});
