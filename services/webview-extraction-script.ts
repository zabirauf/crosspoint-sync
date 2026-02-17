/**
 * JavaScript injected into a hidden WebView to extract article content from the rendered DOM.
 * Mirrors the iOS Safari extension's DOMPurify allowlists for consistent output.
 */

export const EXTRACTION_SCRIPT = `
(function() {
  try {
    // --- Metadata extraction ---
    function getMeta(name) {
      var el = document.querySelector('meta[property="' + name + '"]')
        || document.querySelector('meta[name="' + name + '"]');
      return el ? (el.getAttribute('content') || '').trim() : '';
    }

    var title = getMeta('og:title')
      || (document.querySelector('title') ? document.title : '')
      || 'Untitled';

    var author = getMeta('author') || '';
    if (!author) {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var ld = JSON.parse(scripts[i].textContent);
          var a = ld.author;
          if (a) {
            author = (Array.isArray(a) ? a[0].name : a.name) || '';
            if (author) break;
          }
        } catch(e) {}
      }
    }

    // --- Find content node ---
    var contentNode = document.querySelector('article')
      || document.querySelector('main')
      || document.querySelector('[role="main"]');

    if (!contentNode) {
      contentNode = document.body;
    }

    // Clone so we don't mutate the live DOM
    var clone = contentNode.cloneNode(true);

    // --- Remove unwanted elements ---
    var removeSelectors = [
      'script', 'style', 'noscript', 'iframe', 'object', 'embed',
      'nav', 'footer', 'header', 'aside',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '[role="complementary"]', '[role="search"]',
      '[class*="cookie"]', '[class*="Cookie"]',
      '[class*="consent"]', '[class*="Consent"]',
      '[class*="popup"]', '[class*="Popup"]',
      '[class*="modal"]', '[class*="Modal"]',
      '[class*="banner"]', '[class*="Banner"]',
      '[class*="newsletter"]', '[class*="Newsletter"]',
      '[class*="signup"]', '[class*="SignUp"]',
      '[class*="sidebar"]', '[class*="Sidebar"]',
      '[class*="social"]', '[class*="Social"]',
      '[class*="share"]', '[class*="Share"]',
      '[class*="comment"]', '[class*="Comment"]',
      '[class*="related"]', '[class*="Related"]',
      '[class*="recommend"]', '[class*="Recommend"]',
      '[class*="ad-"]', '[class*="ad_"]', '[class*="ads-"]', '[class*="ads_"]',
      '[class*="advertisement"]',
      '[id*="cookie"]', '[id*="consent"]',
      '[id*="popup"]', '[id*="modal"]',
      '[id*="sidebar"]', '[id*="ad-"]', '[id*="ad_"]',
    ];

    removeSelectors.forEach(function(sel) {
      try {
        clone.querySelectorAll(sel).forEach(function(el) { el.remove(); });
      } catch(e) {}
    });

    // --- Sanitize: keep only allowed tags and attributes ---
    var ALLOWED_TAGS = {
      'H1':1,'H2':1,'H3':1,'H4':1,'H5':1,'H6':1,
      'P':1,'BR':1,'HR':1,
      'UL':1,'OL':1,'LI':1,
      'BLOCKQUOTE':1,'PRE':1,'CODE':1,
      'A':1,'STRONG':1,'EM':1,'B':1,'I':1,'U':1,'S':1,'DEL':1,'INS':1,
      'IMG':1,'FIGURE':1,'FIGCAPTION':1,
      'TABLE':1,'THEAD':1,'TBODY':1,'TFOOT':1,'TR':1,'TH':1,'TD':1,
      'DIV':1,'SPAN':1,'SECTION':1,'ARTICLE':1,
      'SUB':1,'SUP':1,'MARK':1,'SMALL':1,
      'DL':1,'DT':1,'DD':1,
      'DETAILS':1,'SUMMARY':1,
    };
    var ALLOWED_ATTRS = {
      'href':1,'src':1,'alt':1,'title':1,'class':1,
      'width':1,'height':1,'colspan':1,'rowspan':1,
    };

    function sanitizeNode(node) {
      if (node.nodeType === 3) return; // text node, keep
      if (node.nodeType !== 1) { node.remove(); return; }

      if (!ALLOWED_TAGS[node.tagName]) {
        // Replace disallowed tag with its children
        var parent = node.parentNode;
        while (node.firstChild) {
          parent.insertBefore(node.firstChild, node);
        }
        parent.removeChild(node);
        return;
      }

      // Remove disallowed attributes
      var attrs = Array.from(node.attributes);
      for (var i = 0; i < attrs.length; i++) {
        if (!ALLOWED_ATTRS[attrs[i].name]) {
          node.removeAttribute(attrs[i].name);
        }
      }

      // Remove data: attributes are already blocked by not being in ALLOWED_ATTRS

      // Recurse children (iterate backwards since we may modify the list)
      var children = Array.from(node.childNodes);
      for (var j = 0; j < children.length; j++) {
        sanitizeNode(children[j]);
      }
    }

    // Sanitize all children of clone
    var topChildren = Array.from(clone.childNodes);
    for (var k = 0; k < topChildren.length; k++) {
      sanitizeNode(topChildren[k]);
    }

    var html = clone.innerHTML;

    // --- Collect image URLs ---
    var images = [];
    var seen = {};
    clone.querySelectorAll('img[src]').forEach(function(img) {
      if (images.length >= 20) return;
      var src = img.getAttribute('src');
      if (src && !src.startsWith('data:') && !seen[src]) {
        try {
          var abs = new URL(src, document.location.href).href;
          if (abs.startsWith('http://') || abs.startsWith('https://')) {
            images.push(abs);
            seen[abs] = true;
          }
        } catch(e) {}
      }
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: true,
      title: title,
      author: author,
      sourceUrl: document.location.href,
      html: html,
      images: images,
    }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      success: false,
      error: e.message || String(e),
    }));
  }
})();
`;
