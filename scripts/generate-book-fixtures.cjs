#!/usr/bin/env node
// Regenerate containers from the EPUB, then extract real standalone image pages.
const fs = require('node:fs');
const path = require('node:path');

const [converterDir, fontPath] = process.argv.slice(2);
const fixtures = path.resolve(__dirname, '../test-mock-filesystem/Formats');

function extractPages() {
  for (const [container, image] of [['xtc', 'xtg'], ['xtch', 'xth']]) {
    const data = fs.readFileSync(path.join(fixtures, `Gettysburg-Address.${container}`));
    const table = Number(data.readBigUInt64LE(24));
    const offset = Number(data.readBigUInt64LE(table));
    const size = data.readUInt32LE(table + 8);
    if (offset + size > data.length || data.subarray(offset, offset + 4).toString() !== `${image.toUpperCase()}\0`) {
      throw new Error(`Invalid first page in ${container}`);
    }
    fs.writeFileSync(path.join(fixtures, `Gettysburg-Address.${image}`), data.subarray(offset, offset + size));
  }
}

if (converterDir === '--extract-pages') {
  extractPages();
  process.exit(0);
}
if (!converterDir || !fontPath) {
  console.error('Usage: node scripts/generate-book-fixtures.cjs <converter-checkout> <font.ttf> | --extract-pages');
  process.exit(1);
}
const { convertEpub, cleanup } = require(path.resolve(converterDir, 'cli/converter.js'));
const { resolveSettings } = require(path.resolve(converterDir, 'cli/settings.js'));
const settings = resolveSettings({
  device: 'xteink-x4', width: 480, height: 800,
  font: { path: path.resolve(fontPath), size: 30, weight: 400 },
  margins: { left: 16, top: 16, right: 16, bottom: 16 },
  lineHeight: 120, textAlign: 'justify',
  hyphenation: { enabled: false, language: 'en' },
  output: { format: 'xtc', dithering: true, ditherStrength: 0.7, negative: false },
});

(async () => {
  try {
    for (const format of ['xtc', 'xtch']) {
      settings.output.format = format;
      const output = path.join(fixtures, `Gettysburg-Address.${format}`);
      console.log(await convertEpub(path.join(fixtures, 'Gettysburg-Address.epub'), output, settings));
      if (!fs.statSync(output).size) throw new Error(`Empty fixture: ${output}`);
    }
    extractPages();
  } finally { cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
