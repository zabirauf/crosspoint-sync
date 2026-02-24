const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Config plugin that adds intent filters to MainActivity for receiving
 * shared EPUB files and text/URLs from other Android apps.
 * Also enables cleartext traffic for local device communication (HTTP/WS).
 */
function withAndroidShareIntent(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const mainApp = manifest.manifest.application?.[0];
    if (!mainApp) return mod;

    // Enable cleartext traffic — required for HTTP (port 80) and WebSocket
    // (port 81) communication with XTEink devices on local network.
    // Without this, Android 9+ silently blocks all non-HTTPS connections
    // in production/release builds.
    mainApp.$["android:usesCleartextTraffic"] = "true";

    const mainActivity = mainApp.activity?.find(
      (a) => a.$?.["android:name"] === ".MainActivity"
    );
    if (!mainActivity) return mod;

    if (!mainActivity["intent-filter"]) {
      mainActivity["intent-filter"] = [];
    }

    const existingFilters = mainActivity["intent-filter"];

    // Check if we already added share intent filters
    const hasShareFilter = existingFilters.some((f) =>
      f.action?.some(
        (a) => a.$?.["android:name"] === "android.intent.action.SEND"
      )
    );
    if (hasShareFilter) return mod;

    // ACTION_SEND for single EPUB files
    existingFilters.push({
      action: [{ $: { "android:name": "android.intent.action.SEND" } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [
        { $: { "android:mimeType": "application/epub+zip" } },
      ],
    });

    // ACTION_SEND_MULTIPLE for multiple EPUB files
    existingFilters.push({
      action: [
        { $: { "android:name": "android.intent.action.SEND_MULTIPLE" } },
      ],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [
        { $: { "android:mimeType": "application/epub+zip" } },
      ],
    });

    // ACTION_SEND for text/URLs (used for article clipping from browsers)
    existingFilters.push({
      action: [{ $: { "android:name": "android.intent.action.SEND" } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [{ $: { "android:mimeType": "text/plain" } }],
    });

    return mod;
  });
}

module.exports = withAndroidShareIntent;
