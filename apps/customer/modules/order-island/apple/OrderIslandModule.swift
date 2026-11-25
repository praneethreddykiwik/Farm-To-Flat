import ActivityKit
import ExpoModulesCore
import UIKit

/// JS side of the "tomorrow's order" Live Activity (src/lib/orderIslandNative.js).
public class OrderIslandModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrderIsland")

    /// iOS 17 and later (buttons in a Live Activity), and switched on in Settings.
    Function("isSupported") { () -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// iOS 26 can hold a card and show it at a set time without the app being open.
    Function("canSchedule") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    AsyncFunction("list") { () -> [[String: Any]] in
      guard #available(iOS 17.0, *) else { return [] }
      return Activity<OrderIslandAttributes>.activities
        .filter { $0.activityState != .ended && $0.activityState != .dismissed }
        .map {
          [
            "id": $0.id, "date": $0.attributes.date, "token": $0.content.state.token,
            "step": $0.content.state.step.rawValue, "state": String(describing: $0.activityState),
          ]
        }
    }

    /// Show the card now, or (iOS 26+) at `startAtMs`. Replaces any earlier card.
    AsyncFunction("start") { (card: CardRecord, startAtMs: Double?) async throws -> String? in
      guard #available(iOS 17.0, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
        return nil
      }
      await Self.endAll()
      let attributes = OrderIslandAttributes(date: card.date)
      let state = card.state(step: .ask)
      let content = ActivityContent(state: state, staleDate: state.closesAt, relevanceScore: 100)
      if let startAtMs {
        guard #available(iOS 26.0, *) else { return nil }
        return try Activity.request(
          attributes: attributes, content: content, pushType: nil, style: .standard,
          alertConfiguration: Self.alert(for: state),
          start: Date(timeIntervalSince1970: startAtMs / 1000)
        ).id
      }
      return try Activity.request(attributes: attributes, content: content, pushType: nil).id
    }

    /// New figures on the card that is already up. Keeps the step the customer is on.
    AsyncFunction("update") { (card: CardRecord) async in
      guard #available(iOS 17.0, *) else { return }
      for a in Activity<OrderIslandAttributes>.activities where a.attributes.date == card.date {
        let step = a.content.state.step
        guard step != .skipped else { continue }
        let state = card.state(step: step)
        guard state != a.content.state else { continue }
        await a.update(ActivityContent(state: state, staleDate: state.closesAt, relevanceScore: 100))
      }
    }

    AsyncFunction("endAll") { () async in
      guard #available(iOS 17.0, *) else { return }
      await Self.endAll()
    }

    AsyncFunction("takeSkips") { () -> [String] in OrderIslandSkips.take() }

    /// A card started while the app is open sits collapsed. The first time the app is left, open it
    /// once so the question is actually seen. (Updates with an alert expand the island briefly.)
    OnAppEntersBackground {
      guard #available(iOS 17.0, *) else { return }
      Self.popOnce()
    }
  }

  @available(iOS 17.0, *)
  static func endAll() async {
    for a in Activity<OrderIslandAttributes>.activities {
      await a.end(nil, dismissalPolicy: .immediate)
    }
  }

  @available(iOS 17.0, *)
  static func alert(for s: OrderIslandAttributes.ContentState) -> AlertConfiguration {
    AlertConfiguration(
      title: "Confirm tomorrow’s order?",
      body: "\(s.items) · ₹\(s.rupees) · \(s.when)",
      sound: .default)
  }

  @available(iOS 17.0, *)
  static func popOnce() {
    let key = "orderIsland.popped"
    guard
      let a = Activity<OrderIslandAttributes>.activities.first(where: {
        $0.activityState == .active && $0.content.state.step == .ask
      }), UserDefaults.standard.string(forKey: key) != a.id
    else { return }
    UserDefaults.standard.set(a.id, forKey: key)
    let app = UIApplication.shared
    var task: UIBackgroundTaskIdentifier = .invalid
    task = app.beginBackgroundTask { app.endBackgroundTask(task) }
    let held = task
    Task {
      try? await Task.sleep(nanoseconds: 900_000_000)
      await a.update(a.content, alertConfiguration: Self.alert(for: a.content.state))
      await MainActor.run { app.endBackgroundTask(held) }
    }
  }
}

struct CardRecord: Record {
  @Field var date: String = ""
  @Field var token: String = ""
  @Field var title: String = ""
  @Field var when: String = ""
  @Field var items: String = ""
  @Field var rupees: String = ""
  @Field var paise: String = ".00"
  @Field var payLabel: String = ""
  @Field var cashAllowed: Bool = false
  @Field var shortBy: String?
  @Field var closesAtMs: Double = 0

  @available(iOS 17.0, *)
  func state(step: OrderIslandAttributes.ContentState.Step) -> OrderIslandAttributes.ContentState {
    .init(
      step: step, title: title, when: when, items: items, rupees: rupees, paise: paise, payLabel: payLabel,
      cashAllowed: cashAllowed, shortBy: shortBy,
      closesAt: Date(timeIntervalSince1970: closesAtMs / 1000), token: token)
  }
}
