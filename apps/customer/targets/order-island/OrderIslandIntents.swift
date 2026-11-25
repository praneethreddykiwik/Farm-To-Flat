import ActivityKit
import AppIntents
import Foundation
import UserNotifications

// The buttons that stay inside the island. Compiled into the app AND the widget extension; because
// they are LiveActivityIntents, iOS runs perform() in the app's own process. Neither places an order
// nor takes money: "Cash on delivery" and "Pay now" are links that open the app.

/// "Confirm order": swap the two buttons for the two ways to pay, in place.
@available(iOS 17.0, *)
struct IslandConfirmIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Confirm tomorrow’s order"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Day") var date: String
  init() {}
  init(date: String) { self.date = date }

  func perform() async throws -> some IntentResult {
    for a in Activity<OrderIslandAttributes>.activities where a.attributes.date == date {
      var s = a.content.state
      s.step = .pay
      await a.update(ActivityContent(state: s, staleDate: s.closesAt, relevanceScore: 100))
    }
    return .result()
  }
}

/// "Skip": remember it for the app, say so, and take the card away.
@available(iOS 17.0, *)
struct IslandSkipIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Skip tomorrow’s order"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Day") var date: String
  init() {}
  init(date: String) { self.date = date }

  func perform() async throws -> some IntentResult {
    let mine = Activity<OrderIslandAttributes>.activities.filter { $0.attributes.date == date }
    if !mine.isEmpty { OrderIslandSkips.add(date) }
    for a in mine {
      var s = a.content.state
      s.step = .skipped
      await a.update(ActivityContent(state: s, staleDate: nil))
    }
    await Self.dropReminder(for: date)
    try? await Task.sleep(nanoseconds: 2_500_000_000)
    for a in mine { await a.end(nil, dismissalPolicy: .immediate) }
    return .result()
  }

  /// The evening "Confirm tomorrow's order?" notification would ask again about a day just skipped.
  static func dropReminder(for date: String) async {
    let center = UNUserNotificationCenter.current()
    let ids = await center.pendingNotificationRequests()
      .filter { r in
        let info = r.content.userInfo
        return info["type"] as? String == "plan-confirm" && info["date"] as? String == date
      }
      .map(\.identifier)
    center.removePendingNotificationRequests(withIdentifiers: ids)
  }
}
