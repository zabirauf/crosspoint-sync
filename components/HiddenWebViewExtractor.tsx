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
import { log } from '@/services/logger';

const SETTLE_DELAY_MS = 2000;

/**
 * Renders a zero-size offscreen WebView on Android when an extraction is requested.
 * Returns null on iOS or when idle.
 */
export function HiddenWebViewExtractor() {
  const { extractionUrl, requestId } = useWebViewExtractorStore();
  const injectedRef = useRef(false);

  const handleLoadEnd = useCallback(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    // Delay injection to let JS-rendered content settle
    setTimeout(() => {
      // The script is injected via injectedJavaScript prop — onLoadEnd just confirms page loaded
      // We use onLoadEnd + injectedJavaScript timing approach instead
    }, SETTLE_DELAY_MS);
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

  // Wrap the extraction script in a setTimeout so the page JS has time to settle
  const delayedScript = `
    setTimeout(function() {
      ${EXTRACTION_SCRIPT}
    }, ${SETTLE_DELAY_MS});
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
