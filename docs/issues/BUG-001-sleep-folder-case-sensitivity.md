---
id: BUG-001
type: bug
title: Sleep background upload fails with uppercase "Sleep" folder
status: closed
priority: medium
source: reddit-appstore
reporter: u/wmacphail
date_reported: 2026-02-01
date_closed: 2026-02-24
labels: [sleep-background, case-sensitivity]
blocked_by: ""
related: []
reddit_thread: ""
---

# BUG-001: Sleep background upload fails with uppercase "Sleep" folder

## Description

When uploading a sleep background image, the app expects a lowercase `sleep` folder on the device. If the folder is `Sleep` (capital S), the upload silently fails or errors. The user confirmed that manually creating a lowercase `sleep` folder resolved the issue.

## Steps to Reproduce

1. Connect to X4 device that has a `Sleep` folder (capital S)
2. Go to Settings → Sleep Background
3. Select an image and upload
4. Upload fails

## Expected Behavior

The upload should succeed regardless of the folder's case, or the app should create the folder with the correct casing if it doesn't exist.

## Root Cause Investigation

Likely a case-sensitive folder name comparison or `mkdir` call in the sleep background upload flow. Check:

- `app/(tabs)/settings.tsx` — where sleep background upload is triggered
- Any path construction that hardcodes `sleep` vs `Sleep`
- The device API `POST /mkdir` call — does the firmware normalize case?

## Fix Approach

- Use case-insensitive comparison when checking if the sleep folder exists
- Or always create the folder with the exact casing the firmware expects before uploading
- Verify what casing the X4 firmware expects/creates by default
