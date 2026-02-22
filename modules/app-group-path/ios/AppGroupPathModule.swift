import ExpoModulesCore

public class AppGroupPathModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupPath")

    Function("getPath") { (groupIdentifier: String) -> String? in
      return FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: groupIdentifier
      )?.path
    }
  }
}
