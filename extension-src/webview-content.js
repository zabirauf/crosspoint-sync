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
        'href', 'src', 'alt', 'title', 'class',
        'width', 'height', 'colspan', 'rowspan',
      ],
      ALLOW_DATA_ATTR: false,
    });

    // Collect all image URLs from the sanitized content
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleanHtml, 'text/html');
    const images = [];
    doc.querySelectorAll('img[src]').forEach((img) => {
      if (images.length >= 20) return;
      const src = img.getAttribute('src');
      if (src && src.startsWith('http')) {
        images.push(src);
      }
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: true,
      title: defuddled.title || document.title || 'Untitled',
      author: defuddled.author || defuddled.site || '',
      sourceUrl: window.location.href,
      html: cleanHtml,
      images: images,
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: false,
      error: e.message || String(e),
    }));
  }
})();
