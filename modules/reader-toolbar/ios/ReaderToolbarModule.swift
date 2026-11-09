import ExpoModulesCore
import UIKit

public class ReaderToolbarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReaderToolbar")

    View(ReaderToolbarView.self) {
      Events("onAction")
      Prop("enabled") { (view: ReaderToolbarView, enabled: Bool) in
        view.enabled = enabled
      }
      Prop("connected") { (view: ReaderToolbarView, connected: Bool) in
        view.connected = connected
      }
      Prop("needsAttention") { (view: ReaderToolbarView, needsAttention: Bool) in
        view.needsAttention = needsAttention
      }
      OnViewDidUpdateProps { (view: ReaderToolbarView) in
        view.updateToolbar()
        view.setNeedsLayout()
      }
    }
  }
}

// The view only locates its owning screen. UIKit owns the bars, placement,
// safe areas and overflow; the React screen and its drafts stay mounted.
class ReaderToolbarView: ExpoView {
  let onAction = EventDispatcher()
  var enabled = true
  var connected = false
  var needsAttention = false
  private weak var screen: UIViewController?
  private var appliedState: [Bool]?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      updateToolbar()
    } else {
      screen?.navigationItem.rightBarButtonItems = nil
      screen = nil
      appliedState = nil
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if window != nil { updateToolbar() }
  }

  func updateToolbar() {
    guard window != nil else { return }
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController,
        let navigation = controller.navigationController
      {
        for item in controller.tabBarController?.tabBar.items ?? [] {
          if item.title == "Library" { item.accessibilityIdentifier = "TabBar.Library" }
          if item.title == "Reader" {
            item.accessibilityIdentifier = "TabBar.Reader"
            item.accessibilityValue = connected ? "Connected" : "Not connected"
          }
          if item.title == "Settings" { item.accessibilityIdentifier = "TabBar.Settings" }
        }
        let state = [enabled, connected, needsAttention]
        let hasActions =
          controller.navigationItem.rightBarButtonItems?.contains(where: {
            $0.accessibilityIdentifier == "Library.FAB"
          }) == true
        // Status polling also rerenders React event props. Keep the same items
        // and an open system menu unless their actual content changes.
        if screen === controller, appliedState == state, hasActions == enabled { return }
        screen = controller
        appliedState = state
        guard enabled else {
          controller.navigationItem.rightBarButtonItems = nil
          return
        }
        navigation.navigationBar.accessibilityIdentifier = "Library.NativeToolbar"
        let action: (String) -> UIActionHandler = { [weak self] name in
          { _ in self?.onAction(["action": name]) }
        }
        var additions = [
          UIAction(
            title: "Upload Files", image: UIImage(systemName: "doc.badge.plus"),
            identifier: UIAction.Identifier("FAB.UploadBook"), handler: action("upload"))
        ]
        if connected {
          additions.append(
            UIAction(
              title: "New Folder", image: UIImage(systemName: "folder.badge.plus"),
              identifier: UIAction.Identifier("FAB.NewFolder"), handler: action("folder")))
        }
        additions.append(
          UIAction(
            title: "Sleep Background", image: UIImage(systemName: "moon"),
            identifier: UIAction.Identifier("FAB.SleepBackground"), handler: action("sleep")))
        let add = UIBarButtonItem(
          title: "Add", image: UIImage(systemName: "plus"), primaryAction: nil,
          menu: UIMenu(children: additions))
        add.accessibilityIdentifier = "Library.FAB"
        add.accessibilityLabel = "Add files or create a sleep background"
        let queue = UIBarButtonItem(
          title: "Uploads",
          image: UIImage(systemName: needsAttention ? "exclamationmark.circle" : "list.bullet"),
          primaryAction: UIAction(handler: action("queue")))
        queue.accessibilityIdentifier = "Library.OpenQueue"
        queue.accessibilityLabel = needsAttention ? "Uploads need attention" : "View upload queue"
        if #available(iOS 27.1, *) {
          for item in [add, queue] { item.axisBehavior = .verticalPreferred }
          add.visibilityPriority = .high
        }
        // Native tabs wrap each navigation controller in a screen controller.
        // Navigation items share the system rail with that tab bar; a nested
        // bottom toolbar would compete with the tab bar's vertical placement.
        // UIKit displays trailing items in reverse visual order in both bars.
        controller.navigationItem.rightBarButtonItems = [queue, add]
        return
      }
      responder = current.next
    }
  }
}
