---
id: FEAT-006
type: feature
title: RSS feed support with selective sync
status: open
priority: high
source: reddit-beta
reporter: u/OneHappyPenguin
date_reported: 2026-01-15
date_closed:
labels: [rss, feeds, content-sync, roadmap]
blocked_by: ""
related: [FEAT-004]
reddit_thread: ""
---

# FEAT-006: RSS feed support with selective sync

## Description

RSS/Atom feed subscriptions where users can browse feed items and selectively sync articles to their X4 as EPUBs. The approach should be curated (user selects which articles to send) rather than auto-syncing everything.

### User Requests

- **u/OneHappyPenguin** (Beta post): Requested RSS support
- **u/cyberspaceChimp** (Beta post): Similar request for article syncing
- **Maintainer (zabirauf)**: Confirmed this is on the roadmap and agreed the selective/curated approach is correct

## Priority Rationale

**High** — On the official roadmap, requested by multiple users, and aligns with the app's content-syncing mission. The selective approach (vs auto-sync) was confirmed by the maintainer.

## Requirements

- Add RSS/Atom feed URLs
- Browse feed items with title, date, and preview
- Select individual articles to convert and upload
- Convert selected articles to EPUB (reuse existing `epub-generator.ts`)
- Queue converted EPUBs for upload via existing upload system

## Implementation Notes

- Feed parsing: Use a lightweight RSS/Atom parser (e.g., `rss-parser` or custom XML parsing)
- Article fetching: Fetch full article HTML from the link URL
- Content extraction: Reuse the Defuddle + DOMPurify pipeline from the web clipper
- EPUB generation: Reuse `services/epub-generator.ts`
- Upload: Reuse existing upload queue (`stores/upload-store.ts`)
- Storage: New Zustand store for feed subscriptions + last-fetched state
- UI: New tab or section within existing tabs for feed management
