import { useRef, useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';

import {
  useWebViewExtractorStore,
  resolveExtraction,
  rejectExtraction,
} from '@/services/webview-article-extractor';
import { EXTRACTION_SCRIPT } from '@/services/webview-extraction-script';
import { DEFUDDLE_EXTRACTION_SCRIPT } from '@/services/generated/defuddle-webview-bundle';
import { log } from '@/services/logger';

const SETTLE_DELAY_DEFAULT_MS = 2000;
const SETTLE_DELAY_X_MS = 5000;

function isXTwitterUrl(url: string): boolean {
  return url.includes('x.com/') || url.includes('twitter.com/');
}

function getSettleDelay(url: string): number {
  return isXTwitterUrl(url) ? SETTLE_DELAY_X_MS : SETTLE_DELAY_DEFAULT_MS;
}

/**
 * Renders a zero-size offscreen WebView on Android when an extraction is requested.
 * Returns null on iOS or when idle.
 *
 * Uses the Defuddle bundle (if available) for high-quality extraction with
 * site-specific extractors (Twitter threads, X Articles, etc.). Falls back
 * to the generic extraction script otherwise.
 */
export function HiddenWebViewExtractor() {
  const { extractionUrl, requestId } = useWebViewExtractorStore();
  const injectedRef = useRef(false);

  const handleLoadEnd = useCallback(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.success) {
        log('clip', `WebView extraction succeeded: "${data.title}" (${data.images?.length ?? 0} images)`);
        resolveExtraction({
          title: data.title,
          author: data.author,
          sourceUrl: data.sourceUrl,
          html: data.html,
          images: data.images ?? [],
        });
      } else {
        log('clip', `WebView extraction script error: ${data.error}`);
        rejectExtraction(new Error(data.error || 'Extraction script failed'));
      }
    } catch (e) {
      log('clip', `WebView message parse error: ${e}`);
      rejectExtraction(new Error('Failed to parse WebView extraction result'));
    }
  }, []);

  const handleError = useCallback((event: WebViewErrorEvent) => {
    const desc = event.nativeEvent.description || 'WebView load error';
    log('clip', `WebView load error: ${desc}`);
    rejectExtraction(new Error(desc));
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const status = event.nativeEvent.statusCode;
    log('clip', `WebView HTTP error: ${status}`);
    rejectExtraction(new Error(`HTTP ${status}`));
  }, []);

  if (Platform.OS !== 'android' || !extractionUrl) {
    return null;
  }

  // Use Defuddle bundle if available (includes site-specific extractors),
  // otherwise fall back to generic extraction script
  const script = DEFUDDLE_EXTRACTION_SCRIPT ?? EXTRACTION_SCRIPT;
  const settleDelay = getSettleDelay(extractionUrl);

  // Wrap the extraction script in a setTimeout so the page JS has time to settle.
  // X/Twitter gets a longer delay (5s) because its React bundle is heavy.
  const delayedScript = `
    setTimeout(function() {
      ${script}
    }, ${settleDelay});
    true;
  `;

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        key={requestId}
        source={{ uri: extractionUrl }}
        injectedJavaScript={delayedScript}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleHttpError}
        onLoadEnd={handleLoadEnd}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
});
