# CrossPoint Reader Mobile Sync App - Technical Design Document
 
## Executive Summary
 
This document outlines a comprehensive plan for building companion iOS and Android apps for the CrossPoint Reader e-ink device. The apps will enable users to easily discover devices, sync EPUB content, convert web pages to EPUBs, and manage their reading library wirelessly.
 
---
 
## 1. Current Device Capabilities Analysis
 
### 1.1 Connectivity Available
 
| Technology | Status | Details |
|------------|--------|---------|
| **WiFi** | ✅ Supported | 802.11 b/g/n (2.4GHz), STA & AP modes |
| **Bluetooth/BLE** | ❌ Not Available | Not implemented in firmware |
| **USB** | ⚠️ Limited | Programming/serial only, no mass storage |
 
### 1.2 Existing Network Services
 
```
┌─────────────────────────────────────────────────────────────┐
│                  CrossPoint Reader Device                    │
├─────────────────────────────────────────────────────────────┤
│  HTTP Server (Port 80)                                      │
│    ├── GET  /api/status     → Device info (JSON)            │
│    ├── GET  /api/files      → File listing (JSON)           │
│    ├── GET  /download       → Download files                │
│    ├── POST /upload         → Multipart file upload         │
│    ├── POST /mkdir          → Create folders                │
│    └── POST /delete         → Delete files/folders          │
├─────────────────────────────────────────────────────────────┤
│  WebSocket Server (Port 81)                                 │
│    └── Binary upload protocol (faster than HTTP)            │
├─────────────────────────────────────────────────────────────┤
│  UDP Discovery (Port 8134)                                  │
│    └── Broadcast "hello" → Response with device info        │
└─────────────────────────────────────────────────────────────┘
```
 
### 1.3 Existing Sync Integrations
 
1. **KOReader Sync** - Reading progress synchronization via `sync.koreader.rocks`
2. **OPDS Browser** - Browse and download from Calibre Content Server
3. **Calibre Wireless** - Direct wireless transfers from Calibre desktop app
 
---
 
## 2. Mobile App Architecture
 
### 2.1 High-Level Architecture
 
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MOBILE APP                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Device        │  │   Library       │  │   Web-to-EPUB   │             │
│  │   Discovery     │  │   Manager       │  │   Converter     │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────────────────┴────────────────────┴────────┐             │
│  │                     Sync Engine                            │             │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │             │
│  │  │ Upload Queue │  │ Download Q   │  │ Progress Sync│     │             │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │             │
│  └───────────────────────────┬───────────────────────────────┘             │
│                              │                                              │
│  ┌───────────────────────────┴───────────────────────────────┐             │
│  │                  Network Layer                             │             │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐   │             │
│  │  │   UDP    │  │    HTTP/     │  │     WebSocket      │   │             │
│  │  │Discovery │  │    REST      │  │   (Fast Upload)    │   │             │
│  │  └──────────┘  └──────────────┘  └────────────────────┘   │             │
│  └───────────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WiFi (Same Network)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CrossPoint Reader Device                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
 
### 2.2 Core Components
 
#### 2.2.1 Device Discovery Module
- **UDP Broadcast Discovery**: Send "hello" to port 8134, receive device info
- **Manual IP Entry**: For networks blocking UDP broadcasts
- **mDNS/Bonjour**: Resolve `crosspoint.local` automatically
- **Device Memory**: Remember previously connected devices
 
#### 2.2.2 Sync Engine
- **Upload Queue**: Background upload with retry logic
- **Download Queue**: Download books from device to phone
- **Progress Sync**: Integrate with KOReader sync protocol
- **Conflict Resolution**: Handle same book on multiple devices
 
#### 2.2.3 Web-to-EPUB Converter
- **Safari/Chrome Share Extension**: "Send to CrossPoint" action
- **Article Extraction**: Clean HTML using Readability algorithm
- **EPUB Generation**: Convert articles to valid EPUB format
- **Image Handling**: Download and embed images
 
---
 
## 3. Sync Protocol Specification
 
### 3.1 Device Discovery Protocol
 
```
┌─────────────┐                           ┌─────────────────┐
│  Mobile App │                           │ CrossPoint Device│
└──────┬──────┘                           └────────┬────────┘
       │                                           │
       │  UDP Broadcast to 255.255.255.255:8134    │
       │  ─────────────────────────────────────►   │
       │          Payload: "hello"                 │
       │                                           │
       │  UDP Response                             │
       │  ◄─────────────────────────────────────   │
       │  "crosspoint (on hostname);81"            │
       │                                           │
       │  HTTP GET /api/status                     │
       │  ─────────────────────────────────────►   │
       │                                           │
       │  JSON: {version, ip, mode, rssi, ...}     │
       │  ◄─────────────────────────────────────   │
       │                                           │
```
 
### 3.2 File Sync Protocol (WebSocket - Recommended)
 
The WebSocket protocol on port 81 provides the fastest, most reliable transfers:
 
```
┌─────────────┐                           ┌─────────────────┐
│  Mobile App │                           │ CrossPoint Device│
└──────┬──────┘                           └────────┬────────┘
       │                                           │
       │  WebSocket Connect ws://<ip>:81/          │
       │  ─────────────────────────────────────►   │
       │                                           │
       │  TEXT: "START:filename.epub:12345:/Books" │
       │  ─────────────────────────────────────►   │
       │         (filename:size:path)              │
       │                                           │
       │  TEXT: "READY"                            │
       │  ◄─────────────────────────────────────   │
       │                                           │
       │  BINARY: [chunk 1 - 64KB]                 │
       │  ─────────────────────────────────────►   │
       │  BINARY: [chunk 2 - 64KB]                 │
       │  ─────────────────────────────────────►   │
       │  ...                                      │
       │                                           │
       │  TEXT: "PROGRESS:65536:12345"             │
       │  ◄─────────────────────────────────────   │
       │         (received:total)                  │
       │                                           │
       │  TEXT: "DONE" or "ERROR:message"          │
       │  ◄─────────────────────────────────────   │
       │                                           │
```
 
### 3.3 REST API Endpoints
 
| Operation | Method | Endpoint | Body/Params |
|-----------|--------|----------|-------------|
| Get device status | GET | `/api/status` | - |
| List files | GET | `/api/files?path=/Books` | Query: path |
| Upload file | POST | `/upload?path=/Books` | Multipart form |
| Download file | GET | `/download?path=/Books/book.epub` | Query: path |
| Create folder | POST | `/mkdir` | Form: name, path |
| Delete item | POST | `/delete` | Form: path, type |
 
### 3.4 Reading Progress Sync (KOReader Protocol)
 
For cross-device reading progress, integrate with KOReader sync:
 
```
Server: https://sync.koreader.rocks:443/
 
Headers:
  x-auth-user: <username>
  x-auth-key: <MD5(password)>
 
Endpoints:
  GET  /users/auth                    # Validate credentials
  GET  /syncs/progress/:documentHash  # Get progress
  PUT  /syncs/progress                # Update progress
```
 
**Progress Data Format:**
```json
{
  "document": "md5_hash_of_file",
  "progress": "/body/DocFragment[2]/body/div/p[15]/text().0",
  "percentage": 0.42,
  "device": "CrossPoint",
  "device_id": "unique_device_id",
  "timestamp": 1706540000
}
```
 
---
 
## 4. Web-to-EPUB Conversion Feature
 
### 4.1 User Flow
 
```
┌─────────────────────────────────────────────────────────────┐
│  1. User browsing web page in Safari/Chrome                 │
│     ↓                                                       │
│  2. Tap "Share" → "Send to CrossPoint"                      │
│     ↓                                                       │
│  3. Share extension captures URL                            │
│     ↓                                                       │
│  4. App fetches page, extracts article content              │
│     ↓                                                       │
│  5. Generates EPUB with metadata                            │
│     ↓                                                       │
│  6. Queues for sync (or syncs immediately if connected)     │
│     ↓                                                       │
│  7. User sees notification: "Article saved to CrossPoint"   │
└─────────────────────────────────────────────────────────────┘
```
 
### 4.2 EPUB Generation Pipeline
 
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Fetch HTML   │───►│  Extract     │───►│  Download    │───►│  Generate    │
│ from URL     │    │  Article     │    │  Images      │    │  EPUB        │
└──────────────┘    │  (Readability)│    │  & Embed     │    └──────────────┘
                    └──────────────┘    └──────────────┘
```
 
### 4.3 EPUB Structure Generated
 
```
article.epub/
├── mimetype
├── META-INF/
│   └── container.xml
├── OEBPS/
│   ├── content.opf        # Metadata & manifest
│   ├── toc.ncx            # Navigation (EPUB 2)
│   ├── nav.xhtml          # Navigation (EPUB 3)
│   ├── chapter1.xhtml     # Article content
│   └── images/
│       ├── img1.jpg
│       └── img2.png
```
 
### 4.4 Content Extraction Libraries
 
| Platform | Library | Purpose |
|----------|---------|---------|
| iOS | **SwiftSoup** | HTML parsing |
| iOS | **Readability.swift** | Article extraction |
| Android | **Jsoup** | HTML parsing |
| Android | **AReadable** | Article extraction |
| Both | Custom EPUB generator | Create valid EPUB 3 files |
 
---
 
## 5. User Experience Design
 
### 5.1 Main App Screens
 
#### Home Screen
```
┌─────────────────────────────────────┐
│  ◀ CrossPoint Sync                  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 📱 Living Room Reader       │    │
│  │    192.168.1.42 • Connected │    │
│  │    WiFi: -45 dBm            │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ 📚     │ │ 🔄     │ │ 🌐     │  │
│  │Library │ │ Sync   │ │Web     │  │
│  │        │ │ Queue  │ │Clips   │  │
│  └────────┘ └────────┘ └────────┘  │
│                                     │
│  ─────────────────────────────────  │
│  Recent Activity                    │
│  • Uploaded "Book Title" 2 min ago  │
│  • Synced progress for 3 books      │
│  • Downloaded cover images          │
│                                     │
└─────────────────────────────────────┘
```
 
#### Library Browser
```
┌─────────────────────────────────────┐
│  ◀ Device Library          🔍 ≡    │
├─────────────────────────────────────┤
│  📁 /Books                          │
│  ─────────────────────────────────  │
│  📁 Fiction                    ▶    │
│  📁 Non-Fiction                ▶    │
│  📁 Articles                   ▶    │
│  ─────────────────────────────────  │
│  📖 The Great Gatsby.epub   1.2 MB  │
│  📖 1984.epub               800 KB  │
│  📖 Dune.epub               2.1 MB  │
│                                     │
│  ─────────────────────────────────  │
│  [  + Add Books  ]  [  📁 New Folder  ]│
└─────────────────────────────────────┘
```
 
#### Sync Queue
```
┌─────────────────────────────────────┐
│  ◀ Sync Queue                       │
├─────────────────────────────────────┤
│                                     │
│  Uploading (2)                      │
│  ┌─────────────────────────────┐    │
│  │ 📖 Article: AI in 2024.epub │    │
│  │ ████████░░░░░░░░░░░  42%    │    │
│  │ 1.2 MB / 2.8 MB             │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 📖 New Yorker Story.epub    │    │
│  │ Waiting...                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Completed Today (5)                │
│  ✓ Tech Blog Post.epub              │
│  ✓ News Article.epub                │
│  ✓ Book Review.epub                 │
│                                     │
└─────────────────────────────────────┘
```
 
### 5.2 Share Extension Flow (iOS)
 
```
Safari → Share → "Send to CrossPoint"
           │
           ▼
┌─────────────────────────────────────┐
│  Send to CrossPoint                 │
├─────────────────────────────────────┤
│                                     │
│  Article: "The Future of AI"        │
│  Source:  techblog.com              │
│                                     │
│  Save to: ┌──────────────────────┐  │
│           │ /Books/Articles    ▼│  │
│           └──────────────────────┘  │
│                                     │
│  ☑ Include images                   │
│  ☑ Sync immediately                 │
│                                     │
│  [ Cancel ]        [ Send ]         │
│                                     │
└─────────────────────────────────────┘
```
 
### 5.3 Notification & Feedback
 
- **Transfer Complete**: "✓ 'Article Title' synced to CrossPoint"
- **Transfer Failed**: "✗ Failed to sync - Device offline. Queued for later."
- **Progress Synced**: "📖 Reading progress updated across 3 books"
 
---
 
## 6. Technology Stack
 
### 6.1 Cross-Platform Framework: React Native
 
| Aspect | Details |
|--------|---------|
| **Framework** | React Native 0.73+ with New Architecture |
| **Language** | TypeScript (strict mode) |
| **Why React Native** | Large ecosystem, JavaScript familiarity, excellent WebSocket support, Expo for rapid development |
 
### 6.2 React Native Architecture
 
```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                          │
├─────────────────────────────────────────────────────────────┤
│  UI Layer                                                   │
│  ├── React Navigation (Navigation)                          │
│  ├── React Native Paper (Material Design)                   │
│  └── Custom e-ink friendly theme                            │
├─────────────────────────────────────────────────────────────┤
│  State Management                                           │
│  ├── Zustand (Global state)                                 │
│  ├── TanStack Query (Server state & caching)                │
│  └── React Context (Theme, Device connection)               │
├─────────────────────────────────────────────────────────────┤
│  Business Logic                                             │
│  ├── Device discovery service                               │
│  ├── Sync engine (upload/download queues)                   │
│  ├── EPUB generator                                         │
│  └── KOReader sync client                                   │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├── WatermelonDB (Local database)                          │
│  ├── MMKV (Fast key-value storage)                          │
│  └── react-native-fs (File system)                          │
├─────────────────────────────────────────────────────────────┤
│  Network Layer                                              │
│  ├── Axios (HTTP client)                                    │
│  ├── react-native-websocket (WebSocket)                     │
│  └── react-native-udp (Device discovery)                    │
├─────────────────────────────────────────────────────────────┤
│  Native Modules                                             │
│  ├── iOS Share Extension (Swift)                            │
│  └── Android Share Intent (Kotlin)                          │
└─────────────────────────────────────────────────────────────┘
```
 
### 6.3 Key Dependencies (package.json)
 
```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.73.0",
 
    "// Navigation": "",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/native-stack": "^6.9.0",
    "@react-navigation/bottom-tabs": "^6.5.0",
 
    "// UI Components": "",
    "react-native-paper": "^5.12.0",
    "react-native-vector-icons": "^10.0.0",
    "react-native-safe-area-context": "^4.8.0",
 
    "// State Management": "",
    "zustand": "^4.4.0",
    "@tanstack/react-query": "^5.17.0",
 
    "// Networking": "",
    "axios": "^1.6.0",
    "react-native-tcp-socket": "^6.0.0",
    "react-native-udp": "^4.1.0",
 
    "// Storage": "",
    "react-native-mmkv": "^2.11.0",
    "@nozbe/watermelondb": "^0.27.0",
    "react-native-fs": "^2.20.0",
 
    "// EPUB Generation": "",
    "jszip": "^3.10.0",
    "htmlparser2": "^9.1.0",
    "@mozilla/readability": "^0.5.0",
    "uuid": "^9.0.0",
 
    "// Utilities": "",
    "date-fns": "^3.2.0",
    "crypto-js": "^4.2.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/react": "^18.2.0",
    "jest": "^29.7.0",
    "@testing-library/react-native": "^12.4.0"
  }
}
```
 
### 6.4 iOS Share Extension (Swift + React Native Bridge)
 
```swift
// ios/ShareExtension/ShareViewController.swift
import UIKit
import Social
import MobileCoreServices
 
class ShareViewController: SLComposeServiceViewController {
    override func didSelectPost() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachment = item.attachments?.first else {
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
 
        if attachment.hasItemConformingToTypeIdentifier(kUTTypeURL as String) {
            attachment.loadItem(forTypeIdentifier: kUTTypeURL as String) { [weak self] url, error in
                if let url = url as? URL {
                    self?.saveToAppGroup(url: url)
                }
                self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }
    }
 
    private func saveToAppGroup(url: URL) {
        let sharedDefaults = UserDefaults(suiteName: "group.com.crosspoint.sync")
        var pending = sharedDefaults?.array(forKey: "pendingUrls") as? [String] ?? []
        pending.append(url.absoluteString)
        sharedDefaults?.set(pending, forKey: "pendingUrls")
    }
}
```
 
### 6.5 Android Share Intent (Kotlin)
 
```kotlin
// android/app/src/main/java/com/crosspointsync/ShareReceiverActivity.kt
package com.crosspointsync
 
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
 
class ShareReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
 
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                if (intent.type == "text/plain") {
                    val sharedUrl = intent.getStringExtra(Intent.EXTRA_TEXT)
                    sharedUrl?.let { url ->
                        // Store in SharedPreferences for React Native to pick up
                        val prefs = getSharedPreferences("CrossPointSync", MODE_PRIVATE)
                        val pending = prefs.getStringSet("pendingUrls", mutableSetOf()) ?: mutableSetOf()
                        pending.add(url)
                        prefs.edit().putStringSet("pendingUrls", pending).apply()
                    }
                }
            }
        }
 
        // Launch main app
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
        finish()
    }
}
```
 
---
 
## 7. EPUB Generation Implementation
 
### 7.1 Article Extraction
 
```typescript
// src/services/articleExtractor.ts
import { Readability } from '@mozilla/readability';
import { parseDocument } from 'htmlparser2';
import axios from 'axios';
 
export interface ExtractedArticle {
  title: string;
  author: string | null;
  publishDate: Date | null;
  content: string;
  images: ImageAsset[];
  sourceUrl: string;
}
 
export interface ImageAsset {
  originalUrl: string;
  localPath: string;
  filename: string;
}
 
export async function extractArticle(url: string): Promise<ExtractedArticle> {
  // 1. Fetch HTML
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'CrossPoint Sync App' }
  });
 
  // 2. Parse with Readability
  const doc = parseDocument(response.data);
  const reader = new Readability(doc);
  const article = reader.parse();
 
  if (!article) {
    throw new Error('Could not extract article content');
  }
 
  // 3. Extract and download images
  const images = await downloadImages(article.content, url);
 
  return {
    title: article.title,
    author: article.byline,
    publishDate: extractPublishDate(response.data),
    content: article.content,
    images,
    sourceUrl: url,
  };
}
 
async function downloadImages(html: string, baseUrl: string): Promise<ImageAsset[]> {
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  const images: ImageAsset[] = [];
  let match;
 
  while ((match = imgRegex.exec(html)) !== null) {
    const imgUrl = new URL(match[1], baseUrl).href;
    const filename = `img_${images.length}.jpg`;
 
    try {
      const imgResponse = await axios.get(imgUrl, { responseType: 'arraybuffer' });
      const localPath = `${RNFS.CachesDirectoryPath}/${filename}`;
      await RNFS.writeFile(localPath, imgResponse.data, 'base64');
 
      images.push({ originalUrl: imgUrl, localPath, filename });
    } catch (e) {
      console.warn(`Failed to download image: ${imgUrl}`);
    }
  }
 
  return images;
}
```
 
### 7.2 EPUB Generator
 
```typescript
// src/services/epubGenerator.ts
import JSZip from 'jszip';
import RNFS from 'react-native-fs';
import { v4 as uuidv4 } from 'uuid';
import { ExtractedArticle } from './articleExtractor';
 
export async function generateEpub(article: ExtractedArticle): Promise<string> {
  const zip = new JSZip();
  const bookId = uuidv4();
 
  // 1. mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
 
  // 2. META-INF/container.xml
  zip.file('META-INF/container.xml', CONTAINER_XML);
 
  // 3. OEBPS/content.opf
  zip.file('OEBPS/content.opf', generateContentOpf(article, bookId));
 
  // 4. OEBPS/toc.ncx (EPUB 2 compatibility)
  zip.file('OEBPS/toc.ncx', generateTocNcx(article, bookId));
 
  // 5. OEBPS/nav.xhtml (EPUB 3 navigation)
  zip.file('OEBPS/nav.xhtml', generateNavXhtml(article));
 
  // 6. OEBPS/chapter1.xhtml (article content)
  zip.file('OEBPS/chapter1.xhtml', generateChapterXhtml(article));
 
  // 7. Add images
  for (const image of article.images) {
    const imageData = await RNFS.readFile(image.localPath, 'base64');
    zip.file(`OEBPS/images/${image.filename}`, imageData, { base64: true });
  }
 
  // Generate ZIP and save
  const epubData = await zip.generateAsync({ type: 'base64' });
  const filename = sanitizeFilename(article.title) + '.epub';
  const epubPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
 
  await RNFS.writeFile(epubPath, epubData, 'base64');
  return epubPath;
}
 
function generateContentOpf(article: ExtractedArticle, bookId: string): string {
  const escapeXml = (s: string) => s.replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
 
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${bookId}</dc:identifier>
    <dc:title>${escapeXml(article.title)}</dc:title>
    <dc:creator>${escapeXml(article.author || 'Unknown')}</dc:creator>
    <dc:date>${(article.publishDate || new Date()).toISOString()}</dc:date>
    <dc:source>${escapeXml(article.sourceUrl)}</dc:source>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    ${article.images.map((img, i) =>
      `<item id="img${i}" href="images/${img.filename}" media-type="image/jpeg"/>`
    ).join('\n    ')}
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`;
}
 
const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
```
 
---
 
## 8. Sync Engine Implementation
 
### 8.1 Upload Queue Manager
 
```typescript
// src/services/syncEngine.ts
import RNFS from 'react-native-fs';
import { create } from 'zustand';
import { Buffer } from 'buffer';
 
export interface SyncJob {
  id: string;
  filePath: string;
  remotePath: string;
  deviceIp: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  totalBytes: number;
  error?: string;
}
 
interface SyncStore {
  jobs: SyncJob[];
  addJob: (job: Omit<SyncJob, 'id' | 'status' | 'progress'>) => void;
  updateJob: (id: string, updates: Partial<SyncJob>) => void;
  removeJob: (id: string) => void;
}
 
export const useSyncStore = create<SyncStore>((set) => ({
  jobs: [],
  addJob: (job) => set((state) => ({
    jobs: [...state.jobs, {
      ...job,
      id: Date.now().toString(),
      status: 'pending',
      progress: 0,
    }]
  })),
  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map(j => j.id === id ? { ...j, ...updates } : j)
  })),
  removeJob: (id) => set((state) => ({
    jobs: state.jobs.filter(j => j.id !== id)
  })),
}));
 
export async function uploadViaWebSocket(
  job: SyncJob,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${job.deviceIp}:81/`);
 
    ws.onopen = async () => {
      try {
        const fileContent = await RNFS.readFile(job.filePath, 'base64');
        const fileBuffer = Buffer.from(fileContent, 'base64');
        const fileName = job.filePath.split('/').pop() || 'file.epub';
 
        // Send START command
        ws.send(`START:${fileName}:${fileBuffer.length}:${job.remotePath}`);
      } catch (error) {
        reject(error);
      }
    };
 
    ws.onmessage = async (event) => {
      const message = event.data as string;
 
      if (message === 'READY') {
        // Send file in chunks
        const fileContent = await RNFS.readFile(job.filePath, 'base64');
        const fileBuffer = Buffer.from(fileContent, 'base64');
        const CHUNK_SIZE = 64 * 1024; // 64KB
 
        for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
          const chunk = fileBuffer.slice(i, Math.min(i + CHUNK_SIZE, fileBuffer.length));
          ws.send(chunk);
        }
      } else if (message.startsWith('PROGRESS:')) {
        const [, received, total] = message.split(':');
        onProgress(parseInt(received), parseInt(total));
      } else if (message === 'DONE') {
        ws.close();
        resolve();
      } else if (message.startsWith('ERROR:')) {
        ws.close();
        reject(new Error(message.substring(6)));
      }
    };
 
    ws.onerror = (error) => {
      reject(new Error('WebSocket error: ' + error.message));
    };
  });
}
```
 
### 8.2 Device Discovery
 
```typescript
// src/services/deviceDiscovery.ts
import dgram from 'react-native-udp';
import axios from 'axios';
 
const DISCOVERY_PORT = 8134;
const DISCOVERY_TIMEOUT = 5000;
 
export interface CrossPointDevice {
  ip: string;
  hostname: string;
  wsPort: number;
  version?: string;
  rssi?: number;
  mode?: 'STA' | 'AP';
}
 
export async function discoverDevices(): Promise<CrossPointDevice[]> {
  return new Promise((resolve) => {
    const devices: CrossPointDevice[] = [];
    const socket = dgram.createSocket({ type: 'udp4' });
 
    socket.once('listening', () => {
      socket.setBroadcast(true);
      // Send discovery broadcast
      const message = Buffer.from('hello');
      socket.send(message, 0, message.length, DISCOVERY_PORT, '255.255.255.255');
    });
 
    socket.on('message', async (data, rinfo) => {
      const response = data.toString();
      // Parse: "crosspoint (on hostname);81"
      const match = response.match(/crosspoint \(on (.+)\);(\d+)/);
 
      if (match) {
        const device: CrossPointDevice = {
          ip: rinfo.address,
          hostname: match[1],
          wsPort: parseInt(match[2]),
        };
 
        // Fetch full status
        try {
          const status = await fetchDeviceStatus(device.ip);
          device.version = status.version;
          device.rssi = status.rssi;
          device.mode = status.mode;
          devices.push(device);
        } catch (e) {
          // Still add device even if status fetch fails
          devices.push(device);
        }
      }
    });
 
    socket.bind(0);
 
    // Timeout and return found devices
    setTimeout(() => {
      socket.close();
      resolve(devices);
    }, DISCOVERY_TIMEOUT);
  });
}
 
export async function fetchDeviceStatus(ip: string): Promise<{
  version: string;
  ip: string;
  mode: 'STA' | 'AP';
  rssi: number;
  freeHeap: number;
  uptime: number;
}> {
  const response = await axios.get(`http://${ip}/api/status`, { timeout: 3000 });
  return response.data;
}
 
export async function fetchFileList(ip: string, path: string = '/'): Promise<{
  name: string;
  size: number;
  isDirectory: boolean;
  isEpub: boolean;
}[]> {
  const response = await axios.get(`http://${ip}/api/files`, {
    params: { path },
    timeout: 5000,
  });
  return response.data;
}
```
 
---
 
## 9. Security Considerations
 
### 9.1 Current Security Model
 
The CrossPoint device currently operates with **no authentication** for file operations. This is acceptable for home network use but presents risks:
 
| Risk | Mitigation |
|------|------------|
| Unauthorized file access | Require same-network access |
| Man-in-the-middle | Use HTTPS (future firmware) |
| Credential theft (KOReader) | XOR obfuscation (weak) |
 
### 9.2 Recommended Security Enhancements
 
#### 9.2.1 Device Pairing (Recommended for v1.0)
 
```
┌─────────────────┐                    ┌─────────────────┐
│   Mobile App    │                    │  CrossPoint     │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. Request pairing                  │
         │  ─────────────────────────────────►  │
         │                                      │
         │  2. Device shows 6-digit code        │
         │                      ┌─────────┐     │
         │                      │ 847291  │     │
         │                      └─────────┘     │
         │                                      │
         │  3. User enters code in app          │
         │  ─────────────────────────────────►  │
         │                                      │
         │  4. Device returns pairing token     │
         │  ◄─────────────────────────────────  │
         │     (stored securely in app)         │
         │                                      │
         │  5. Future requests include token    │
         │  Authorization: Bearer <token>       │
         │  ─────────────────────────────────►  │
```
 
#### 9.2.2 Future: TLS Support
 
When ESP32 resources allow, implement HTTPS:
- Self-signed certificate generated on device
- App trusts device certificate after pairing
- All communication encrypted
 
---
 
## 10. Development Phases (Agent-Optimized)
 
This project is structured into small, self-contained phases designed for AI agent development. Each phase has clear inputs, outputs, and acceptance criteria.
 
---
 
### Phase 1: Project Scaffolding
**Goal**: Create the React Native project structure with TypeScript configuration
 
**Tasks**:
1. Initialize React Native project with TypeScript template
2. Configure ESLint, Prettier, and strict TypeScript settings
3. Set up folder structure (`src/screens`, `src/services`, `src/components`, `src/hooks`, `src/types`)
4. Add base dependencies (React Navigation, React Native Paper)
5. Create basic App.tsx with navigation container
 
**Acceptance Criteria**:
- [ ] Project builds on iOS and Android simulators
- [ ] TypeScript strict mode enabled
- [ ] Basic navigation shell renders
 
**Output**: Working React Native project skeleton
 
---
 
### Phase 2: Theme & Design System
**Goal**: Create e-ink friendly UI theme and reusable components
 
**Tasks**:
1. Create theme configuration (colors, typography, spacing)
2. Build `Button`, `Card`, `ListItem` base components
3. Build `Header`, `BottomNav` navigation components
4. Create `ProgressBar` and `StatusIndicator` components
5. Add dark/light mode support
 
**Acceptance Criteria**:
- [ ] All components render correctly
- [ ] Theme switching works
- [ ] Components follow Material Design 3 guidelines
 
**Dependencies**: Phase 1
**Output**: `src/theme/` and `src/components/` directories populated
 
---
 
### Phase 3: Device Discovery Service
**Goal**: Implement UDP broadcast discovery for CrossPoint devices
 
**Tasks**:
1. Install and configure `react-native-udp`
2. Create `DeviceDiscovery` service class
3. Implement UDP broadcast send ("hello" to port 8134)
4. Parse device response (`crosspoint (on hostname);port`)
5. Create `useDeviceDiscovery` hook with loading/error states
6. Add manual IP entry fallback
 
**Acceptance Criteria**:
- [ ] Discovers device on local network within 5 seconds
- [ ] Returns device IP, hostname, and WebSocket port
- [ ] Handles timeout gracefully
- [ ] Manual IP entry works as fallback
 
**Dependencies**: Phase 1
**Output**: `src/services/deviceDiscovery.ts`, `src/hooks/useDeviceDiscovery.ts`
 
---
 
### Phase 4: Device Status API Client
**Goal**: HTTP client for CrossPoint REST API
 
**Tasks**:
1. Create Axios instance with base configuration
2. Implement `getDeviceStatus()` - GET `/api/status`
3. Implement `getFileList(path)` - GET `/api/files`
4. Implement `createFolder(name, path)` - POST `/mkdir`
5. Implement `deleteItem(path, type)` - POST `/delete`
6. Add TypeScript interfaces for all API responses
7. Create `useDeviceStatus` TanStack Query hook
 
**Acceptance Criteria**:
- [ ] All API endpoints return correctly typed responses
- [ ] Error handling for network failures
- [ ] Loading states exposed via hooks
 
**Dependencies**: Phase 3
**Output**: `src/services/api.ts`, `src/hooks/useDeviceApi.ts`, `src/types/api.ts`
 
---
 
### Phase 5: Device Connection Screen
**Goal**: UI for discovering and connecting to devices
 
**Tasks**:
1. Create `DeviceDiscoveryScreen` component
2. Show scanning animation during discovery
3. List discovered devices with status info
4. Add "Enter IP manually" option
5. Implement device selection and connection
6. Store last connected device in MMKV
7. Auto-reconnect to last device on app launch
 
**Acceptance Criteria**:
- [ ] Devices appear in list during scan
- [ ] Tapping device connects and navigates to home
- [ ] Manual IP entry works
- [ ] Remembers last device
 
**Dependencies**: Phases 2, 3, 4
**Output**: `src/screens/DeviceDiscoveryScreen.tsx`
 
---
 
### Phase 6: Home Screen & Navigation
**Goal**: Main app navigation structure
 
**Tasks**:
1. Create bottom tab navigator (Home, Library, Queue, Settings)
2. Build `HomeScreen` with connected device card
3. Show device status (version, WiFi signal, IP)
4. Add quick action buttons (Browse Library, Add Book, Web Clip)
5. Show recent activity feed (placeholder)
6. Handle disconnection state
 
**Acceptance Criteria**:
- [ ] Tab navigation works smoothly
- [ ] Device status displays correctly
- [ ] Disconnection shows reconnect prompt
 
**Dependencies**: Phases 2, 5
**Output**: `src/screens/HomeScreen.tsx`, `src/navigation/TabNavigator.tsx`
 
---
 
### Phase 7: File Browser Screen
**Goal**: Browse and manage files on device SD card
 
**Tasks**:
1. Create `LibraryScreen` with file list
2. Implement folder navigation (breadcrumb trail)
3. Show file icons (folder, EPUB, other)
4. Display file sizes formatted (KB, MB)
5. Add pull-to-refresh
6. Implement folder creation modal
7. Add swipe-to-delete with confirmation
 
**Acceptance Criteria**:
- [ ] Can navigate folder hierarchy
- [ ] Files display with correct metadata
- [ ] Create folder works
- [ ] Delete works with confirmation
 
**Dependencies**: Phases 4, 6
**Output**: `src/screens/LibraryScreen.tsx`, `src/components/FileList.tsx`
 
---
 
### Phase 8: WebSocket Upload Service
**Goal**: High-speed file upload via WebSocket
 
**Tasks**:
1. Create `WebSocketUploader` class
2. Implement connection to `ws://device:81/`
3. Send START command with filename, size, path
4. Chunk file data (64KB chunks)
5. Parse PROGRESS messages
6. Handle DONE and ERROR responses
7. Implement retry logic (3 attempts)
 
**Acceptance Criteria**:
- [ ] Uploads complete successfully
- [ ] Progress updates received
- [ ] Errors handled gracefully
- [ ] Retry on connection failure
 
**Dependencies**: Phase 4
**Output**: `src/services/webSocketUploader.ts`
 
---
 
### Phase 9: Upload Queue & State Management
**Goal**: Zustand store for managing upload queue
 
**Tasks**:
1. Create `useSyncStore` Zustand store
2. Define `SyncJob` interface (id, file, status, progress)
3. Implement `addJob`, `updateJob`, `removeJob` actions
4. Create queue processor that uploads sequentially
5. Persist queue to MMKV for app restart recovery
6. Add background upload support (iOS/Android)
 
**Acceptance Criteria**:
- [ ] Jobs queue and process in order
- [ ] Progress updates reflect in store
- [ ] Queue persists across app restarts
- [ ] Failed jobs can be retried
 
**Dependencies**: Phase 8
**Output**: `src/store/syncStore.ts`
 
---
 
### Phase 10: Sync Queue Screen
**Goal**: UI for viewing and managing upload queue
 
**Tasks**:
1. Create `SyncQueueScreen` component
2. Show active upload with progress bar
3. List pending uploads
4. Show completed uploads (today)
5. Add cancel button for pending/active
6. Add retry button for failed uploads
7. Show transfer speed
 
**Acceptance Criteria**:
- [ ] Real-time progress display
- [ ] Cancel stops upload and removes from queue
- [ ] Retry re-queues failed upload
 
**Dependencies**: Phases 2, 9
**Output**: `src/screens/SyncQueueScreen.tsx`
 
---
 
### Phase 11: Document Picker Integration
**Goal**: Allow users to select files from device to upload
 
**Tasks**:
1. Install `react-native-document-picker`
2. Create `useDocumentPicker` hook
3. Filter for EPUB files (and common ebook formats)
4. Handle file selection and add to upload queue
5. Add "Add Books" button to Library screen
6. Show destination folder picker
 
**Acceptance Criteria**:
- [ ] Can select EPUB files from device
- [ ] Selected files added to queue
- [ ] Can choose destination folder on device
 
**Dependencies**: Phases 7, 9
**Output**: `src/hooks/useDocumentPicker.ts`
 
---
 
### Phase 12: Article Extraction Service
**Goal**: Extract clean article content from web URLs
 
**Tasks**:
1. Install `@mozilla/readability` and `htmlparser2`
2. Create `ArticleExtractor` class
3. Fetch HTML from URL with proper User-Agent
4. Extract title, author, publish date
5. Extract main content using Readability
6. Clean HTML (remove scripts, ads, nav)
7. Extract image URLs from content
 
**Acceptance Criteria**:
- [ ] Extracts readable content from major news sites
- [ ] Metadata (title, author) extracted correctly
- [ ] Images identified in content
 
**Dependencies**: Phase 1
**Output**: `src/services/articleExtractor.ts`
 
---
 
### Phase 13: Image Downloader
**Goal**: Download and cache article images
 
**Tasks**:
1. Create `ImageDownloader` class
2. Parse image URLs from article HTML
3. Resolve relative URLs to absolute
4. Download images to cache directory
5. Resize large images (max 800px width)
6. Return mapping of original URL to local path
7. Handle download failures gracefully
 
**Acceptance Criteria**:
- [ ] Images download successfully
- [ ] Large images resized
- [ ] Failed downloads don't crash extraction
 
**Dependencies**: Phase 12
**Output**: `src/services/imageDownloader.ts`
 
---
 
### Phase 14: EPUB Generator
**Goal**: Generate valid EPUB 3 files from articles
 
**Tasks**:
1. Install `jszip` for ZIP creation
2. Create `EpubGenerator` class
3. Generate `mimetype` file (uncompressed)
4. Generate `META-INF/container.xml`
5. Generate `OEBPS/content.opf` with metadata
6. Generate `OEBPS/toc.ncx` (EPUB 2 nav)
7. Generate `OEBPS/nav.xhtml` (EPUB 3 nav)
8. Generate `OEBPS/chapter1.xhtml` with content
9. Include images in `OEBPS/images/`
10. Package as ZIP with .epub extension
 
**Acceptance Criteria**:
- [ ] Generated EPUB opens in e-readers
- [ ] Metadata displays correctly
- [ ] Images render in EPUB
- [ ] Navigation works
 
**Dependencies**: Phases 12, 13
**Output**: `src/services/epubGenerator.ts`
 
---
 
### Phase 15: Web Clips Screen
**Goal**: UI for managing saved articles
 
**Tasks**:
1. Create `WebClipsScreen` component
2. Show list of saved/pending articles
3. Display article title, source, date saved
4. Add manual URL input field
5. Show conversion progress
6. Add delete/retry actions
 
**Acceptance Criteria**:
- [ ] Can add URL manually
- [ ] Shows conversion progress
- [ ] Completed articles show in list
 
**Dependencies**: Phases 2, 14
**Output**: `src/screens/WebClipsScreen.tsx`
 
---
 
### Phase 16: iOS Share Extension
**Goal**: "Send to CrossPoint" in iOS share sheet
 
**Tasks**:
1. Create Share Extension target in Xcode
2. Implement `ShareViewController.swift`
3. Handle URL sharing from Safari/browsers
4. Store shared URL in App Group UserDefaults
5. Create React Native bridge to read pending URLs
6. Process pending URLs on app launch
7. Configure App Groups for data sharing
 
**Acceptance Criteria**:
- [ ] Share extension appears in iOS share sheet
- [ ] URLs passed to main app
- [ ] Works even when app is not running
 
**Dependencies**: Phase 14
**Output**: `ios/ShareExtension/`, `src/native/ShareExtensionBridge.ts`
 
---
 
### Phase 17: Android Share Intent
**Goal**: "Send to CrossPoint" in Android share menu
 
**Tasks**:
1. Create `ShareReceiverActivity.kt`
2. Configure intent filter in `AndroidManifest.xml`
3. Store shared URL in SharedPreferences
4. Create React Native native module to read URLs
5. Process pending URLs on app launch
6. Handle deep link if app is running
 
**Acceptance Criteria**:
- [ ] App appears in Android share targets
- [ ] URLs passed to main app
- [ ] Works with app in background
 
**Dependencies**: Phase 14
**Output**: `android/app/src/main/java/.../ShareReceiverActivity.kt`
 
---
 
### Phase 18: KOReader Sync Client
**Goal**: Integrate with KOReader progress sync server
 
**Tasks**:
1. Create `KOReaderSyncClient` class
2. Implement MD5 password hashing
3. Implement `authenticate()` - GET `/users/auth`
4. Implement `getProgress(docHash)` - GET `/syncs/progress/:doc`
5. Implement `updateProgress(progress)` - PUT `/syncs/progress`
6. Create `useKOReaderSync` hook
7. Store credentials securely in Keychain/Keystore
 
**Acceptance Criteria**:
- [ ] Authentication works with valid credentials
- [ ] Can fetch and update reading progress
- [ ] Credentials stored securely
 
**Dependencies**: Phase 1
**Output**: `src/services/koreaderSync.ts`
 
---
 
### Phase 19: Reading Progress UI
**Goal**: UI for syncing reading progress
 
**Tasks**:
1. Create `KOReaderSettingsScreen` for credentials
2. Add progress sync button to book details
3. Create conflict resolution modal (Apply/Upload/Skip)
4. Show last sync time per book
5. Add batch sync option
 
**Acceptance Criteria**:
- [ ] Can enter and save KOReader credentials
- [ ] Sync downloads/uploads progress
- [ ] Conflicts handled with user choice
 
**Dependencies**: Phases 7, 18
**Output**: `src/screens/KOReaderSettingsScreen.tsx`
 
---
 
### Phase 20: Settings Screen
**Goal**: App configuration and preferences
 
**Tasks**:
1. Create `SettingsScreen` component
2. Add device management section (forget device)
3. Add KOReader account settings
4. Add default upload folder setting
5. Add auto-sync toggle
6. Add about/version info
7. Add clear cache option
 
**Acceptance Criteria**:
- [ ] All settings persist correctly
- [ ] Clear cache frees storage
- [ ] Version info displays
 
**Dependencies**: Phases 2, 6
**Output**: `src/screens/SettingsScreen.tsx`
 
---
 
### Phase 21: Error Handling & Offline Support
**Goal**: Graceful error handling throughout app
 
**Tasks**:
1. Create global error boundary component
2. Add network status detection hook
3. Show offline banner when disconnected
4. Queue uploads when offline
5. Auto-retry when back online
6. Add user-friendly error messages
 
**Acceptance Criteria**:
- [ ] App doesn't crash on errors
- [ ] Offline state clearly indicated
- [ ] Queued actions resume when online
 
**Dependencies**: Phases 9, 10
**Output**: `src/components/ErrorBoundary.tsx`, `src/hooks/useNetworkStatus.ts`
 
---
 
### Phase 22: Testing Suite
**Goal**: Unit and integration tests
 
**Tasks**:
1. Configure Jest with React Native Testing Library
2. Write tests for `articleExtractor`
3. Write tests for `epubGenerator`
4. Write tests for `deviceDiscovery`
5. Write tests for `syncStore`
6. Write component tests for key screens
7. Add CI configuration for automated testing
 
**Acceptance Criteria**:
- [ ] >80% code coverage on services
- [ ] All tests pass
- [ ] CI runs tests on PR
 
**Dependencies**: All service phases
**Output**: `__tests__/` directory, `.github/workflows/test.yml`
 
---
 
### Phase 23: Performance Optimization
**Goal**: Optimize app performance
 
**Tasks**:
1. Profile app with Flipper
2. Optimize large file list rendering (FlashList)
3. Add image caching for covers
4. Optimize WebSocket chunking
5. Reduce bundle size (tree shaking)
6. Add Hermes engine optimization
 
**Acceptance Criteria**:
- [ ] File list scrolls at 60fps
- [ ] App launch < 2 seconds
- [ ] Memory usage stable during uploads
 
**Dependencies**: Phase 22
**Output**: Performance improvements across codebase
 
---
 
### Phase 24: App Store Preparation
**Goal**: Prepare for iOS App Store and Google Play
 
**Tasks**:
1. Create app icons (all sizes)
2. Create splash screen
3. Write App Store description and keywords
4. Create screenshots for both platforms
5. Set up app signing (iOS certificates, Android keystore)
6. Configure Fastlane for automated deployment
7. Create privacy policy page
 
**Acceptance Criteria**:
- [ ] All store assets created
- [ ] Builds sign correctly
- [ ] Fastlane deploys to TestFlight/Internal Testing
 
**Dependencies**: Phase 23
**Output**: Store assets, Fastlane configuration
 
---
 
### Phase Dependency Graph
 
```
Phase 1 (Scaffold)
    │
    ├── Phase 2 (Theme) ──────────────────────┐
    │                                         │
    ├── Phase 3 (Discovery) ──┐               │
    │       │                 │               │
    │       └── Phase 4 (API) ┴── Phase 5 (Connect Screen)
    │               │                 │
    │               │                 └── Phase 6 (Home)
    │               │                         │
    │               ├── Phase 7 (Library) ────┤
    │               │       │                 │
    │               │       └── Phase 11 (Doc Picker)
    │               │
    │               └── Phase 8 (WS Upload)
    │                       │
    │                       └── Phase 9 (Queue Store)
    │                               │
    │                               └── Phase 10 (Queue UI)
    │
    ├── Phase 12 (Article Extract)
    │       │
    │       └── Phase 13 (Image DL)
    │               │
    │               └── Phase 14 (EPUB Gen)
    │                       │
    │                       ├── Phase 15 (Web Clips UI)
    │                       ├── Phase 16 (iOS Share)
    │                       └── Phase 17 (Android Share)
    │
    └── Phase 18 (KOReader Client)
            │
            └── Phase 19 (Progress UI)
 
Phases 20-24 can run after their dependencies are met.
```
 
---
 
### Agent Development Guidelines
 
Each phase should be developed with these principles:
 
1. **Self-Contained**: Each phase produces working, testable code
2. **Clear Interfaces**: Define TypeScript interfaces before implementation
3. **Test As You Go**: Write tests alongside implementation
4. **Documentation**: Add JSDoc comments to all public functions
5. **Error Handling**: Every async function should handle errors
6. **Logging**: Add console.log for debugging (remove in prod)
 
**Handoff Format**: After completing a phase, provide:
- List of files created/modified
- How to test the implementation
- Any known limitations or TODOs
- Dependencies for next phases
 
---
 
## 11. Testing Strategy
 
### 11.1 Unit Tests
 
- Article extraction accuracy
- EPUB validation
- Protocol message parsing
- Sync queue logic
 
### 11.2 Integration Tests
 
- Device discovery on various networks
- File upload/download reliability
- Share extension data flow
 
### 11.3 Device Testing Matrix
 
| Device | OS Version | Test Focus |
|--------|------------|------------|
| iPhone 15 | iOS 17 | Primary development |
| iPhone SE | iOS 16 | Smaller screen |
| iPad | iPadOS 17 | Tablet layout |
| Pixel 7 | Android 14 | Primary development |
| Samsung A54 | Android 13 | Popular mid-range |
| Older Android | Android 11 | Minimum supported |
 
---
 
## 12. Future Enhancements
 
### 12.1 Potential Features (Post-v1.0)
 
1. **Cloud Sync**: Optional cloud backup of library
2. **Collections**: Organize books into collections
3. **Reading Stats**: Track reading time and progress
4. **Social Sharing**: Share highlights and notes
5. **Audiobook Support**: If device adds speaker
6. **Multiple Device Management**: Sync across several readers
 
### 12.2 Firmware Enhancements (Wishlist)
 
1. **BLE Support**: Enable Bluetooth for proximity pairing
2. **HTTPS**: Encrypted communication
3. **Authentication API**: Secure device access
4. **Sync Protocol v2**: Bidirectional sync with conflict resolution
 
---
 
## 13. Appendix
 
### A. Sample API Responses
 
**GET /api/status**
```json
{
  "version": "0.16.0",
  "ip": "192.168.1.42",
  "mode": "STA",
  "rssi": -52,
  "freeHeap": 145320,
  "uptime": 3842
}
```
 
**GET /api/files?path=/Books**
```json
[
  {"name": "Fiction", "size": 0, "isDirectory": true, "isEpub": false},
  {"name": "The Great Gatsby.epub", "size": 1234567, "isDirectory": false, "isEpub": true},
  {"name": "1984.epub", "size": 876543, "isDirectory": false, "isEpub": true}
]
```
 
### B. Error Codes
 
| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request (missing parameters) |
| 403 | Forbidden (system file protection) |
| 404 | Not found |
| 500 | Server error (SD card issues) |
 
### C. WebSocket Error Messages
 
| Message | Cause | Recovery |
|---------|-------|----------|
| `ERROR:Failed to create file` | SD card full or path invalid | Check storage, verify path |
| `ERROR:Invalid START format` | Malformed command | Check format: `START:name:size:path` |
| `ERROR:No upload in progress` | Data before START | Send START first |
| `ERROR:Write failed - disk full?` | SD card error | Check device storage |
 
---
 
## 14. Conclusion
 
This plan provides a comprehensive roadmap for building a feature-rich companion app for the CrossPoint Reader. By leveraging the existing firmware APIs (HTTP REST + WebSocket) and adding intelligent features like web-to-EPUB conversion, the app will significantly enhance the user experience of the CrossPoint e-reader ecosystem.
 
### Technology Choice: React Native
 
React Native was selected for this project because:
- **JavaScript/TypeScript familiarity** - Widely known, easy for agents to generate
- **Excellent WebSocket support** - Critical for fast file uploads
- **Large ecosystem** - Battle-tested libraries for all requirements
- **Expo compatibility** - Optional use for faster development iteration
- **Native module access** - Full access to iOS/Android APIs for share extensions
 
### Agent-Optimized Development
 
This plan is structured into **24 small, self-contained phases** designed for AI agent development:
- Each phase has clear inputs, outputs, and acceptance criteria
- Phases can be developed independently once dependencies are met
- Clear handoff format ensures continuity between sessions
- Dependency graph allows parallel development of unrelated features
 
### Key Success Metrics
- Device discovery success rate > 99%
- File transfer reliability > 99.5%
- Web article conversion accuracy > 95%
- App launch to first sync < 30 seconds
- All 24 phases completable by agent with minimal human intervention
 
---
 
*Document Version: 2.0*
*Created: January 2026*
*Updated: React Native stack, Agent-optimized 24-phase development plan*
*For: CrossPoint Reader Firmware v0.16.0+*
