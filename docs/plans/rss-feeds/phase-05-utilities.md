# Phase 5: HTML Sanitizer & Time-Ago Utilities

**Goal**: Sanitize feed HTML for the in-app reader view and provide relative time formatting.

**Prerequisites**: None — pure utility functions.

---

## New file: `utils/sanitize-html.ts`

### Function signature

```typescript
/**
 * Strip all HTML except allowed content tags:
 * p, h1-h6, blockquote, ul, ol, li, em, strong, a (href only), br, img (src only)
 *
 * Also strips all attributes except href on <a> and src on <img>.
 * This is for display in the in-app WebView reader, not for EPUB generation
 * (EPUB uses the full extracted content from url-article-extractor).
 */
export function sanitizeArticleHtml(html: string): string
```

### Implementation

Regex-based whitelist approach:
1. Define allowed tags: `p`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `blockquote`, `ul`, `ol`, `li`, `em`, `strong`, `a`, `br`, `img`
2. For `<a>` tags: preserve only `href` attribute
3. For `<img>` tags: preserve only `src` attribute
4. Strip all other tags entirely (keep inner text content)
5. Strip all attributes on other allowed tags
6. Remove empty tags that result from stripping

---

## New file: `utils/time-ago.ts`

### Function signature

```typescript
/**
 * Convert an epoch millisecond timestamp to a human-readable relative time string.
 *
 * Examples: "2m ago", "3h ago", "1d ago", "5d ago"
 * For items older than 7 days: "Mar 21"
 */
export function timeAgo(epochMs: number): string
```

### Implementation

Simple threshold-based formatting:
- < 60 seconds: "just now"
- < 60 minutes: "{n}m ago"
- < 24 hours: "{n}h ago"
- < 7 days: "{n}d ago"
- >= 7 days: short date format ("Mar 21")

---

## Verification

Test `sanitizeArticleHtml` with HTML containing:
- `<script>` tags → stripped
- `<iframe>` tags → stripped
- `<style>` tags → stripped
- `<div>` wrappers → stripped (inner content kept)
- `<a href="..." class="..." onclick="...">` → only `href` preserved
- `<p>`, `<h1>`, `<blockquote>`, `<strong>` → preserved

Test `timeAgo` with various timestamps to verify all thresholds.
