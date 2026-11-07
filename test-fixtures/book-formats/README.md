# Book format fixtures

`test-mock-filesystem/Formats/` contains the same public-domain book as EPUB, XTC, and XTCH, plus its first bitmap page as standalone XTG and XTH for mock-device and visual tests. Both mock backends serve these real bytes. Tests compare uploads and downloads byte for byte, including after rename and move.

## Source and redistribution

The unmodified EPUB was downloaded on October 7, 2026 from [Project Gutenberg ebook 4](https://www.gutenberg.org/ebooks/4), *Lincoln's Gettysburg Address* by Abraham Lincoln. Project Gutenberg identifies this edition as public domain in the USA. The source download is [EPUB3](https://www.gutenberg.org/ebooks/4.epub3.images). The XTC and XTCH files are conversions of that EPUB, including its Project Gutenberg notices and license pages. No commercial book downloads are included.

The XTC and XTCH files contain 53 bitmap pages at 480 × 800 pixels, using 1-bit and 2-bit pages respectively. Their page tables and page headers are checked against the [firmware format definitions](https://github.com/crosspoint-reader/crosspoint-reader/blob/8959836e462d4deff7fddb92b82a9b10c34ccddf/lib/Xtc/Xtc/XtcTypes.h).

The standalone XTG (48,022 bytes) and XTH (96,022 bytes) fixtures are copied directly from the first page-table entries of the XTC and XTCH containers, including their 22-byte page headers. They are real 1-bit and 2-bit images. The source EPUB and complete converted containers retain the Gutenberg notices. Firmware currently reads these page formats inside containers; standalone uploads store the bytes without adding reader support.

## Regeneration

Conversion uses [bigbag/epub-to-xtc-converter](https://github.com/bigbag/epub-to-xtc-converter) at commit `a5719c6d4f64c52675b55889b18dae9877a9e9d6`. The converter runs separately from the app and is not vendored. Only its output files are committed.

```sh
git clone https://github.com/bigbag/epub-to-xtc-converter.git /tmp/book-converter
git -C /tmp/book-converter checkout a5719c6d4f64c52675b55889b18dae9877a9e9d6
node scripts/generate-book-fixtures.cjs /tmp/book-converter "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
npm run test:books
```

Settings: X4 resolution, Times New Roman at 30 px and weight 400, 16 px margins, 120% line spacing, justified text, hyphenation disabled, dithering enabled at strength 0.7. The font is rendered into bitmap pages; no font file is redistributed. Another font path can be supplied on other systems, which changes the output. The converter also stores the current timestamp, so regeneration need not produce identical hashes.

To re-extract only the standalone images from the committed containers, run `node scripts/generate-book-fixtures.cjs --extract-pages`.

## SHA256 hashes

| File | SHA256 |
| --- | --- |
| Gettysburg-Address.epub | `d86f49bf911337a36b46aa290976f67977b2e9953f4c322c11d1e76c6131c588` |
| Gettysburg-Address.xtc | `cfeab00f479e287c47e83476160328b46237d6d059aeb3e0d8bd3d7fc9aea300` |
| Gettysburg-Address.xtch | `f0f0fa9a05cae7d0a3c26ac761cad6d399c00e4b8ebb89c4897e7792b8f6e96b` |
| Gettysburg-Address.xtg | `73fc1e2629dbb10021319f8a6fee79dac3ca96319b1775289c57cbdabfb2ad27` |
| Gettysburg-Address.xth | `1ecafab54cd2d23b893d26782c267efe53f203d7fe3b80a1fb5487b18956f28f` |
