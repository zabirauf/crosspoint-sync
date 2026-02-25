---
id: BUG-007
type: bug
title: Upload queue delete/retry buttons unresponsive on Android — list bounces instead
status: open
priority: high
source: reddit-beta
reporter: tegenligger
date_reported: 2025-06-25
date_closed:
labels: [android, upload-queue]
blocked_by: ""
related: []
reddit_thread: "/r/xteinkereader/comments/1rdnv31/crosspoint_sync_now_on_android_join_the_beta/"
---

## Description

On Android, the delete and retry buttons on upload queue job cards do not perform their expected actions. Instead, tapping them causes the list to visually bounce up and down without actually deleting or retrying the upload.

This may be a touch target / gesture conflict issue where the swipeable row or scroll view is intercepting the tap.

## Steps to Reproduce

1. Upload one or more files (or have a failed upload in the queue)
2. Open the upload queue sheet on the Sync tab
3. Tap the delete or retry button on a job card

**Expected:** The job is deleted or retried.
**Actual:** The list moves/bounces up and down; the button action does not fire.

## Source

Reddit beta feedback from u/tegenligger:
> "The interface is giving me options to delete or retry, but these buttons do not work. If I click the list moves up and down, but does not seem to do what the button says."
