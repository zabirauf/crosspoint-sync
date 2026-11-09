// End-to-end resize checks against a web export of the actual app.
// Start `npm run mock-device` and serve the export before running this script.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const base = process.env.RESPONSIVE_APP_URL || 'http://127.0.0.1:8097';
const output = process.env.RESPONSIVE_OUTPUT || path.join('test-screenshots', 'responsive', new Date().toISOString().replace(/[:.]/g, '-'));
const selector = (id) => `[data-testid="${id}"]`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    // Browser CORS is not part of the native reader protocol. Forward requests
    // to the real local mock, adding only the browser-required CORS headers.
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      if (!/^http:\/\/(localhost|127\.0\.0\.1):8082\//.test(request.url())) return request.continue();
      try {
        const response = await fetch(request.url(), { method: request.method(), body: request.postData() });
        let body = Buffer.from(await response.arrayBuffer());
        // Extra UI fixtures let us test scroll continuity beyond one viewport.
        if (new URL(request.url()).pathname === '/api/files' && new URL(request.url()).searchParams.get('path') === '/Formats') {
          const files = JSON.parse(body.toString());
          files.push(...Array.from({ length: 30 }, (_, index) => ({ name: `Resize-check-${String(index + 1).padStart(2, '0')}.epub`, size: 256, isDirectory: false })));
          body = Buffer.from(JSON.stringify(files));
        }
        await request.respond({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
      } catch { await request.abort(); }
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('crosspointsync-device', JSON.stringify({ state: { lastDeviceIp: 'localhost:8082' }, version: 0 }));
      localStorage.setItem('crosspointsync-uploads', JSON.stringify({ state: { jobs: [{ id: 'resize-attention', fileName: 'An upload waiting for attention.epub', fileUri: '', fileSize: 256, destinationPath: '/', status: 'failed', progress: 0, bytesTransferred: 0, createdAt: 1, error: 'Ready to retry' }] }, version: 0 }));
    });
    async function size(width, height) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.waitForFunction((w) => window.innerWidth === w, {}, width);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    async function live(id) {
      await page.waitForFunction((s) => [...document.querySelectorAll(s)].some((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0), {}, selector(id));
      for (const el of await page.$$(selector(id))) if (await el.evaluate(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) && await el.isIntersectingViewport()) return el;
      throw new Error(`No visible element: ${id}`);
    }
    async function visible(id) { await live(id); }
    async function click(id) { await (await live(id)).click(); }
    async function typeDraft(text) {
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="PromptDialog.Input"]')].some(el => el === document.activeElement && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })));
      const input = await live('PromptDialog.Input');
      await input.focus();
      await input.evaluate((el) => el.select());
      await input.type(text);
      assert.equal(await input.evaluate(el => el.value), text);
    }
    async function capture(name) { await page.screenshot({ path: path.join(output, `${name}.png`) }); }
    await size(466, 678);
    await page.goto(base, { waitUntil: 'networkidle0' });
    await visible('Library.FileRow.Formats');
    await capture('duo-outer-library');
    // The native Reader page and legacy sheet share this form. Exercise the
    // sheet's disconnect/reconnect and auto-dismiss behavior after extraction.
    await click('Library.ConnectionPill');
    await visible('Connection.Content');
    await click('Connection.DisconnectButton');
    await visible('Connection.AddressInput');
    await visible('Connection.ConnectButton');
    await capture('phone-connection-form');
    await click('Connection.ConnectButton');
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="Connection.Sheet"]')].some(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })));
    await visible('Library.FileRow.Formats');
    await click('Library.FileRow.Formats');
    await visible('Library.FileRow.Gettysburg-Address.epub');
    await page.evaluate((s) => { window.__resizeList = document.querySelector(s); }, selector('Library.FileList'));
    for (const [width, height, name] of [[890, 626, 'duo-inner-library'], [1194, 834, 'tablet-library'], [375, 834, 'tablet-split-library'], [466, 678, 'duo-outer-return']]) {
      await size(width, height);
      await visible('Library.FileRow.Gettysburg-Address.epub');
      assert.equal(await page.evaluate((s) => window.__resizeList === document.querySelector(s), selector('Library.FileList')), true, 'file list remounted during resizing');
      await capture(name);
    }
    await page.$eval(selector('Library.FileList'), el => { el.scrollTop = 500; });
    await page.waitForFunction((s) => document.querySelector(s).scrollTop === 500, {}, selector('Library.FileList'));
    for (const [width, height] of [[890, 626], [1194, 834], [375, 834], [466, 678]]) {
      await size(width, height);
      assert.equal(await page.$eval(selector('Library.FileList'), el => el.scrollTop), 500, 'scroll position changed after resizing');
    }
    await page.$eval(selector('Library.FileList'), el => { el.scrollTop = 0; });
    await click('Library.FileRow.Gettysburg-Address.epub.More');
    await visible('FileActions.Sheet');
    await size(890, 626);
    const sheet = await page.$eval(selector('FileActions.Sheet'), (el) => ({ width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right }));
    assert.ok(sheet.width <= 560 && sheet.right <= 890);
    await capture('duo-inner-file-actions');
    await click('FileActions.Rename');
    await visible('PromptDialog.Input');
    await typeDraft('Draft retained through folding.epub');
    await page.evaluate((s) => { window.__resizeInput = document.querySelector(s); }, selector('PromptDialog.Input'));
    for (const [width, height] of [[466, 678], [1194, 834], [890, 626]]) {
      await size(width, height);
      assert.equal(await page.$eval(selector('PromptDialog.Input'), (el) => el.value), 'Draft retained through folding.epub');
      assert.equal(await page.evaluate((s) => window.__resizeInput === document.querySelector(s), selector('PromptDialog.Input')), true, 'input remounted');
    }
    await capture('duo-inner-rename-draft');
    await click('PromptDialog.CancelButton');
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="PromptDialog.Content"]')].some(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })));
    await click('TabBar.Settings');
    await visible('Settings.UploadPath');
    await capture('duo-inner-settings');
    await size(1194, 834);
    await capture('tablet-settings');
    await click('Settings.UploadPath');
    await visible('PromptDialog.Input');
    await typeDraft('/Books/Long folder names stay readable across every display');
    await size(375, 834);
    await click('PromptDialog.SubmitButton');
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="PromptDialog.Content"]')].some(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })));
    await page.waitForFunction(() => document.querySelector('[data-testid="Settings.UploadPath"]').textContent.includes('/Books/Long folder names stay readable across every display'));
    await capture('tablet-split-settings');
    await size(678, 466);
    await capture('phone-short-settings');
    await size(466, 678);
    await click('TabBar.Library');
    await click('Library.FAB');
    const chooser = page.waitForFileChooser();
    await click('FAB.SleepBackground');
    await (await chooser).accept([path.resolve('assets/images/icon.png')]);
    await visible('SleepPreview.CropFrame');
    for (const [width, height, name] of [[466, 678, 'duo-outer-crop'], [890, 626, 'duo-inner-crop'], [1194, 834, 'tablet-crop'], [700, 320, 'phone-short-crop']]) {
      await size(width, height);
      const frame = await page.$eval(selector('SleepPreview.CropFrame'), el => { const r=el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; });
      assert.ok(Math.abs(frame.width / frame.height - 0.6) < 0.001);
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= width && frame.y + frame.height <= height);
      await capture(name);
    }
    await click('SleepPreview.Cancel');
    await size(700, 320);
    await click('Library.FAB');
    const menu = await page.$eval(selector('FAB.Menu'), el => { const r=el.getBoundingClientRect(); return { top:r.top,bottom:r.bottom }; });
    assert.ok(menu.top >= 0 && menu.bottom <= 320);
    await capture('phone-short-add-menu');
    assert.deepEqual(errors, [], 'runtime errors');
    console.log(`Responsive checks passed. Screenshots: ${path.resolve(output)}`);
    console.log(await page.evaluate(() => ({ theme: document.documentElement.className, prefersDark: matchMedia('(prefers-color-scheme: dark)').matches })));
  } catch (error) {
    for (const page of await browser.pages()) {
      await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      console.log(await page.evaluate(() => [...document.querySelectorAll('input')].map(el => ({ value:el.value, rect:JSON.stringify(el.getBoundingClientRect()), display:getComputedStyle(el).display }))).catch(() => []));
    }
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
