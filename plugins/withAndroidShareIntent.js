const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/**
 * Writes network_security_config.xml to android/app/src/main/res/xml/
 * so cleartext HTTP traffic is allowed in all build variants (debug + release).
 */
function withNetworkSecurityConfig(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG
      );
      return mod;
    },
  ]);
}

/**
 * Adds android:networkSecurityConfig and android:usesCleartextTraffic
 * to the <application> element, plus share intent filters on MainActivity.
 */
function withAndroidShareIntent(config) {
  // First: write the network security config XML file
  config = withNetworkSecurityConfig(config);

  // Then: modify the manifest
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const mainApp = manifest.manifest.application?.[0];
    if (!mainApp) return mod;

    // Add network security config + cleartext traffic to <application>
    mainApp.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
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
