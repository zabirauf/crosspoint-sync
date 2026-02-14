# CrossPoint Sync — App Store Listing

All copy and metadata for the App Store Connect submission. Character counts are noted next to each field.

---

## App Name

**CrossPoint Sync** (15 chars — limit: 30)

## Subtitle

**Sync books to your e-reader** (27 chars — limit: 30)

---

## Promotional Text

_170 character limit. Can be updated without a new app version._

> Wirelessly transfer EPUBs and PDFs to your XTEink X4 e-ink reader. Browse files, manage your library, and clip web articles for offline reading — all from your iPhone.

**Character count: 167**

---

## Description

_4,000 character limit._

CrossPoint Sync is a wireless companion app for the XTEink X4 e-ink reader. Transfer books, manage your device library, and clip web articles — all over your local WiFi network, no cables required.

WIRELESS FILE TRANSFER
Send EPUBs and PDFs to your e-ink reader over WiFi. CrossPoint Sync discovers your device automatically on the local network, or you can connect manually by IP address. Uploads are chunked and streamed over WebSocket for reliable, fast transfers.

DEVICE FILE BROWSER
Browse the full file system on your e-ink reader directly from your iPhone. Navigate folders with breadcrumb navigation, create new folders, delete files, and download books back to your phone. Swipe actions make file management quick and intuitive.

UPLOAD QUEUE
Queue multiple books for transfer and watch them upload one by one with real-time progress tracking. The queue persists across app launches — add books now and they'll transfer automatically when your device connects later.

SAFARI WEB CLIPPER
Save any web article for your e-ink reader with the built-in Safari extension. CrossPoint Web Clipper extracts the article text, downloads images, and converts everything into a clean EPUB that's ready to read on your device. Clips sync automatically the next time you open the app.

iOS SHARE EXTENSION
Share EPUBs and PDFs from any app — Files, Safari, email — directly into CrossPoint Sync's upload queue. Files are picked up automatically and transferred to your device.

SLEEP BACKGROUND CUSTOMIZATION
Set a custom sleep screen image on your e-ink reader. Pick any photo from your library, preview it in grayscale, and upload it to your device as the sleep background.

ADDITIONAL FEATURES
• Automatic device discovery via UDP broadcast
• Manual IP entry as fallback
• Configurable upload paths for books and clipped articles
• Dark mode support
• Swipe-to-delete and swipe-to-save file actions
• Breadcrumb navigation with swipe-back gesture
• Device info display: hostname, IP, firmware version

**Character count: 1,999** (limit: 4,000)

---

## Keywords

_100 character limit. Comma-separated, no spaces after commas._

> ebook,e-ink,epub,pdf,transfer,sync,reader,wireless,xteink,library,books,clipper,upload,wifi

**Character count: 91** (limit: 100)

---

## Copyright

> © 2026 Zohaib Rauf

---

## Support URL

> https://github.com/zohaibrauf/crosspoint-sync

_Replace with actual repository or support page URL if different._

---

## Privacy Policy URL

> https://github.com/zohaibrauf/crosspoint-sync/blob/main/docs/PRIVACY.md

The privacy policy states the app collects no data, has no analytics or tracking, no account system, and all communication is local over WiFi.

---

## App Review Notes

_Visible only to the App Review team. Explain how to test the app and any special requirements._

> CrossPoint Sync requires a physical XTEink X4 e-ink reader on the same WiFi network to demonstrate full functionality. Without the device, the app will show the "No Device Connected" empty state with a Connect button.
>
> TESTING WITHOUT A DEVICE:
> The app can still be reviewed without the hardware:
> 1. Launch the app — the Library tab shows the "No Device Connected" state.
> 2. Tap Connect → the connection sheet opens with Scan and Manual IP options.
> 3. Go to Settings tab to see configurable upload paths, web clipper settings, and device info fields.
> 4. Use the + (FAB) button to add books from the document picker — files are queued even without a device connected.
> 5. The upload queue sheet shows queued files with status and Remove buttons.
>
> TESTING WITH A DEVICE (if available):
> 1. Ensure the XTEink X4 is powered on with Transfer mode enabled and connected to the same WiFi network as the iPhone.
> 2. Open the app and tap Connect → Scan. The device should appear within a few seconds.
> 3. Once connected, the Library tab shows the device file system. You can browse folders, create new folders, and delete files.
> 4. Tap the + button → Upload Book to pick an EPUB or PDF. The file uploads with a progress bar.
> 5. The Safari Web Clipper extension (Settings → Enable in Safari) can save web articles as EPUBs.
>
> LOCAL NETWORK PERMISSION:
> The app requests local network access on first launch. This is required for UDP device discovery and HTTP/WebSocket communication with the e-ink reader.
>
> NO ACCOUNT REQUIRED:
> The app does not require sign-in, has no server-side component, and communicates only with the local e-ink reader device.

---

## App Privacy — Data Collection

**Data Not Collected**

The app does not collect any user data. All communication is local between the iPhone and the e-ink reader over the local WiFi network. No data is sent to external servers.

In App Store Connect, select: **"None of the above"** for all data types, which results in the **"Data Not Collected"** privacy label.

---

## Age Rating

Answer **No** to all content descriptions (violence, profanity, gambling, etc.).

Result: **4+**

---

## Pricing & Availability

- **Price**: Free
- **Availability**: All territories / regions
- **In-App Purchases**: None

---

## Category

- **Primary Category**: Books
- **Secondary Category**: Utilities

_Books is the best fit — the app's core purpose is transferring, managing, and clipping books/articles for an e-reader. Utilities as secondary reflects its role as a hardware companion for the XTEink X4._

---

## Screenshots

Required sizes for App Store:
- **iPhone 6.7" display** (iPhone 16 Pro Max): 1320 x 2868 px
- **iPad 13" display** (iPad Pro 13-inch M4): 2064 x 2752 px
- **iPhone 6.5" display** (iPhone 11 Pro Max): 1284 x 2778 px _(optional)_
- **iPhone 5.5" display** (iPhone 8 Plus): 1242 x 2208 px _(optional)_

Minimum: 3 screenshots per device class. Maximum: 10. Recommended: 6-8.

### iPhone Screenshots

| # | Screen | Description | File |
|---|--------|-------------|------|
| 1 | Library (connected) | File browser showing books and folders on device | `01-library-connected.png` |
| 2 | Upload queue | Queued EPUB waiting for device connection | `02-upload-queue.png` |
| 3 | Safari Web Clipper | Extension popup over a web article | `03-web-clipper.png` |
| 4 | FAB menu open | Library tab with Upload Book / New Folder / Sleep Background | `04-fab-menu.png` |
| 5 | Sleep background preview | Grayscale preview of a photo for sleep screen | `05-sleep-background.png` |
| 6 | Settings tab | Device info, upload paths, web clipper settings | `06-settings.png` |
| 7 | iOS Share Sheet | Share sheet with CrossPoint Sync target visible | `07-share-sheet.png` |
| 8 | Device connection | Connection sheet showing connected XTEink device | `08-device-discovery.png` |

Captured at **1320 x 2868 px** (iPhone 16 Pro Max simulator, iOS 18.2) in light mode. Files in `docs/screenshots/`.

### iPad Screenshots

| # | Screen | Description | File |
|---|--------|-------------|------|
| 1 | Library (connected) | File browser showing books and folders on device | `ipad-01-library-connected.png` |
| 2 | Upload queue | Queued EPUB waiting for device connection | `ipad-02-upload-queue.png` |
| 3 | Safari Web Clipper | Extension popup over a web article | `ipad-03-web-clipper.png` |
| 4 | FAB menu open | Library tab with Upload Book / New Folder / Sleep Background | `ipad-04-fab-menu.png` |
| 5 | Sleep background preview | Grayscale preview of a photo for sleep screen | `ipad-05-sleep-background.png` |
| 6 | Settings tab | Device info, upload paths, web clipper settings | `ipad-06-settings.png` |
| 7 | iOS Share Sheet | Share sheet with CrossPoint Sync target visible | `ipad-07-share-sheet.png` |
| 8 | Device connection | Connection sheet showing connected XTEink device | `ipad-08-device-discovery.png` |

Captured at **2064 x 2752 px** (iPad Pro 13-inch M4 simulator, iOS 18.2) in light mode. Files in `docs/screenshots/`.

### Notes

- Both iPhone and iPad screenshots captured from simulators running iOS 18.2.
- Status bar overridden: 9:41, full signal/WiFi/battery.
- Device connected to XTEink X4 at 192.168.1.105 for live data.

---

## App Store Connect Field Checklist

| Field | Value | Status |
|-------|-------|--------|
| App Name | CrossPoint Sync | Ready |
| Subtitle | Sync books to your e-reader | Ready |
| Promotional Text | _(see above)_ | Ready |
| Description | _(see above)_ | Ready |
| Keywords | _(see above)_ | Ready |
| Support URL | GitHub repo or dedicated page | **Needs real URL** |
| Privacy Policy URL | `docs/PRIVACY.md` on GitHub | Ready |
| Copyright | © 2026 Zohaib Rauf | Ready |
| App Privacy | Data Not Collected | Ready to declare |
| Age Rating | 4+ (all No) | Ready to fill |
| Price | Free | Ready |
| Category | Books / Utilities | Ready |
| Screenshots (6.7") | 8 iPhone captures in `docs/screenshots/` | Ready |
| Screenshots (13") | 8 iPad captures in `docs/screenshots/` | Ready |
| App Review Notes | _(see above)_ | Ready |
| Build | Submit via EAS or Xcode | Pending |
