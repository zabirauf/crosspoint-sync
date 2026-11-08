#!/usr/bin/env node
/** Run the actual Safari script and committed Android bundle on an offline image fixture. */
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');
const { buildEpubZip } = require('../services/epub-generator.ts');
const { DEFUDDLE_EXTRACTION_SCRIPT } = require('../services/generated/defuddle-webview-bundle.ts');

const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(root, 'test-fixtures/clipper/substack-images.html'), 'utf8');
const sourceUrl = 'https://clipping-regression.substack.com/p/images';
const expectedUrls = [
  'https://images.example.test/figure-1.png',
  'https://images.example.test/figure-2.jpeg',
];
// Real small PNG bytes; no network or image service is used by this regression check.
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));

test('clipping retains Substack image URLs through EPUB packaging', async (t) => {
  const safari = (await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['extension-src/content.js'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'safari16',
  })).outputFiles[0].text;
  const helper = (await esbuild.build({
    absWorkingDir: root, entryPoints: ['extension-src/image-sources.js'], bundle: true,
    write: false, format: 'iife', globalName: 'clipperImages', target: 'safari16',
  })).outputFiles[0].text;
  const browser = await puppeteer.launch({ headless: true });
  try {
    await t.test('general image sources and download limits', async () => {
      const page = await browser.newPage();
      try {
        await page.addScriptTag({ content: helper });
        const result = await page.evaluate(() => {
          const html = `<img src='{"src":"/one.png?x=1&y=2"}'>
            <img src="data:image/gif;base64,placeholder" data-src="/two.png">
            <img srcset="https://cdn.test/w_424,f_webp/p.png 424w, https://cdn.test/w_1200,f_webp/p.png 1200w">
            <img src="/one.png?x=1&amp;y=2">
            <img data-attrs='{"src":"/metadata.png"}'>
            <img src='{"src":"javascript:alert(1)"}'>
            <img src='{broken'><img src='{"src":""}'>
            <img data-attrs="unrelated.jpg">`;
          return {
            all: clipperImages.normalizeImageSources(html, 'https://reader.test/article'),
            capped: clipperImages.normalizeImageSources(html, 'https://reader.test/article', 2),
          };
        });
        assert.deepEqual(result.all.images, [
          'https://reader.test/one.png?x=1&y=2', 'https://reader.test/two.png',
          'https://cdn.test/w_1200,f_webp/p.png', 'https://reader.test/metadata.png',
        ]);
        assert.equal((result.all.html.match(/<img/g) || []).length, 5);
        assert.ok(!/data-attrs|data-src|srcset|javascript:|broken/.test(result.all.html));
        assert.deepEqual(result.capped.images, result.all.images.slice(0, 2));
        assert.equal((result.capped.html.match(/<img/g) || []).length, 3, 'duplicate image tags share one download');
      } finally { await page.close(); }
    });
    for (const [platform, script] of [['Safari', safari], ['Android', DEFUDDLE_EXTRACTION_SCRIPT]]) {
      await t.test(platform, async () => {
        const page = await browser.newPage();
        try {
          await page.setRequestInterception(true);
          page.on('request', (request) => request.isNavigationRequest()
            ? request.respond({ status: 200, contentType: 'text/html', body: fixture })
            : request.abort());
          await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });
          await page.evaluate(() => {
            window.browser = { runtime: { onMessage: { addListener: (listener) => { window.extractHandler = listener; } } } };
            window.ReactNativeWebView = { postMessage: (message) => { window.extractionResult = JSON.parse(message); } };
          });
          await page.addScriptTag({ content: script });
          const response = platform === 'Safari'
            ? await page.evaluate(() => new Promise((resolve) => window.extractHandler({ action: 'extract' }, null, resolve)))
            : await page.evaluate(() => window.extractionResult);
          assert.equal(response.success, true, response.error);
          const article = response.data ?? response;
          assert.equal(article.title, 'Offline clipping regression');
          assert.match(article.html, /This is a synthetic article/);
          assert.deepEqual(article.images, expectedUrls, 'JSON data-attrs must not replace the actual image URLs');
          assert.ok(!article.html.includes('data-attrs='), 'page metadata must be removed from the extracted HTML');

          // Package exactly the extracted URLs; a metadata URL would fail the fixture lookup.
          const images = article.images.map((originalUrl, index) => {
            assert.ok(expectedUrls.includes(originalUrl));
            return { originalUrl, localPath: `fixture-${index}`, mimeType: 'image/png', data: png };
          });
          const built = await buildEpubZip({ ...article, images, clippedAt: 0, bookId: 'clipper-regression' });
          const zip = await JSZip.loadAsync(built.buffer);
          const chapter = await zip.file('OEBPS/chapter.xhtml').async('string');
          const sources = [...chapter.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
          assert.deepEqual(sources, ['images/img-0.png', 'images/img-1.png']);
          for (const source of sources) {
            assert.deepEqual(new Uint8Array(await zip.file(`OEBPS/${source}`).async('uint8array')), png);
          }
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
});
