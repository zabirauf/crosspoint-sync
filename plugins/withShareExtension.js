const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const APP_GROUP = "group.com.zync.app";
const EXTENSION_NAME = "ZyncShareExtension";
const EXTENSION_BUNDLE_ID = "com.zync.app.ShareExtension";

// ──────────────────────────────────────────────────────
// ShareViewController.swift source
// ──────────────────────────────────────────────────────
const SHARE_VIEW_CONTROLLER = `
import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupID = "${APP_GROUP}"
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground

        label.text = "Preparing…"
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 17, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        handleSharedItems()
    }

    private func handleSharedItems() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            dismiss()
            return
        }

        let validUTIs: [UTType] = [
            UTType("org.idpf.epub-container") ?? .epub,
            .pdf,
        ]

        var pending = 0

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                for uti in validUTIs {
                    if provider.hasItemConformingToTypeIdentifier(uti.identifier) {
                        pending += 1
                        provider.loadFileRepresentation(forTypeIdentifier: uti.identifier) { [weak self] url, error in
                            defer {
                                DispatchQueue.main.async {
                                    pending -= 1
                                    if pending == 0 {
                                        self?.finishAndDismiss()
                                    }
                                }
                            }
                            guard let url = url, error == nil else { return }
                            self?.copyToAppGroup(url: url)
                        }
                        break // only match first conforming UTI per provider
                    }
                }
            }
        }

        if pending == 0 {
            dismiss()
        }
    }

    private func copyToAppGroup(url: URL) {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else { return }

        let sharedDir = container.appendingPathComponent("shared-files", isDirectory: true)
        let manifestDir = container.appendingPathComponent("manifests", isDirectory: true)

        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: manifestDir, withIntermediateDirectories: true)

        let uuid = UUID().uuidString
        let filename = url.lastPathComponent
        let destURL = sharedDir.appendingPathComponent("\\(uuid)-\\(filename)")

        do {
            try FileManager.default.copyItem(at: url, to: destURL)

            let attrs = try FileManager.default.attributesOfItem(atPath: destURL.path)
            let fileSize = (attrs[.size] as? Int) ?? 0

            let manifest: [String: Any] = [
                "fileName": filename,
                "fileUri": destURL.path,
                "fileSize": fileSize,
                "destinationPath": "/",
                "createdAt": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let data = try JSONSerialization.data(withJSONObject: manifest, options: .prettyPrinted)
            let manifestURL = manifestDir.appendingPathComponent("\\(uuid).json")
            try data.write(to: manifestURL)
        } catch {
            // Silently fail — the file just won't appear in the queue
        }
    }

    private func finishAndDismiss() {
        label.text = "Queued for Zync!"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.dismiss()
        }
    }

    private func dismiss() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
`.trim();

// ──────────────────────────────────────────────────────
// Info.plist for the share extension
// ──────────────────────────────────────────────────────
const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Zync Share</string>
    <key>CFBundleDisplayName</key>
    <string>Zync</string>
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
        <string>com.apple.share-services</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsFileWithMaxCount</key>
            <integer>10</integer>
        </dict>
    </dict>
</dict>
</plist>`;

// ──────────────────────────────────────────────────────
// Entitlements for the share extension
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
function withShareExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const iosPath = path.join(mod.modRequest.platformProjectRoot);
      const extPath = path.join(iosPath, EXTENSION_NAME);

      fs.mkdirSync(extPath, { recursive: true });

      fs.writeFileSync(
        path.join(extPath, "ShareViewController.swift"),
        SHARE_VIEW_CONTROLLER
      );
      fs.writeFileSync(path.join(extPath, "Info.plist"), INFO_PLIST);
      fs.writeFileSync(
        path.join(extPath, `${EXTENSION_NAME}.entitlements`),
        ENTITLEMENTS
      );

      return mod;
    },
  ]);
}

// ──────────────────────────────────────────────────────
// 3. Add share extension target to Xcode project
// ──────────────────────────────────────────────────────
function withShareExtensionTarget(config) {
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
      `${EXTENSION_BUNDLE_ID}`
    );

    // Add source file to the target's build phase
    proj.addBuildPhase(
      ["ShareViewController.swift"],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid
    );

    // Add the extension group with files
    const extGroup = proj.addPbxGroup(
      [
        "ShareViewController.swift",
        "Info.plist",
        `${EXTENSION_NAME}.entitlements`,
      ],
      targetName,
      targetName
    );

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

    return mod;
  });
}

// ──────────────────────────────────────────────────────
// Main plugin
// ──────────────────────────────────────────────────────
function withShareExtension(config) {
  config = withAppGroupEntitlement(config);
  config = withShareExtensionFiles(config);
  config = withShareExtensionTarget(config);
  return config;
}

module.exports = withShareExtension;
