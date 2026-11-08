require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const JSZip = require('jszip');
const { SaxesParser } = require('saxes');
const { buildEpubZip, fixupXhtml } = require('../services/epub-generator.ts');
const { prepareEpubImages, MAX_EPUB_IMAGE_BYTES } = require('../services/epub-images.ts');
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const image = (originalUrl, mimeType = 'image/png') => ({
  originalUrl,
  localPath: 'input',
  mimeType,
  data: png,
});
function parseXml(xml) {
  let text = '';
  const p = new SaxesParser({ xmlns: true });
  p.on('text', (part) => {
    text += part;
  });
  p.write(xml).close();
  return text;
}
const options = {
  title: 'Title & "quotes"',
  author: 'Author <name>',
  sourceUrl: 'https://example.test/?x=1&y=2',
  clippedAt: 0,
  bookId: 'id" & <value>',
  html: '',
  images: [],
};

test('HTML entities, malformed tags, empty attributes and XML control characters serialize safely', async () => {
  const html =
    '<p title="A&nbsp;B &quot;C&quot;">München&nbsp;&copy; 😀\u0001<br/><b>bold</p><p>next & broken &unknown;</p><custom:tag bad:attr="x">text</custom:tag><script>evil()</script>';
  const fixed = fixupXhtml(html);
  const text = parseXml('<root>' + fixed + '</root>');
  assert.match(text, /München\u00a0© 😀/u);
  assert.match(text, /next & broken &unknown;/);
  assert.ok(!fixed.includes('&nbsp;'));
  assert.ok(!fixed.includes('evil()'));
  assert.ok(!fixed.includes('//>'));
  const result = await buildEpubZip({ ...options, html });
  const zip = await JSZip.loadAsync(result.buffer);
  for (const [name, file] of Object.entries(zip.files)) {
    if (/\.(?:xhtml|opf|ncx|xml)$/.test(name)) parseXml(await file.async('string'));
  }
});

test('only downloaded reader-compatible images are embedded; links and text are not URL-rewritten', async () => {
  const url = 'https://example.test/picture?a=1&b=2';
  const result = await buildEpubZip({
    ...options,
    html: `<p>${url}</p><a href="${url.replaceAll('&', '&amp;')}">link</a><img src='${url.replaceAll('&', '&amp;')}' alt="A&nbsp;B"><img src="${url.replaceAll('&', '&amp;')}"><img src="missing.webp" alt="Missing image"><img src="avif" alt="AVIF image">`,
    images: [image(url), image('unused'), image('avif', 'image/avif')],
  });
  assert.equal(result.imageEntries.length, 1);
  assert.match(result.rewrittenHtml, /href="https:/);
  assert.match(result.rewrittenHtml, /Missing image/);
  assert.match(result.rewrittenHtml, /AVIF image/);
  assert.ok(!result.rewrittenHtml.includes('src="missing'));
  assert.equal((result.rewrittenHtml.match(/src="images\/img-0.png"/g) || []).length, 2);
  parseXml('<root>' + result.rewrittenHtml + '</root>');
});

test('image preparation is sequential, deduplicates inputs, and drops oversized or undecodable images', async () => {
  let active = 0,
    maxActive = 0;
  const seen = [];
  const inputs = [
    image('one', 'image/webp'),
    image('one', 'image/webp'),
    image('bad', 'image/avif'),
    { ...image('large'), data: new Uint8Array(MAX_EPUB_IMAGE_BYTES + 1) },
    image('two', 'image/jpeg'),
  ];
  const result = await prepareEpubImages(inputs, async (input) => {
    active++;
    maxActive = Math.max(maxActive, active);
    seen.push(input.originalUrl);
    try {
      await Promise.resolve();
      if (input.originalUrl === 'bad') throw Error('unsupported decoder');
      return { mimeType: 'image/png', data: png };
    } finally {
      active--;
    }
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(seen, ['one', 'bad', 'two']);
  assert.deepEqual(
    result.map((x) => x.originalUrl),
    ['one', 'two'],
  );
  assert.ok(result.every((x) => x.mimeType === 'image/png'));
  const invalid = await prepareEpubImages([image('unconverted')], async () => ({
    mimeType: 'image/webp',
    data: png,
  }));
  assert.equal(invalid.length, 0);
});

function nativeConverter({ decodeFails = false, encodeFails = false } = {}) {
  const files = new Map();
  const calls = [];
  class Directory {
    constructor(base, name) {
      this.uri = base + '/' + name;
    }
    create(options) {
      calls.push({ mkdir: options });
    }
  }
  class File {
    constructor(base, name) {
      this.uri = name ? (base.uri || base) + '/' + name : base;
    }
    write(data) {
      files.set(this.uri, data);
    }
    get exists() {
      return files.has(this.uri);
    }
    async bytes() {
      return files.get(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  const source = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../services/epub-image-converter.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports,
    Date,
    Math,
    Promise,
    require: (id) => {
      if (id === 'react-native')
        return {
          Image: {
            getSize: async (uri) => {
              assert.ok(files.has(uri));
              if (decodeFails) throw Error('decode failed');
              return { width: 4000, height: 2000 };
            },
          },
        };
      if (id === 'expo-file-system') return { File, Directory, Paths: { cache: 'file:///cache' } };
      if (id === 'expo-image-manipulator')
        return {
          SaveFormat: { PNG: 'png' },
          manipulateAsync: async (uri, actions, options) => {
            calls.push({ actions, options });
            if (encodeFails) throw Error('encode failed');
            const output = uri + '.png';
            files.set(output, png);
            return { uri: output };
          },
        };
      if (id === './epub-images') return { MAX_EPUB_IMAGE_DIMENSION: 1200 };
      throw Error('Unexpected dependency ' + id);
    },
  });
  return { convert: module.exports.convertEpubImage, calls, files };
}

test('native conversion keeps aspect ratio, outputs PNG and removes temporary files', async () => {
  const app = nativeConverter();
  const result = await app.convert(image('source', 'image/webp'));
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual(result.data, png);
  const call = app.calls.find((x) => x.actions);
  assert.equal(call.options.format, 'png');
  assert.equal(call.actions[0].resize.width, 1200);
  assert.equal(call.actions[0].resize.height, 600);
  assert.equal(app.files.size, 0);
});

test('native decode and encode failures clean their input files', async () => {
  for (const failure of [{ decodeFails: true }, { encodeFails: true }]) {
    const app = nativeConverter(failure);
    await assert.rejects(app.convert(image('source', 'image/avif')));
    assert.equal(app.files.size, 0);
  }
});
