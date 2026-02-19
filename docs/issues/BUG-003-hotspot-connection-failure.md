---
id: BUG-003
type: bug
title: Connection fails on iPhone hotspot (172.x.x.x subnet)
status: open
priority: medium
source: reddit-appstore
reporter: u/PresentationPrior243
date_reported: 2026-02-01
date_closed:
labels: [connectivity, hotspot, udp-discovery]
blocked_by: ""
related: []
reddit_thread: ""
---

# BUG-003: Connection fails on iPhone hotspot (172.x.x.x subnet)

## Description

When an X4 device is connected to an iPhone personal hotspot, it gets a 172.x.x.x IP address. Both UDP auto-discovery and manual IP entry fail to connect. The user reports that the CrossX app (another app for the X4) works on the same hotspot setup.

Maintainer asked for DM to debug further — may need more info from the reporter.

## Steps to Reproduce

1. Enable iPhone personal hotspot
2. Connect X4 to the hotspot WiFi
3. Note the X4 gets a 172.x.x.x IP
4. Open CrossPoint Sync on the iPhone
5. Try auto-discovery — device not found
6. Try manual IP entry with the 172.x.x.x address — also fails

## Expected Behavior

Connection should work on any local subnet, including iPhone hotspot's 172.x.x.x range.

## Root Cause Investigation

Possible causes:
1. **UDP broadcast scope**: `255.255.255.255` broadcast may not propagate on hotspot networks. iOS may restrict broadcast on hotspot interfaces.
2. **IP validation**: `services/device-discovery.ts` may filter or reject non-192.168.x.x IPs during manual entry validation.
3. **Network isolation**: iOS hotspot may isolate clients from each other — but CrossX reportedly works, so this is less likely.

Check:
- `services/device-discovery.ts` — IP validation logic, broadcast address used
- Whether the app validates IP format and rejects 172.x.x.x ranges
- iOS networking restrictions on hotspot interfaces

## Fix Approach

- Ensure manual IP entry accepts any valid private IP range (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- For auto-discovery, may need to try subnet-directed broadcast in addition to 255.255.255.255
- Needs further debugging with the reporter to confirm exact failure point
