---
id: FEAT-009
type: feature
title: Prompt user for App Store review after successful interaction
status: open
priority: medium
source: internal
reporter: ""
date_reported: 2026-02-18
date_closed:
labels: [app-store, review, engagement]
blocked_by: ""
related: []
reddit_thread: ""
---

# FEAT-009: Prompt user for App Store review after successful interaction

## Description

Use Apple's `SKStoreReviewController` (via `expo-store-review`) to prompt users for an App Store review after a successful interaction — such as completing a file upload, clipping an article, or connecting to a device for the first time.

## Requirements

- Trigger the review prompt at a natural success moment (e.g., after first successful upload, after N successful uploads)
- Use Apple's native review API which handles rate-limiting and display logic automatically
- Do not spam — Apple's API already limits how often the prompt appears, but the app should also gate on meaningful milestones
- No custom review dialogs — use the system-provided prompt only

## Suggested Trigger Points

- After the first successful file upload completes
- After a milestone number of uploads (e.g., 5th, 10th)
- After first successful web clip → EPUB conversion and upload

## Implementation Notes

- Use `expo-store-review` or `react-native-store-review` to call `SKStoreReviewController.requestReview()`
- Track interaction counts in the settings store (persisted via AsyncStorage)
- Apple limits the prompt to ~3 times per 365-day period per device — the API is a no-op beyond that
