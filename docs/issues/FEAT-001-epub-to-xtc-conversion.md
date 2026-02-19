---
id: FEAT-001
type: feature
title: EPUB to XTC/XTCH conversion
status: open
priority: high
source: reddit-appstore
reporter: u/anuraagdjain
date_reported: 2026-02-01
date_closed:
labels: [conversion, epub, xtc, fonts]
blocked_by: ""
related: []
reddit_thread: ""
---

# FEAT-001: EPUB to XTC/XTCH conversion

## Description

Users want Calibre-like EPUB to XTC/XTCH conversion directly in the app, with font controls (family, size, stroke weight). This is the most requested feature — multiple users brought it up independently.

### User Requests

- **u/anuraagdjain**: Wants EPUB → XTC conversion with font control
- **u/Spiritual_Flan1190**: Same request, wants to avoid using Calibre
- **u/NerdyBrando**: Stays on stock firmware specifically because stock supports XTC — would switch to CrossPoint if the app could convert

## Priority Rationale

**High** — Multiple independent requests, and at least one user (NerdyBrando) is staying on stock firmware instead of CrossPoint because of this missing feature. Adding conversion could drive CrossPoint firmware adoption.

## Implementation Notes

- XTC/XTCH is the X4's native format with better rendering than EPUB
- Need to research the XTC format specification
- Font controls: family selection, size adjustment, stroke weight
- Could potentially leverage existing EPUB parsing + re-render to XTC
- May require significant research into the XTC binary format
