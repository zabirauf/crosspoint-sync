import { parseDocument, DomUtils } from 'htmlparser2';
import render from 'dom-serializer';
import { isTag, type ParentNode } from 'domhandler';

const TAGS = new Set(
  'h1 h2 h3 h4 h5 h6 p br hr ul ol li blockquote pre code a strong em b i u s del ins img figure figcaption table thead tbody tfoot tr th td div span section article sub sup mark small dl dt dd details summary'.split(
    ' ',
  ),
);
const ATTRIBUTES = new Set(
  'id class href src alt title width height colspan rowspan lang'.split(' '),
);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript']);

export function stripInvalidXmlCharacters(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDFFF]/gu, '');
}

/** Parse HTML entities and repair HTML structure before serializing as XML. */
export function parseEpubHtml(html: string) {
  const doc = parseDocument(html, { decodeEntities: true });
  function clean(parent: ParentNode): void {
    for (const node of [...parent.children]) {
      if (isTag(node)) {
        if (DROP_CONTENT.has(node.name)) {
          DomUtils.removeElement(node);
          continue;
        }
        if (!TAGS.has(node.name)) node.name = 'span';
        for (const key of Object.keys(node.attribs)) {
          if (!ATTRIBUTES.has(key)) delete node.attribs[key];
          else node.attribs[key] = stripInvalidXmlCharacters(node.attribs[key]);
        }
        if (node.attribs.href && /^\s*(?:javascript|data|vbscript):/i.test(node.attribs.href)) {
          delete node.attribs.href;
        }
        clean(node);
      } else if (node.type === 'text') {
        node.data = stripInvalidXmlCharacters(node.data);
      } else {
        DomUtils.removeElement(node);
      }
    }
  }
  clean(doc);
  return doc;
}

export function serializeEpubHtml(doc: ParentNode): string {
  return render(doc.children, { xmlMode: true, encodeEntities: 'utf8', emptyAttrs: true });
}
