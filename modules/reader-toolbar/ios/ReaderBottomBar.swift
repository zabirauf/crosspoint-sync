import ObjectiveC
import UIKit

@available(iOS 26.0, *)
final class ReaderBarItemButton: UIButton {
  var onDetached: (() -> Void)?
  private var wasInWindow = false

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let detached = wasInWindow && window == nil
    wasInWindow = window != nil
    if detached { onDetached?() }
  }
}

@available(iOS 26.0, *)
private final class ReaderTintObserver: UIView {
  var onTintChange: (() -> Void)?
  override func tintColorDidChange() {
    super.tintColorDidChange()
    onTintChange?()
  }
}

// A separate UIKit tab bar gives the primary action its own space. The original
// controller still owns selection, screen lifetime, safe areas and bar placement.
@available(iOS 26.0, *)
final class ReaderBottomBar: UIView, UITabBarDelegate {
  private static var associationKey: UInt8 = 0

  static func attached(to controller: UITabBarController) -> ReaderBottomBar {
    if let bar = objc_getAssociatedObject(controller, &associationKey) as? ReaderBottomBar {
      return bar
    }
    let bar = ReaderBottomBar(controller: controller)
    objc_setAssociatedObject(controller, &associationKey, bar, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    controller.view.addSubview(bar)
    return bar
  }

  private weak var controller: UITabBarController?
  private weak var owner: UIViewController?
  private var actionsEnabled = false
  private var addItem: UIBarButtonItem?
  private var queueItem: UIBarButtonItem?
  private var bottomQueueItem: UIBarButtonItem?
  private let tintObserver = ReaderTintObserver()
  private let navigationBar = UITabBar()
  private let addButton = UIButton(configuration: .prominentGlass())
  private var deferredLayout = false
  private var sourceImages: [UIImage?] = []
  private var originalAlpha: CGFloat = 1
  private var originalInteraction = true
  private var originalAccessibilityHidden = false
  private var originalMinimizeBehavior: UITabBarController.MinimizeBehavior = .automatic

  private init(controller: UITabBarController) {
    self.controller = controller
    originalAlpha = controller.tabBar.alpha
    originalInteraction = controller.tabBar.isUserInteractionEnabled
    originalAccessibilityHidden = controller.tabBar.accessibilityElementsHidden
    originalMinimizeBehavior = controller.tabBarMinimizeBehavior
    super.init(frame: controller.view.bounds)
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    navigationBar.delegate = self
    navigationBar.accessibilityIdentifier = "Reader.BottomNavigation"
    addSubview(navigationBar)
    addButton.configuration?.image = UIImage(
      systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 23, weight: .medium))
    addButton.configuration?.cornerStyle = .capsule
    addButton.configuration?.indicator = .none
    addButton.tintColor = .systemBlue
    addButton.showsMenuAsPrimaryAction = true
    addButton.preferredMenuElementOrder = .fixed
    addButton.accessibilityIdentifier = "Library.FAB"
    addButton.accessibilityLabel = "Add files or create a sleep background"
    addSubview(addButton)
    // React Navigation can update the source bar's tint after the system's
    // appearance notification. Observe UIKit's actual inherited tint change.
    tintObserver.isUserInteractionEnabled = false
    tintObserver.accessibilityElementsHidden = true
    tintObserver.onTintChange = { [weak self] in self?.setNeedsLayout() }
    controller.tabBar.addSubview(tintObserver)
    registerForTraitChanges([
      UITraitUserInterfaceStyle.self, UITraitLayoutDirection.self,
      UITraitPreferredContentSizeCategory.self,
    ]) { (view: ReaderBottomBar, _) in view.setNeedsLayout() }
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  func update(
    owner: UIViewController, enabled: Bool, add: UIBarButtonItem?,
    queue: UIBarButtonItem?, bottomQueue: UIBarButtonItem?
  ) {
    self.owner = owner
    actionsEnabled = enabled
    addItem = add
    queueItem = queue
    bottomQueueItem = bottomQueue
    if let button = bottomQueue?.customView as? ReaderBarItemButton {
      button.onDetached = { [weak self, weak owner] in
        // A header configuration update can remove our native item without
        // changing the React content view. Restore it after that update.
        DispatchQueue.main.async { [weak self, weak owner] in
          guard let self, let owner, self.owner === owner, self.isSelected(owner) else { return }
          self.setNeedsLayout()
        }
      }
    }
    if addButton.menu !== add?.menu { addButton.menu = add?.menu }
    setNeedsLayout()
    updatePlacement()
  }

  func deactivate(owner: UIViewController) {
    guard self.owner === owner else { return }
    actionsEnabled = false
    addButton.isHidden = true
  }

  // Empty space between the native controls must not intercept app content.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    updatePlacement()
    // UIKit may finish moving its own bar after this sibling's layout pass.
    guard !deferredLayout else { return }
    deferredLayout = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.deferredLayout = false
      self.updatePlacement()
    }
  }

  private func updatePlacement() {
    guard let controller, let window, !controller.tabBar.bounds.isEmpty else { return }
    let original = controller.tabBar
    if tintObserver.superview !== original { original.addSubview(tintObserver) }
    let barFrame = original.convert(original.bounds, to: self)
    // Observe the actual system bar, not a phone model or window breakpoint.
    let atBottom = barFrame.width > barFrame.height && barFrame.midY > bounds.midY
    navigationBar.isHidden = !atBottom
    addButton.isHidden = !atBottom || !actionsEnabled
    if atBottom {
      // Leave the controller's bar in layout so its native safe-area and Duo
      // placement decisions remain active. Only its presentation is replaced.
      original.alpha = 0
      original.isUserInteractionEnabled = false
      original.accessibilityElementsHidden = true
      controller.tabBarMinimizeBehavior = .never
      updateNavigationItems(from: original)
      navigationBar.tintColor = original.tintColor
      navigationBar.unselectedItemTintColor = original.unselectedItemTintColor
      let safe = window.safeAreaInsets
      let available = barFrame.inset(by: UIEdgeInsets(top: 0, left: safe.left, bottom: 0, right: safe.right))
      let rowWidth = min(420, available.width)
      let rowX = available.midX - rowWidth / 2
      let side: CGFloat = traitCollection.verticalSizeClass == .compact ? 44 : 54
      let actionWidth = side + 18
      let rtl = effectiveUserInterfaceLayoutDirection == .rightToLeft
      navigationBar.frame = CGRect(
        x: rowX + (rtl ? actionWidth : 0), y: barFrame.minY,
        width: rowWidth - actionWidth, height: barFrame.height)
      navigationBar.layoutIfNeeded()
      // Align with UIKit's rendered control row, including its compact-height
      // layout. Inspect public UIControl geometry, without private class names.
      let rowCenter = selectedControl(in: navigationBar).map {
        $0.convert($0.bounds, to: self).midY
      }
      let fallbackY = min(barFrame.maxY, bounds.maxY - max(8, safe.bottom - 8)) - side
      addButton.frame = CGRect(
        x: rtl ? rowX + 16 : rowX + rowWidth - 16 - side,
        y: rowCenter.map { $0 - side / 2 } ?? fallbackY,
        width: side, height: side)
      superview?.bringSubviewToFront(self)
    } else {
      original.alpha = originalAlpha
      original.isUserInteractionEnabled = originalInteraction
      original.accessibilityElementsHidden = originalAccessibilityHidden
      controller.tabBarMinimizeBehavior = originalMinimizeBehavior
    }
    guard let owner else { return }
    let items: [UIBarButtonItem] = actionsEnabled
      ? (atBottom ? [bottomQueueItem].compactMap { $0 } : [queueItem, addItem].compactMap { $0 })
      : []
    let current = owner.navigationItem.rightBarButtonItems ?? []
    if current.count != items.count || zip(current, items).contains(where: { $0 !== $1 }) {
      owner.navigationItem.rightBarButtonItems = items.isEmpty ? nil : items
    }
  }

  private func selectedControl(in view: UIView) -> UIControl? {
    for child in view.subviews where !child.isHidden && child.alpha > 0 {
      if let control = child as? UIControl, control.isSelected, !control.bounds.isEmpty { return control }
      if let control = selectedControl(in: child) { return control }
    }
    return nil
  }

  private func isSelected(_ owner: UIViewController) -> Bool {
    guard let selected = controller?.selectedViewController, owner.viewIfLoaded?.window != nil else { return false }
    var current: UIViewController? = owner
    while let candidate = current {
      if candidate === selected { return true }
      current = candidate.parent
    }
    return false
  }

  private func updateNavigationItems(from original: UITabBar) {
    guard let controller, let source = original.items, !source.isEmpty else { return }
    let images = source.map(\.image)
    let changed = images.count != sourceImages.count || zip(images, sourceImages).contains { $0 !== $1 }
    if navigationBar.items?.count != source.count || changed {
      sourceImages = images
      navigationBar.items = source.enumerated().map { index, item in
        let fallback: UIImage?
        switch item.accessibilityIdentifier {
        case "TabBar.Library": fallback = UIImage(systemName: "books.vertical")
        case "TabBar.Reader": fallback = UIImage(named: "reader")?.withRenderingMode(.alwaysTemplate)
        default: fallback = UIImage(systemName: "gearshape")
        }
        let selected = item.selectedImage ?? (item.accessibilityIdentifier == "TabBar.Library"
          ? UIImage(systemName: "books.vertical.fill") : item.image ?? fallback)
        let copy = UITabBarItem(title: item.title, image: item.image ?? fallback, selectedImage: selected)
        copy.tag = index
        copy.accessibilityIdentifier = item.accessibilityIdentifier
        return copy
      }
    }
    for (source, target) in zip(source, navigationBar.items ?? []) {
      // The compact standalone bar centers its images. Keep that row icon-only
      // so UIKit does not lay a title over the image in short landscape windows.
      target.title = traitCollection.verticalSizeClass == .compact ? nil : source.title
      target.accessibilityLabel = source.accessibilityLabel ?? source.title
      target.accessibilityValue = source.accessibilityValue
    }
    if let items = navigationBar.items, items.indices.contains(controller.selectedIndex) {
      navigationBar.selectedItem = items[controller.selectedIndex]
    }
  }

  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    guard let controller, let screens = controller.viewControllers, screens.indices.contains(item.tag) else { return }
    let selected = screens[item.tag]
    // Preserve the router's normal selection/reselection handling, including
    // JS-controlled selection and the native tab's existing screen state.
    let allowed = controller.delegate?.tabBarController?(controller, shouldSelect: selected) ?? true
    if allowed {
      controller.selectedViewController = selected
      controller.delegate?.tabBarController?(controller, didSelect: selected)
    }
    updatePlacement()
  }
}
