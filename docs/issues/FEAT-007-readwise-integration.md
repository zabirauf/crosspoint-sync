---
id: FEAT-007
type: feature
title: Readwise integration
status: open
priority: low
source: reddit-beta
reporter: u/ryanjm_
date_reported: 2026-01-15
date_closed:
labels: [integration, readwise, third-party]
blocked_by: ""
related: [FEAT-006]
reddit_thread: ""
---

# FEAT-007: Readwise integration

## Description

Integration with Readwise (readwise.io) to sync saved articles to the X4. The user said this would get them "80% of what I need."

## Priority Rationale

**Low** — Niche request (single user), depends on a third-party service API, and overlaps with RSS feed support (FEAT-006) which serves a broader audience. Could be revisited after RSS is implemented.

## Implementation Notes

- Readwise has a documented API for fetching saved articles/highlights
- Would need OAuth or API key authentication
- Fetched articles would go through the same EPUB generation + upload pipeline
- Consider as an extension of FEAT-006's architecture (content sources → EPUB → upload)
