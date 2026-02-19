---
id: BUG-004
type: bug
title: Web clipper misses collapsed/lazy-loaded content
status: open
priority: low
source: reddit-beta
reporter: u/OneHappyPenguin
date_reported: 2026-01-15
date_closed:
labels: [web-clipper, safari-extension, defuddle, content-extraction]
blocked_by: ""
related: [FEAT-004]
reddit_thread: ""
---

# BUG-004: Web clipper misses collapsed/lazy-loaded content

## Description

When clipping Wikipedia articles (and likely other pages with collapsed sections), the web clipper only captures the visible/expanded content. Collapsed `<details>` elements, "click to expand" sections, and lazy-loaded content are missed entirely. The user must manually expand all sections in Safari before clipping.

## Steps to Reproduce

1. Open a Wikipedia article with collapsible sections in Safari
2. Activate the CrossPoint Web Clipper extension
3. Clip the article
4. The resulting EPUB only contains the abstract/intro and any already-expanded sections
5. Collapsed subsections are missing

## Expected Behavior

The clipper should capture the full article content, including collapsed sections.

## Root Cause Investigation

The content extraction library (Defuddle) operates on the current DOM state. It doesn't programmatically expand collapsed elements before extraction.

Check:
- `extension-src/content.js` — the content extraction pipeline
- Whether Defuddle has options for expanding collapsed content
- Wikipedia's specific markup for collapsed sections (`<details>`, `mw-collapsible`, etc.)

## Fix Approach

Before running Defuddle extraction in `content.js`:
1. Expand all `<details>` elements by setting their `open` attribute
2. Remove `mw-collapsed` / `collapsible` classes from Wikipedia-specific elements
3. Trigger lazy-load observers if possible (scroll simulation or IntersectionObserver trigger)
4. Consider a short delay after expansion to let any JS-driven content render

Caveat: This is a best-effort fix. Some dynamically loaded content may still be missed if it requires actual user interaction or API calls to load.
