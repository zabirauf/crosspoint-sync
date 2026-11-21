import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { usePluginRunnerStore } from '@/services/plugin-runner';
import { log } from '@/services/logger';

/**
 * Hosts the reader's `/plugins-run` page while a plugin job is outstanding.
 * The page loads the SD-card plugins with their UI hidden and executes
 * queued jobs in this WebView. Renders nothing when idle.
 */
export function HiddenPluginRunner() {
  const url = usePluginRunnerStore((s) => s.url);
  const sessionId = usePluginRunnerStore((s) => s.sessionId);
  const reportLoadError = usePluginRunnerStore((s) => s.reportLoadError);

  if (!url) return null;

  return (
    <View style={styles.container} pointerEvents="none" testID="PluginRunner.Host">
      <WebView
        key={sessionId}
        source={{ uri: url }}
        onLoadEnd={() => log('plugin', `Plugin runner loaded: ${url}`)}
        onError={(event) => {
          const message = event.nativeEvent.description || 'Plugin runner failed to load';
          log('plugin', `Plugin runner load error: ${message}`);
          reportLoadError(message);
        }}
        onHttpError={(event) => {
          const message = `Plugin runner page returned HTTP ${event.nativeEvent.statusCode}`;
          log('plugin', message);
          reportLoadError(message);
        }}
        javaScriptEnabled
        domStorageEnabled
        // The runner fetches the reader's own same-origin endpoints only.
        originWhitelist={['http://*']}
        // A WebView with no visible pixels may be throttled; keep one pixel.
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
});
