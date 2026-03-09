#!/usr/bin/env node
/**
 * Generate App Store marketing screenshots.
 *
 * Takes raw app captures from docs/images/appstore/raw/ and composes them
 * inside a phone frame with marketing text, matching the CrossPoint Sync
 * website's visual identity (Playfair Display, Inter, #2f95dc accent).
 *
 * Usage:
 *   npx puppeteer browsers install chrome   # first-time only
 *   node scripts/generate-appstore-screenshots.js
 *
 * Output: docs/images/appstore/01-library.png … 06-connect.png (1284x2778)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'docs/images/appstore/raw');
const OUT_DIR = path.join(ROOT, 'docs/images/appstore');

// App Store 6.7" display (iPhone 12-14 Pro Max): 1284 x 2778 px
const WIDTH = 1284;
const HEIGHT = 2778;

const SCREENSHOTS = [
  {
    id: '01-library',
    headline: 'Your E-Ink Library, Anywhere',
    subtitle: 'Browse and manage books wirelessly',
    raw: '01-library.png',
  },
  {
    id: '02-web-clipper',
    headline: 'Clip Articles from Safari',
    subtitle: 'Save any article as an EPUB',
    raw: '02-web-clipper.png',
  },
  {
    id: '03-file-actions',
    headline: 'Everything at Your Fingertips',
    subtitle: 'Save, move, rename, or delete',
    raw: '03-file-actions.png',
  },
  {
    id: '04-move-sheet',
    headline: 'Organize Your Way',
    subtitle: 'Move books between folders instantly',
    raw: '04-move-sheet.png',
  },
  {
    id: '05-sleep-background',
    headline: 'Personalize Your Sleep Screen',
    subtitle: 'Set a custom background for your e-reader',
    raw: '05-sleep-background.png',
  },
  {
    id: '06-share-sheet',
    headline: 'Upload from Any App',
    subtitle: 'Share EPUBs directly to your e-reader',
    raw: '06-share-sheet.png',
  },
  {
    id: '07-connect',
    headline: 'Connect over WiFi',
    subtitle: 'Auto-discover your device on the network',
    raw: '07-connect.png',
  },
];

function imageToDataURI(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildHTML(screenshot) {
  const rawPath = path.join(RAW_DIR, screenshot.raw);

  if (!fs.existsSync(rawPath)) {
    console.warn(`  ⚠ Raw image not found: ${rawPath}`);
    console.warn(`    Will generate placeholder.`);
  }

  const imgExists = fs.existsSync(rawPath);
  const imgSrc = imgExists ? imageToDataURI(rawPath) : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: hidden;
      background: #faf8f5;
      background-image: radial-gradient(ellipse 80% 50% at 50% 40%, #eef6fd 0%, transparent 70%);
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .text-area {
      padding-top: 200px;
      text-align: center;
      flex-shrink: 0;
    }

    .headline {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 72px;
      color: #2d2d2d;
      line-height: 1.15;
      max-width: 1100px;
      margin: 0 auto;
      letter-spacing: -0.5px;
    }

    .subtitle {
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 400;
      font-size: 36px;
      color: #6b7280;
      margin-top: 24px;
      line-height: 1.4;
    }

    .phone-frame {
      margin-top: 80px;
      width: 1200px;
      flex-shrink: 0;
      position: relative;
      /* Phone bleeds off the bottom edge for a more dramatic look */
      border-radius: 40px 40px 0 0;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.10), 0 2px 12px rgba(0, 0, 0, 0.06);
    }

    .phone-frame img {
      width: 100%;
      height: auto;
      display: block;
      /* position: relative keeps the parent tall so the debug bar
         at the bottom bleeds past the canvas edge and gets clipped. */
      position: relative;
      top: 0;
    }

    .placeholder {
      width: 100%;
      height: 2600px;
      background: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', sans-serif;
      font-size: 32px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="text-area">
    <h1 class="headline">${screenshot.headline}</h1>
    <p class="subtitle">${screenshot.subtitle}</p>
  </div>
  <div class="phone-frame">
    ${imgExists
      ? `<img src="${imgSrc}" alt="${screenshot.headline}">`
      : `<div class="placeholder">Screenshot: ${screenshot.raw}</div>`
    }
  </div>
</body>
</html>`;
}

async function main() {
  // Ensure output dirs exist
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log('Launching browser…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const screenshot of SCREENSHOTS) {
    console.log(`Rendering ${screenshot.id}…`);

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

    const html = buildHTML(screenshot);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Allow fonts to load
    await page.evaluate(() => document.fonts.ready);

    const outPath = path.join(OUT_DIR, `${screenshot.id}.png`);
    await page.screenshot({
      path: outPath,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      type: 'png',
    });

    await page.close();
    console.log(`  ✓ ${outPath}`);
  }

  await browser.close();
  console.log('\nDone! Generated screenshots in docs/images/appstore/');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
