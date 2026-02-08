const { withAppDelegate } = require("expo/config-plugins");

/**
 * Expo config plugin that adds the iOS AppDelegate method required for
 * background URLSession upload completion events.
 *
 * Without this, iOS cannot deliver background upload completion callbacks
 * to react-native-background-upload when the app is suspended.
 */
function withBackgroundUpload(config) {
  return withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;

    // Check if the method already exists (idempotent)
    if (contents.includes("handleEventsForBackgroundURLSession")) {
      return config;
    }

    // Find the @end of the AppDelegate implementation to insert before it
    const endIndex = contents.lastIndexOf("@end");
    if (endIndex === -1) {
      throw new Error(
        "background-upload-plugin: Could not find @end in AppDelegate"
      );
    }

    const methodToInsert = `
- (void)application:(UIApplication *)application
    handleEventsForBackgroundURLSession:(NSString *)identifier
    completionHandler:(void (^)(void))completionHandler
{
  completionHandler();
}

`;

    config.modResults.contents =
      contents.slice(0, endIndex) + methodToInsert + contents.slice(endIndex);

    return config;
  });
}

module.exports = withBackgroundUpload;
