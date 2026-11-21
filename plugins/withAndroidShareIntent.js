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
    const hasFilter = (action, mimeType) =>
      existingFilters.some(
        (f) =>
          f.action?.some((a) => a.$?.["android:name"] === action) &&
          f.data?.some((d) => d.$?.["android:mimeType"] === mimeType)
      );
    const addFilter = (action, mimeType) => {
      if (hasFilter(action, mimeType)) return;
      existingFilters.push({
        action: [{ $: { "android:name": action } }],
        category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
        data: [{ $: { "android:mimeType": mimeType } }],
      });
    };

    const SEND = "android.intent.action.SEND";
    const SEND_MULTIPLE = "android.intent.action.SEND_MULTIPLE";

    // Book files, single and multiple. ACSM files are Adobe fulfillment tokens
    // that the reader's Protected Content plugin turns into books. Android has
    // no built-in .acsm MIME mapping, so most file managers share them as
    // application/octet-stream; android-share-import.ts accepts those by
    // recognized extension only.
    for (const mimeType of [
      "application/epub+zip",
      "application/vnd.adobe.adept+xml",
      "application/octet-stream",
    ]) {
      addFilter(SEND, mimeType);
      addFilter(SEND_MULTIPLE, mimeType);
    }

    // Text/URLs (used for article clipping from browsers)
    addFilter(SEND, "text/plain");

    return mod;
  });
}

module.exports = withAndroidShareIntent;
