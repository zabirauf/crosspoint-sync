---
id: BUG-005
type: bug
title: Android back button on connection status sheet navigates folders instead of closing
status: open
priority: medium
source: reddit-beta
reporter: Outrageous_Theme_319
date_reported: 2025-06-25
date_closed:
labels: [android, navigation]
blocked_by: ""
related: []
reddit_thread: "/r/xteinkereader/comments/1rdnv31/crosspoint_sync_now_on_android_join_the_beta/"
---

## Description

On Android, after pressing the "connected" button to show the connection status sheet, using the system navigation back button goes back in the folder browser instead of closing the connection status sheet.

Expected behavior: the back button should dismiss the connection status sheet first.

## Steps to Reproduce

1. Connect to the device
2. Navigate into a subfolder in the Library tab
3. Tap the "Connected" pill/button to open the connection status sheet
4. Press the Android system back button

**Expected:** Connection status sheet closes, user stays in the current folder.
**Actual:** Sheet may remain visible while the folder navigation goes back.

## Source

Reddit beta feedback from u/Outrageous_Theme_319:
> "after pressing the 'connected' button to show connection status using the system navigation back button goes back in the folders and doesn't close the connection status as expected"
