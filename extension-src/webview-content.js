// WebView extraction script for Android
// Bundled with Defuddle + DOMPurify via esbuild into a single IIFE
// injected into a hidden WebView by HiddenWebViewExtractor.tsx
//
// This mirrors the Safari extension's content.js extraction pipeline
// so both platforms produce identical output quality.
import Defuddle from 'defuddle';
import DOMPurify from 'dompurify';

(function () {
  try {
    // Use Defuddle to extract clean article content from the rendered DOM.
    // Defuddle 0.7.0+ includes site-specific extractors (TwitterExtractor,
    // XArticleExtractor, etc.) that automatically activate based on the URL.
    const defuddled = new Defuddle(document, {
      url: window.location.href,
    }).parse();

    // Sanitize the extracted HTML with DOMPurify
    // (same allowlists as the iOS Safari extension content.js)
    const cleanHtml = DOMPurify.sanitize(defuddled.content, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'a', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
        'img', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'div', 'span', 'section', 'article',
        'sub', 'sup', 'mark', 'small',
        'dl', 'dt', 'dd',
        'details', 'summary',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'srcset', 'alt', 'title', 'class',
        'width', 'height', 'colspan', 'rowspan',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // Parse sanitized HTML, resolve all image URLs to absolute, and re-serialize.
    // This ensures the HTML string and the collected image URLs match exactly,
    // so epub-generator's find-and-replace can rewrite them to local paths.
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');
    const images = [];
    doc.querySelectorAll('img[src]').forEach((img) => {
      let src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      // Protocol-relative
      if (src.startsWith('//')) src = 'https:' + src;
      // Resolve relative to absolute
      if (!src.startsWith('http://') && !src.startsWith('https://')) {
        try { src = new URL(src, window.location.href).href; } catch { return; }
      }
      // Write absolute URL back so serialized HTML matches
      img.setAttribute('src', src);
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        img.removeAttribute('srcset');
      }
      if (images.length < 20) images.push(src);
    });

    // Re-serialize HTML with absolute URLs
    const resolvedHtml = doc.body.innerHTML;

    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: true,
      title: defuddled.title || document.title || 'Untitled',
      author: defuddled.author || defuddled.site || '',
      sourceUrl: window.location.href,
      html: resolvedHtml,
      images: images,
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: false,
      error: e.message || String(e),
    }));
  }
})();
