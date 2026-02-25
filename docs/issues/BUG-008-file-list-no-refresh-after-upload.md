---
id: BUG-008
type: bug
title: File list doesn't auto-refresh after successful upload
status: open
priority: medium
source: reddit-beta
reporter: agljmpse
date_reported: 2025-06-25
date_closed:
labels: [file-browser, upload]
blocked_by: ""
related: []
reddit_thread: "/r/xteinkereader/comments/1rdnv31/crosspoint_sync_now_on_android_join_the_beta/"
---

## Description

After a file upload completes successfully, the newly uploaded file does not appear in the file browser. The user must navigate to a different folder and back to see the file. The file list should automatically refresh (or append the new file) after a successful upload to the currently viewed directory.

## Steps to Reproduce

1. Connect to the device
2. Navigate to the target upload folder in the Library tab
3. Upload a file to that folder
4. Observe the file list after the upload shows "Done"

**Expected:** The newly uploaded file appears in the list immediately.
**Actual:** File list is stale. User must navigate away and back to see the file.

## Source

Reddit beta feedback from u/agljmpse:
> "although it shows the upload was successful, the file does not appear right away. I had to switch between folders and go back to see them"
