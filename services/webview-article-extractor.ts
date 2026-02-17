import { create } from 'zustand';

interface WebViewExtractionResult {
  title: string;
  author: string;
  sourceUrl: string;
  html: string;
  images: string[];
}

interface WebViewExtractorState {
  extractionUrl: string | null;
  requestId: number;
  setExtraction: (url: string) => void;
  clear: () => void;
}

export const useWebViewExtractorStore = create<WebViewExtractorState>((set, get) => ({
  extractionUrl: null,
  requestId: 0,
  setExtraction: (url) => set({ extractionUrl: url, requestId: get().requestId + 1 }),
  clear: () => set({ extractionUrl: null }),
}));

// Module-level promise bridge
let pendingResolve: ((result: WebViewExtractionResult) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

const EXTRACTION_TIMEOUT_MS = 15_000;

/**
 * Triggers a WebView-based article extraction for the given URL.
 * Returns a promise that resolves when the component posts results back.
 * Rejects on timeout or extraction error (caller should fall back to fetch+regex).
 */
export function extractArticleViaWebView(url: string): Promise<WebViewExtractionResult> {
  // Clean up any lingering state
  cleanup();

  return new Promise<WebViewExtractionResult>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    timeoutId = setTimeout(() => {
      rejectExtraction(new Error(`WebView extraction timed out after ${EXTRACTION_TIMEOUT_MS / 1000}s`));
    }, EXTRACTION_TIMEOUT_MS);

    useWebViewExtractorStore.getState().setExtraction(url);
  });
}

/** Called by HiddenWebViewExtractor on successful extraction. */
export function resolveExtraction(result: WebViewExtractionResult): void {
  if (!pendingResolve) return;
  const resolve = pendingResolve;
  cleanup();
  resolve(result);
}

/** Called by HiddenWebViewExtractor on error, or by the timeout. */
export function rejectExtraction(error: Error): void {
  if (!pendingReject) return;
  const reject = pendingReject;
  cleanup();
  reject(error);
}

function cleanup(): void {
  pendingResolve = null;
  pendingReject = null;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  useWebViewExtractorStore.getState().clear();
}
