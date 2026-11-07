const { withAppDelegate, withInfoPlist, withPodfile } = require('expo/config-plugins');

const MARKER = '// CrossPoint scene lifecycle';
const SCENE_DELEGATE = `
${MARKER}
// One scene owns the existing React tree; folding only resizes its window.
class CrossPointSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let window = appDelegate?.window else { return }

    // Expo's dev launcher requires its prepared root/window before the app
    // delegate dispatches didFinishLaunching to subscribers. Adopt that window
    // here, rather than creating a second root or recreating it on a fold.
    window.windowScene = windowScene
    window.frame = windowScene.coordinateSpace.bounds
    self.window = window
    window.makeKeyAndVisible()
    // Expo Linking retains the initial URL for the router even if JS hasn't
    // subscribed yet. Forward both cold-start options and subsequent links.
    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts { forward(context) }
  }

  private func forward(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [
      .openInPlace: context.options.openInPlace
    ]
    options[.sourceApplication] = context.options.sourceApplication
    options[.annotation] = context.options.annotation
    _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  // Expo SDK 54 subscribers still receive application-level lifecycle callbacks.
  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

// Keep this in the existing compiled AppDelegate file so clean Expo prebuilds
// retain the migration without manually maintaining a generated Xcode project.
module.exports = function withSceneLifecycle(config) {
  config = withPodfile(config, (config) => {
    const marker = '# CrossPoint supported deployment floor';
    if (config.modResults.contents.includes(marker)) return config;
    const postInstall = /(    react_native_post_install\([\s\S]*?\n    \))/;
    if (!postInstall.test(config.modResults.contents)) {
      throw new Error('Expo Podfile post_install changed; review the supported deployment floor.');
    }
    // SDK 27 rejects legacy deployment targets in third-party resource bundles.
    // Match this app's existing Expo minimum, without lowering newer pod targets.
    config.modResults.contents = config.modResults.contents.replace(postInstall, `$1
    ${marker}
    minimum = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < minimum
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum.to_s
        end
      end
    end`);
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CrossPointSceneDelegate',
        }],
      },
    };
    return config;
  });

  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle requires the Expo Swift AppDelegate.');
    }
    let source = config.modResults.contents;
    if (source.includes(MARKER)) return config;

    const windowLaunch = 'window = UIWindow(frame: UIScreen.main.bounds)';
    if (!source.includes(windowLaunch)) {
      throw new Error('Expo AppDelegate startup changed; review the scene lifecycle migration.');
    }
    source = source.replace(windowLaunch, 'window = UIWindow()');
    if (!source.includes('import UIKit')) source = 'import UIKit\n' + source;
    config.modResults.contents = source + '\n' + SCENE_DELEGATE;
    return config;
  });
};
