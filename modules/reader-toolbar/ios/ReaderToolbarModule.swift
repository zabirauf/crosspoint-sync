import ExpoModulesCore
import UIKit

public class ReaderToolbarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReaderToolbar")

    View(ReaderToolbarView.self) {
      Events("onAction", "onNavigationInsetChange")
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
  let onNavigationInsetChange = EventDispatcher()
  private var lastNavigationInset: CGFloat?
  var enabled = true
  var connected = false
  var needsAttention = false
  private weak var screen: UIViewController?
  private var appliedState: [Bool]?
  private var addItem: UIBarButtonItem?
  private var queueItem: UIBarButtonItem?
  private var bottomQueueItem: UIBarButtonItem?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      updateToolbar()
    } else {
      if #available(iOS 26.0, *), let screen, let tabs = screen.tabBarController {
        ReaderBottomBar.attached(to: tabs).deactivate(owner: screen)
      }
      screen?.navigationItem.rightBarButtonItems = nil
      screen = nil
      appliedState = nil
      lastNavigationInset = nil
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
        // Status polling also rerenders React event props. Keep the same items
        // and an open system menu unless their actual content changes.
        if screen === controller, appliedState == state {
          updatePlacement(controller: controller)
          return
        }
        screen = controller
        appliedState = state
        guard enabled else {
          addItem = nil
          queueItem = nil
          bottomQueueItem = nil
          updatePlacement(controller: controller)
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
        let queueAction = UIAction(handler: action("queue"))
        let queueImage = UIImage(systemName: needsAttention ? "exclamationmark.circle" : "list.bullet")
        let queueLabel = needsAttention ? "Uploads need attention" : "View upload queue"
        let queue = UIBarButtonItem(
          title: "Uploads",
          image: queueImage,
          primaryAction: queueAction)
        queue.accessibilityIdentifier = "Library.OpenQueue"
        queue.accessibilityLabel = queueLabel
        if #available(iOS 26.0, *) {
          let button = ReaderBarItemButton(type: .system)
          button.setImage(queueImage, for: .normal)
          button.tintColor = .label
          button.accessibilityIdentifier = "Library.OpenQueue"
          button.accessibilityLabel = queueLabel
          button.addAction(queueAction, for: .touchUpInside)
          button.frame = CGRect(x: 0, y: 0, width: 44, height: 44)
          bottomQueueItem = UIBarButtonItem(customView: button)
        }
        if #available(iOS 27.1, *) {
          for item in [add, queue] { item.axisBehavior = .verticalPreferred }
          add.visibilityPriority = .high
        }
        // UIKit reverses trailing items in the rail. The bottom companion
        // instead presents Add beside navigation and leaves Uploads here.
        addItem = add
        queueItem = queue
        updatePlacement(controller: controller)
        return
      }
      responder = current.next
    }
  }

  private func updatePlacement(controller: UIViewController) {
    if #available(iOS 26.0, *), let tabs = controller.tabBarController {
      ReaderBottomBar.attached(to: tabs).update(
        owner: controller, enabled: enabled, add: addItem, queue: queueItem,
        bottomQueue: bottomQueueItem,
        onBottomInsetChange: { [weak self] bottom in
          guard let self, self.lastNavigationInset != bottom else { return }
          self.lastNavigationInset = bottom
          self.onNavigationInsetChange(["bottom": bottom])
        })
    } else {
      controller.navigationItem.rightBarButtonItems = enabled
        ? [queueItem, addItem].compactMap { $0 } : nil
    }
  }
}
