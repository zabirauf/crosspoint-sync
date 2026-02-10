const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const APP_GROUP = "group.com.crosspointsync.app";
const EXTENSION_NAME = "CrossPointSyncWebExtension";
const EXTENSION_BUNDLE_ID = "com.crosspointsync.app.WebExtension";

// ──────────────────────────────────────────────────────
// SafariWebExtensionHandler.swift source
// ──────────────────────────────────────────────────────
const SAFARI_HANDLER = `
import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let appGroupID = "${APP_GROUP}"
    private let logger = Logger(subsystem: "${EXTENSION_BUNDLE_ID}", category: "handler")

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]

        let action = message["action"] as? String ?? ""
        logger.info("Received action: \\(action)")

        switch action {
        case "clip":
            handleClip(message: message, context: context)
        case "ping":
            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: ["status": "ok"]]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        default:
            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: ["error": "Unknown action"]]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        }
    }

    private func handleClip(message: [String: Any], context: NSExtensionContext) {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            sendError("App Group container not available", context: context)
            return
        }

        guard let title = message["title"] as? String,
              let html = message["html"] as? String else {
            sendError("Missing required fields", context: context)
            return
        }

        let author = message["author"] as? String ?? ""
        let sourceUrl = message["sourceUrl"] as? String ?? ""
        let images = message["images"] as? [[String: Any]] ?? []

        let uuid = UUID().uuidString

        // Create directories
        let manifestsDir = container.appendingPathComponent("manifests", isDirectory: true)
        let clipsDir = container.appendingPathComponent("shared-clips", isDirectory: true)
        let imageDir = clipsDir.appendingPathComponent(uuid, isDirectory: true)

        try? FileManager.default.createDirectory(at: manifestsDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: imageDir, withIntermediateDirectories: true)

        do {
            // Write HTML file
            let htmlPath = "shared-clips/\\(uuid).html"
            let htmlURL = container.appendingPathComponent(htmlPath)
            try html.write(to: htmlURL, atomically: true, encoding: .utf8)

            // Write images
            var imageManifest: [[String: String]] = []
            for (index, imgData) in images.enumerated() {
                guard let base64 = imgData["base64"] as? String,
                      let originalUrl = imgData["originalUrl"] as? String,
                      let mimeType = imgData["mimeType"] as? String,
                      let data = Data(base64Encoded: base64) else {
                    continue
                }

                let ext = Self.extensionForMime(mimeType)
                let filename = "img-\\(index)\\(ext)"
                let localPath = "shared-clips/\\(uuid)/\\(filename)"
                let fileURL = container.appendingPathComponent(localPath)

                try data.write(to: fileURL)

                imageManifest.append([
                    "originalUrl": originalUrl,
                    "localPath": localPath,
                    "mimeType": mimeType,
                ])
            }

            // Write manifest
            let manifest: [String: Any] = [
                "id": uuid,
                "type": "clip",
                "title": title,
                "author": author,
                "sourceUrl": sourceUrl,
                "htmlPath": htmlPath,
                "images": imageManifest,
                "clippedAt": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: .prettyPrinted)
            let manifestURL = manifestsDir.appendingPathComponent("clip-\\(uuid).json")
            try manifestData.write(to: manifestURL)

            logger.info("Clip saved: \\(title)")

            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: ["status": "ok", "id": uuid]]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        } catch {
            logger.error("Failed to save clip: \\(error.localizedDescription)")
            sendError(error.localizedDescription, context: context)
        }
    }

    private func sendError(_ message: String, context: NSExtensionContext) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["error": message]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private static func extensionForMime(_ mime: String) -> String {
        switch mime {
        case "image/jpeg": return ".jpg"
        case "image/png": return ".png"
        case "image/gif": return ".gif"
        case "image/webp": return ".webp"
        case "image/svg+xml": return ".svg"
        case "image/avif": return ".avif"
        default: return ".bin"
        }
    }
}
`.trim();

// ──────────────────────────────────────────────────────
// Info.plist for the web extension
// ──────────────────────────────────────────────────────
const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>CrossPoint Web Clipper</string>
    <key>CFBundleDisplayName</key>
    <string>CrossPoint Web Clipper</string>
    <key>CFBundleIdentifier</key>
    <string>${EXTENSION_BUNDLE_ID}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleExecutable</key>
    <string>${EXTENSION_NAME}</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.Safari.web-extension</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).SafariWebExtensionHandler</string>
    </dict>
</dict>
</plist>`;

// ──────────────────────────────────────────────────────
// Entitlements for the web extension
// ──────────────────────────────────────────────────────
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>`;

// ──────────────────────────────────────────────────────
// 1. Add App Groups entitlement to main app
// ──────────────────────────────────────────────────────
function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes(APP_GROUP)) {
      groups.push(APP_GROUP);
    }
    mod.modResults["com.apple.security.application-groups"] = groups;
    return mod;
  });
}

// ──────────────────────────────────────────────────────
// 2. Write extension source files to ios/ directory
// ──────────────────────────────────────────────────────
function withWebExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const iosPath = mod.modRequest.platformProjectRoot;
      const extPath = path.join(iosPath, EXTENSION_NAME);
      const resourcesPath = path.join(extPath, "Resources");

      fs.mkdirSync(resourcesPath, { recursive: true });

      // Write Swift handler
      fs.writeFileSync(
        path.join(extPath, "SafariWebExtensionHandler.swift"),
        SAFARI_HANDLER
      );
      fs.writeFileSync(path.join(extPath, "Info.plist"), INFO_PLIST);
      fs.writeFileSync(
        path.join(extPath, `${EXTENSION_NAME}.entitlements`),
        ENTITLEMENTS
      );

      // Bundle content.js with esbuild (bundles defuddle + dompurify into single IIFE)
      const projectRoot = path.resolve(iosPath, "..");
      const extensionSrc = path.join(projectRoot, "extension-src");

      try {
        execSync(
          `npx esbuild "${path.join(extensionSrc, "content.js")}" --bundle --format=iife --global-name=__crossPointSyncContent --outfile="${path.join(resourcesPath, "content.js")}" --minify --target=safari16`,
          { cwd: projectRoot, stdio: "pipe" }
        );
      } catch (err) {
        console.error("[withWebExtension] Failed to bundle content.js:", err.stderr?.toString());
        throw err;
      }

      // Copy background.js (no bundling needed — no npm dependencies)
      fs.copyFileSync(
        path.join(extensionSrc, "background.js"),
        path.join(resourcesPath, "background.js")
      );

      // Copy popup files
      fs.copyFileSync(
        path.join(extensionSrc, "popup.html"),
        path.join(resourcesPath, "popup.html")
      );
      fs.copyFileSync(
        path.join(extensionSrc, "popup.js"),
        path.join(resourcesPath, "popup.js")
      );
      fs.copyFileSync(
        path.join(extensionSrc, "popup.css"),
        path.join(resourcesPath, "popup.css")
      );

      // Copy manifest.json
      fs.copyFileSync(
        path.join(extensionSrc, "manifest.json"),
        path.join(resourcesPath, "manifest.json")
      );

      // Copy icon images directly into Resources (no images/ subdirectory)
      const srcImages = path.join(extensionSrc, "images");
      for (const file of fs.readdirSync(srcImages)) {
        fs.copyFileSync(
          path.join(srcImages, file),
          path.join(resourcesPath, file)
        );
      }

      return mod;
    },
  ]);
}

// ──────────────────────────────────────────────────────
// Helper: Add extension target to Xcode scheme
// ──────────────────────────────────────────────────────
function addExtensionToScheme(iosPath, targetUuid, targetName) {
  const xcodeprojName = fs.readdirSync(iosPath).find((f) => f.endsWith(".xcodeproj"));
  if (!xcodeprojName) return;
  const projectName = xcodeprojName.replace(".xcodeproj", "");
  const schemePath = path.join(iosPath, xcodeprojName, "xcshareddata", "xcschemes", `${projectName}.xcscheme`);
  if (!fs.existsSync(schemePath)) return;

  let scheme = fs.readFileSync(schemePath, "utf8");
  if (scheme.includes(targetUuid)) return; // already present

  const entry = `      <BuildActionEntry
         buildForTesting = "YES"
         buildForRunning = "YES"
         buildForProfiling = "YES"
         buildForArchiving = "YES"
         buildForAnalyzing = "YES">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${targetUuid}"
            BuildableName = "${targetName}.appex"
            BlueprintName = "${targetName}"
            ReferencedContainer = "container:${xcodeprojName}">
         </BuildableReference>
      </BuildActionEntry>`;
  scheme = scheme.replace("</BuildActionEntries>", entry + "\n      </BuildActionEntries>");
  fs.writeFileSync(schemePath, scheme, "utf8");
}

// ──────────────────────────────────────────────────────
// 3. Add web extension target to Xcode project
// ──────────────────────────────────────────────────────
function withWebExtensionTarget(config) {
  return withXcodeProject(config, (mod) => {
    const proj = mod.modResults;
    const targetName = EXTENSION_NAME;

    // Check if target already exists
    const existingTarget = proj.pbxTargetByName(targetName);
    if (existingTarget) {
      return mod;
    }

    // Ensure these sections exist so addTarget can create proper dependencies
    // (the xcode npm package's addTargetDependency silently skips if these are missing)
    if (!proj.hash.project.objects['PBXTargetDependency']) {
      proj.hash.project.objects['PBXTargetDependency'] = {};
    }
    if (!proj.hash.project.objects['PBXContainerItemProxy']) {
      proj.hash.project.objects['PBXContainerItemProxy'] = {};
    }

    // Add the extension target
    const target = proj.addTarget(
      targetName,
      "app_extension",
      targetName,
      EXTENSION_BUNDLE_ID
    );

    // Add source file to the target's build phase
    proj.addBuildPhase(
      ["SafariWebExtensionHandler.swift"],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid
    );

    // Add Resources build phase for the extension's web resources
    proj.addBuildPhase(
      [
        "manifest.json",
        "content.js",
        "background.js",
        "popup.html",
        "popup.js",
        "popup.css",
        "icon-48.png",
        "icon-96.png",
        "icon-128.png",
      ],
      "PBXResourcesBuildPhase",
      "Resources",
      target.uuid
    );

    // Add the extension group with files
    const extGroup = proj.addPbxGroup(
      [
        "SafariWebExtensionHandler.swift",
        "Info.plist",
        `${EXTENSION_NAME}.entitlements`,
      ],
      targetName,
      targetName
    );

    // Add Resources subgroup (path is relative to parent extGroup which has path "CrossPointSyncWebExtension")
    const resourcesGroup = proj.addPbxGroup(
      [
        "manifest.json",
        "content.js",
        "background.js",
        "popup.html",
        "popup.js",
        "popup.css",
        "icon-48.png",
        "icon-96.png",
        "icon-128.png",
      ],
      "Resources",
      "Resources"
    );

    // Wire up group hierarchy
    proj.addToPbxGroup(resourcesGroup.uuid, extGroup.uuid);

    // Add extension group to main project group
    const mainGroupId = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(extGroup.uuid, mainGroupId);

    // Set build settings for the extension target
    const configurations = proj.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const config = configurations[key];
      if (
        typeof config === "object" &&
        config.buildSettings &&
        config.name &&
        config.buildSettings.PRODUCT_NAME === `"${targetName}"`
      ) {
        config.buildSettings.SWIFT_VERSION = "5.0";
        config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
        config.buildSettings.INFOPLIST_FILE = `${targetName}/Info.plist`;
        config.buildSettings.TARGETED_DEVICE_FAMILY = `"1,2"`;
        config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${EXTENSION_BUNDLE_ID}"`;
        config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "16.0";
        config.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
        config.buildSettings.CURRENT_PROJECT_VERSION = "1";
        config.buildSettings.MARKETING_VERSION = "1.0.0";
        config.buildSettings.SWIFT_EMIT_LOC_STRINGS = "YES";
        config.buildSettings.CLANG_ANALYZER_NONNULL = "YES";
        config.buildSettings.CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION =
          "YES_AGGRESSIVE";
        config.buildSettings.CLANG_CXX_LANGUAGE_STANDARD = `"gnu++20"`;
        config.buildSettings.CLANG_WARN_DOCUMENTATION_COMMENTS = "YES";
        config.buildSettings.CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER =
          "YES";
        config.buildSettings.CLANG_WARN_UNGUARDED_AVAILABILITY = "YES_AGGRESSIVE";
        config.buildSettings.CODE_SIGN_STYLE = "Automatic";
        config.buildSettings.COPY_PHASE_STRIP = "NO";
        config.buildSettings.MTL_FAST_MATH = "YES";
        config.buildSettings.SKIP_INSTALL = "YES";

        // Set development team from main target if available
        const mainConfigs = proj.pbxXCBuildConfigurationSection();
        for (const mk in mainConfigs) {
          const mc = mainConfigs[mk];
          if (
            typeof mc === "object" &&
            mc.buildSettings &&
            mc.buildSettings.DEVELOPMENT_TEAM
          ) {
            config.buildSettings.DEVELOPMENT_TEAM =
              mc.buildSettings.DEVELOPMENT_TEAM;
            break;
          }
        }
      }
    }

    // Set ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES on main target
    const mainTarget = proj.getFirstTarget();
    const mainNativeTarget = proj.pbxNativeTargetSection()[mainTarget.uuid];
    const mainConfigListUuid = mainNativeTarget.buildConfigurationList;
    const configListSection = proj.hash.project.objects['XCConfigurationList'];
    const mainConfigList = configListSection[mainConfigListUuid];
    if (mainConfigList && mainConfigList.buildConfigurations) {
      const allConfigs = proj.pbxXCBuildConfigurationSection();
      for (const ref of mainConfigList.buildConfigurations) {
        const cfg = allConfigs[ref.value];
        if (cfg && cfg.buildSettings) {
          cfg.buildSettings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "YES";
        }
      }
    }

    // Add extension target to Xcode scheme
    addExtensionToScheme(mod.modRequest.platformProjectRoot, target.uuid, targetName);

    return mod;
  });
}

// ──────────────────────────────────────────────────────
// Main plugin
// ──────────────────────────────────────────────────────
function withWebExtension(config) {
  config = withAppGroupEntitlement(config);
  config = withWebExtensionFiles(config);
  config = withWebExtensionTarget(config);
  return config;
}

module.exports = withWebExtension;
