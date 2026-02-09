// Popup script for Zync Safari Web Extension

const states = {
  loading: document.getElementById('loading'),
  preview: document.getElementById('preview'),
  sending: document.getElementById('sending'),
  success: document.getElementById('success'),
  error: document.getElementById('error'),
};

let extractedData = null;

function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

// Extract article when popup opens
async function init() {
  showState('loading');

  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      throw new Error('No active tab found');
    }

    // Send message to content script to extract article
    const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'extract' });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to extract article');
    }

    extractedData = response.data;

    // Show preview
    document.getElementById('article-title').textContent = extractedData.title;
    document.getElementById('article-author').textContent = extractedData.author
      ? `by ${extractedData.author}`
      : '';

    const domain = new URL(extractedData.sourceUrl).hostname;
    document.getElementById('article-source').textContent = domain;

    const imgCount = extractedData.images.length;
    document.getElementById('article-images').textContent =
      imgCount > 0 ? `${imgCount} image${imgCount !== 1 ? 's' : ''}` : 'No images';

    showState('preview');
  } catch (err) {
    document.getElementById('error-message').textContent = err.message;
    showState('error');
  }
}

// Send to Zync
document.getElementById('send-btn').addEventListener('click', async () => {
  if (!extractedData) return;

  showState('sending');

  try {
    const response = await browser.runtime.sendMessage({
      action: 'clip',
      data: extractedData,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to send to Zync');
    }

    showState('success');

    // Auto-close popup after success
    setTimeout(() => window.close(), 2000);
  } catch (err) {
    document.getElementById('error-message').textContent = err.message;
    showState('error');
  }
});

// Retry button
document.getElementById('retry-btn').addEventListener('click', init);

// Start extraction
init();
