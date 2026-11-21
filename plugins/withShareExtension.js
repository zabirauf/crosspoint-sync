const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const APP_GROUP = "group.com.crosspointsync.app";
const EXTENSION_NAME = "CrossPointSyncShareExtension";
const EXTENSION_BUNDLE_ID = "com.crosspointsync.app.ShareExtension";

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

        let epubUTIs: [UTType] = [
            UTType("org.idpf.epub-container") ?? .epub,
        ]

        var pending = 0
        var queued = 0

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                NSLog("[CrossPointShare] attachment types=%@ suggestedName=%@",
                      provider.registeredTypeIdentifiers.joined(separator: ","),
                      provider.suggestedName ?? "nil")

                // Adobe .acsm fulfillment tokens have no system UTI; match them
                // by name or by the dynamic type the source app registered.
                let epubType = epubUTIs.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) })
                let acsm = epubType == nil && isAcsm(provider)
                guard epubType != nil || acsm else { continue }

                pending += 1
                let complete: (Bool) -> Void = { [weak self] ok in
                    DispatchQueue.main.async {
                        if ok { queued += 1 }
                        pending -= 1
                        if pending == 0 {
                            if queued > 0 {
                                self?.finishAndDismiss()
                            } else {
                                self?.failAndDismiss()
                            }
                        }
                    }
                }

                if let epubType = epubType {
                    provider.loadFileRepresentation(forTypeIdentifier: epubType.identifier) { [weak self] url, error in
                        guard let self = self, let url = url, error == nil else { return complete(false) }
                        complete(self.copyToAppGroup(url: url, filename: url.lastPathComponent, acsm: false))
                    }
                } else {
                    loadAcsm(provider, complete: complete)
                }
            }
        }

        if pending == 0 {
            dismiss()
        }
    }

    private func isAcsm(_ provider: NSItemProvider) -> Bool {
        if provider.suggestedName?.lowercased().hasSuffix(".acsm") == true { return true }
        return provider.registeredTypeIdentifiers.contains { isAcsmType($0) }
    }

    private func isAcsmType(_ identifier: String) -> Bool {
        guard let type = UTType(identifier) else { return false }
        return type.preferredFilenameExtension?.lowercased() == "acsm"
            || type.preferredMIMEType == "application/vnd.adobe.adept+xml"
    }

    /// A representation whose bytes are the token itself. URL types are
    /// excluded: public.file-url conforms to public.data, but loading it
    /// yields an archived URL (named "file URL"), not the file it points to.
    private func acsmContentTypeIdentifier(_ provider: NSItemProvider) -> String? {
        let types = provider.registeredTypeIdentifiers
        if let specific = types.first(where: { isAcsmType($0) }) { return specific }
        return types.first { identifier in
            guard let type = UTType(identifier) else { return false }
            return type.conforms(to: .data) && !type.conforms(to: .url)
        }
    }

    /// Safari downloads (e.g. a Libby "Adobe EPUB" loan) arrive as a file URL.
    /// Resolve it for the original filename and, when no content type is
    /// offered, copy the file it points to.
    private func loadAcsm(_ provider: NSItemProvider, complete: @escaping (Bool) -> Void) {
        let suggestedName = provider.suggestedName
        let contentType = acsmContentTypeIdentifier(provider)

        let loadContent: (URL?) -> Void = { [weak self] fileURL in
            guard let self = self else { return complete(false) }
            let filename = self.acsmFilename(fileURL: fileURL, suggestedName: suggestedName)

            if let contentType = contentType {
                provider.loadFileRepresentation(forTypeIdentifier: contentType) { url, error in
                    if let url = url, error == nil {
                        complete(self.copyToAppGroup(url: url, filename: filename, acsm: true))
                    } else if let fileURL = fileURL {
                        complete(self.copyToAppGroup(url: fileURL, filename: filename, acsm: true))
                    } else {
                        complete(false)
                    }
                }
            } else if let fileURL = fileURL {
                complete(self.copyToAppGroup(url: fileURL, filename: filename, acsm: true))
            } else {
                complete(false)
            }
        }

        guard provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) else {
            return loadContent(nil)
        }
        provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
            var fileURL: URL?
            if let url = item as? URL {
                fileURL = url
            } else if let data = item as? Data {
                fileURL = URL(dataRepresentation: data, relativeTo: nil)
            }
            loadContent(fileURL?.isFileURL == true ? fileURL : nil)
        }
    }

    private func acsmFilename(fileURL: URL?, suggestedName: String?) -> String {
        let candidates = [fileURL?.lastPathComponent, suggestedName]
        let base = candidates.compactMap { $0 }.first { !$0.isEmpty } ?? "Protected Content"
        return base.lowercased().hasSuffix(".acsm") ? base : base + ".acsm"
    }

    /// ACSM tokens are XML. Anything else (an archived URL, an HTML error
    /// page) would only fail later on the reader with a parser error.
    private func looksLikeXml(_ url: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        let head = handle.readData(ofLength: 64)
        var bytes = Array(head)
        if bytes.starts(with: [0xEF, 0xBB, 0xBF]) { bytes.removeFirst(3) }
        let firstSignificant = bytes.first { ![0x20, 0x09, 0x0A, 0x0D].contains($0) }
        return firstSignificant == UInt8(ascii: "<")
    }

    @discardableResult
    private func copyToAppGroup(url: URL, filename: String, acsm: Bool) -> Bool {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        if acsm && !looksLikeXml(url) {
            NSLog("[CrossPointShare] rejected non-XML ACSM content from %@", url.lastPathComponent)
            return false
        }
        return writeToAppGroup(url: url, filename: filename)
    }

    private func writeToAppGroup(url: URL, filename: String) -> Bool {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else { return false }

        let sharedDir = container.appendingPathComponent("shared-files", isDirectory: true)
        let manifestDir = container.appendingPathComponent("manifests", isDirectory: true)

        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: manifestDir, withIntermediateDirectories: true)

        let uuid = UUID().uuidString
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
            return true
        } catch {
            NSLog("[CrossPointShare] could not queue %@: %@", filename, error.localizedDescription)
            return false
        }
    }

    private func failAndDismiss() {
        label.text = "Couldn’t read this file"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.dismiss()
        }
    }

    private func finishAndDismiss() {
        label.text = "Queued for CrossPoint!"
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
    <string>CrossPoint Share</string>
    <key>CFBundleDisplayName</key>
    <string>CrossPoint Sync</string>
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
        <key>NSExtensionAttributes</key>
        <dict>
            <key>NSExtensionActivationRule</key>
            <dict>
                <key>NSExtensionActivationSupportsFileWithMaxCount</key>
                <integer>10</integer>
            </dict>
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
      fs.writeFileSync(
        path.join(extPath, "Info.plist"),
        INFO_PLIST.replace("<string>1.0.0</string>", `<string>${mod.version || "1.0.0"}</string>`)
          .replace("<string>1</string>", `<string>${mod.ios?.buildNumber || "1"}</string>`)
      );
      fs.writeFileSync(
        path.join(extPath, `${EXTENSION_NAME}.entitlements`),
        ENTITLEMENTS
      );

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
// 3. Add share extension target to Xcode project
// ──────────────────────────────────────────────────────
function withShareExtensionTarget(config) {
  return withXcodeProject(config, (mod) => {
    const proj = mod.modResults;
    const targetName = EXTENSION_NAME;

    // Check if target already exists
    const existingTarget = proj.pbxTargetByName(targetName) ||
      proj.pbxTargetByName(`"${targetName}"`);
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
      [`${targetName}/ShareViewController.swift`],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid
    );

    // Add the extension group with files
    const extGroup = proj.addPbxGroup(
      [
        `${targetName}/ShareViewController.swift`,
        `${targetName}/Info.plist`,
        `${targetName}/${EXTENSION_NAME}.entitlements`,
      ],
      targetName,
      '""'
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

    // Add extension target to Xcode scheme
    addExtensionToScheme(mod.modRequest.platformProjectRoot, target.uuid, targetName);

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
