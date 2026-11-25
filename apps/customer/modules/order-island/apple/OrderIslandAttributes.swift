import ActivityKit
import Foundation

// "Tomorrow's order" in the Dynamic Island.
//
// This file is compiled into THREE places: this pod (which starts the card), the app itself and the
// FooduciaIsland widget extension (which draws it and runs its buttons). plugins/with-order-island.js
// copies it to the last two at prebuild, so this is the only copy to edit. ActivityKit matches the
// three by the type's name, so do not rename it on one side.

@available(iOS 16.2, *)
public struct OrderIslandAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public enum Step: String, Codable, Hashable {
      case ask      // Skip · Confirm order
      case pay      // Cash on delivery · Pay now
      case skipped  // nothing ordered
    }

    public var step: Step
    /// "Tomorrow’s order"
    public var title: String
    /// "Thu, 26 Nov · Morning"
    public var when: String
    /// "12 items"
    public var items: String
    /// Whole rupees, already grouped: "1,240"
    public var rupees: String
    /// The paise after it, as printed: ".00"
    public var paise: String
    /// "Pay ₹1,240" or "Pay from wallet"
    public var payLabel: String
    /// Cash is offered only when the shop allows it for this order.
    public var cashAllowed: Bool
    /// Set when the order is under the shop's minimum: the button then opens the app instead.
    public var shortBy: String?
    /// Ordering closes at this moment.
    public var closesAt: Date
    /// Random, made by the app, replaced each time it is used. A payment link without the current
    /// one only opens the day's screen, so no web page or message can place an order with a link.
    public var token: String

    public init(
      step: Step, title: String, when: String, items: String, rupees: String, paise: String,
      payLabel: String,
      cashAllowed: Bool, shortBy: String?, closesAt: Date,
      token: String
    ) {
      self.step = step
      self.title = title
      self.when = when
      self.items = items
      self.rupees = rupees
      self.paise = paise
      self.payLabel = payLabel
      self.cashAllowed = cashAllowed
      self.shortBy = shortBy
      self.closesAt = closesAt
      self.token = token
    }
  }

  /// The delivery day, YYYY-MM-DD.
  public var date: String

  public init(date: String) { self.date = date }
}

/// Days skipped from the island, waiting for the app to record them. Kept by the app itself: the
/// buttons run in the app's process (LiveActivityIntent), so no shared container is needed.
public enum OrderIslandSkips {
  static let key = "orderIsland.skips"

  public static func add(_ date: String) {
    let all = (UserDefaults.standard.stringArray(forKey: key) ?? []) + [date]
    UserDefaults.standard.set(Array(all.suffix(20)), forKey: key)
  }

  public static func take() -> [String] {
    let all = UserDefaults.standard.stringArray(forKey: key) ?? []
    UserDefaults.standard.removeObject(forKey: key)
    return all
  }
}
