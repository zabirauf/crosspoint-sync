// Background script for Zync Safari Web Extension
// Handles image downloads and native messaging

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'clip') {
    handleClip(message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async
  }
});

async function handleClip(data) {
  const { title, author, sourceUrl, html, images } = data;

  // Download images via fetch (background script has page cookies)
  const downloadedImages = [];
  for (const url of images) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const blob = await response.blob();
      const mimeType = blob.type || guessMimeType(url);

      // Convert blob to base64 for passing to native handler
      const base64 = await blobToBase64(blob);

      downloadedImages.push({
        originalUrl: url,
        base64: base64,
        mimeType: mimeType,
      });
    } catch (err) {
      // Skip failed images — article text is still readable
      console.log(`[Zync] Failed to download image: ${url}`, err);
    }
  }

  // Send to native handler via native messaging
  const payload = {
    action: 'clip',
    title,
    author,
    sourceUrl,
    html,
    images: downloadedImages,
  };

  const response = await browser.runtime.sendNativeMessage(
    'application.id',
    payload
  );

  return response;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Strip the data:...;base64, prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function guessMimeType(url) {
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
  };
  return map[ext] || 'image/jpeg';
}
