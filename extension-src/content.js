// Content script for CrossPoint Safari Web Extension
// This runs in the web page context and extracts article content
import Defuddle from 'defuddle';
import DOMPurify from 'dompurify';
import { normalizeImageSources } from './image-sources';

// Listen for messages from the popup/background
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract') {
    try {
      const result = extractArticle();
      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true; // Keep message channel open for async response
});

function extractArticle() {
  // Use Defuddle to extract clean article content
  const defuddled = new Defuddle(document, {
    url: window.location.href,
  }).parse();

  // Sanitize the extracted HTML with DOMPurify
  const normalized = normalizeImageSources(defuddled.content, window.location.href);
  const cleanHtml = DOMPurify.sanitize(normalized.html, {
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

  return {
    title: defuddled.title || document.title || 'Untitled',
    author: defuddled.author || defuddled.site || '',
    sourceUrl: window.location.href,
    html: cleanHtml,
    images: normalized.images,
  };
}
