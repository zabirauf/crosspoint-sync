/** Resolve only explicit image sources, never unrelated page metadata. */
function imageUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let source = value.trim();
  if (source.startsWith('{') || source.startsWith('[')) {
    try {
      source = JSON.parse(source).src;
      if (typeof source !== 'string') return null;
    } catch {
      return null;
    }
  }
  if (!source.trim()) return null;
  try {
    const url = new URL(source, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function srcsetUrl(value, baseUrl) {
  if (!value) return null;
  // Split on descriptors, not commas: image CDN URLs can themselves contain commas.
  const candidates = [...value.matchAll(/(\S+)\s+(\d+(?:\.\d+)?)(?:w|x)(?=\s*,|\s*$)/g)]
    .sort((a, b) => Number(b[2]) - Number(a[2]));
  for (const candidate of candidates) {
    const url = imageUrl(candidate[1], baseUrl);
    if (url) return url;
  }
  return candidates.length === 0 ? imageUrl(value, baseUrl) : null;
}

/** Keep the serialized HTML and the unique download URLs in agreement. */
export function normalizeImageSources(html, baseUrl, limit = 20) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = new Set();
  for (const img of doc.querySelectorAll('img')) {
    const metadata = img.getAttribute('data-attrs')?.trim();
    const source = ['src', 'data-src', 'data-original', 'data-lazy-src']
      .map((name) => imageUrl(img.getAttribute(name), baseUrl))
      .find(Boolean)
      || (metadata?.startsWith('{') && imageUrl(metadata, baseUrl))
      || srcsetUrl(img.getAttribute('srcset') || img.getAttribute('data-srcset'), baseUrl);
    if (!source || (!images.has(source) && images.size >= limit)) {
      img.remove();
      continue;
    }
    images.add(source);
    img.setAttribute('src', source);
    for (const name of ['srcset', 'data-src', 'data-original', 'data-lazy-src', 'data-srcset', 'data-attrs']) {
      img.removeAttribute(name);
    }
  }
  return { html: doc.body.innerHTML, images: [...images] };
}
