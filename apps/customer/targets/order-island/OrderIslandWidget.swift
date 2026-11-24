import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct OrderIslandBundle: WidgetBundle {
  var body: some Widget { OrderIslandWidget() }
}

private enum Brand {
  static let night = Color(red: 11 / 255, green: 21 / 255, blue: 16 / 255)
  static let sprout = Color(red: 205 / 255, green: 245 / 255, blue: 106 / 255)
  static let ink = Color(red: 14 / 255, green: 27 / 255, blue: 20 / 255)
  static let paper = Color(red: 243 / 255, green: 245 / 255, blue: 239 / 255)
  static let quiet = Color.white.opacity(0.58)
  static let pill = Color.white.opacity(0.13)
}

private typealias Ctx = ActivityViewContext<OrderIslandAttributes>

private func link(_ ctx: Ctx, _ action: String?) -> URL {
  var c = URLComponents()
  c.scheme = "f2f"
  c.host = "confirm"
  c.path = "/\(ctx.attributes.date)"
  if let action {
    c.queryItems = [
      URLQueryItem(name: "do", value: action), URLQueryItem(name: "k", value: ctx.state.token),
    ]
  }
  return c.url!
}

struct OrderIslandWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: OrderIslandAttributes.self) { ctx in
      // Lock Screen, and the banner on iPhones without a Dynamic Island.
      VStack(spacing: 10) {
        HStack(spacing: 0) {
          BrandRow()
          Spacer(minLength: 8)
          ClosesIn(ctx: ctx)
        }
        CardBody(ctx: ctx)
      }
      .padding(16)
      .activityBackgroundTint(Brand.night)
      .activitySystemActionForegroundColor(Brand.paper)
      .widgetURL(link(ctx, nil))
    } dynamicIsland: { ctx in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          BrandRow().padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ClosesIn(ctx: ctx).padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.bottom) {
          CardBody(ctx: ctx, compact: true).padding(.horizontal, 6).padding(.top, 3)
        }
      } compactLeading: {
        Mark(height: 20).padding(.leading, 2)
      } compactTrailing: {
        Text(ctx.isStale ? "Closed" : "₹\(ctx.state.rupees)")
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .foregroundStyle(ctx.isStale ? Brand.quiet : Brand.sprout)
          .monospacedDigit()
      } minimal: {
        Mark(height: 18)
      }
      .keylineTint(Brand.sprout)
      .widgetURL(link(ctx, nil))
    }
  }
}

private struct Mark: View {
  var height: CGFloat
  var body: some View {
    Image("Mark").resizable().scaledToFit().frame(height: height)
      .accessibilityLabel("Fooducia")
  }
}

private struct BrandRow: View {
  var body: some View {
    HStack(spacing: 7) {
      Mark(height: 20)
      Text("Fooducia").font(.system(size: 15, weight: .semibold)).foregroundStyle(Brand.paper)
    }
  }
}

/// "Closes in 1:42:10", counting down by itself.
private struct ClosesIn: View {
  var ctx: Ctx
  var body: some View {
    if ctx.isStale || ctx.state.closesAt <= .now {
      Text("Closed").font(.system(size: 13, weight: .medium)).foregroundStyle(Brand.quiet)
    } else if ctx.state.step != .skipped {
      HStack(spacing: 5) {
        Image(systemName: "clock").font(.system(size: 12, weight: .medium))
        Text(timerInterval: .now...ctx.state.closesAt, countsDown: true)
          .monospacedDigit()
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 62, alignment: .trailing)
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(Brand.quiet)
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Time left to order")
    }
  }
}

private struct CardBody: View {
  var ctx: Ctx
  /// The island is at most 160 points tall; the Lock Screen has room for larger type.
  var compact = false
  private var s: OrderIslandAttributes.ContentState { ctx.state }
  private var closed: Bool { ctx.isStale || s.closesAt <= .now }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 8 : 10) {
      HStack(alignment: .lastTextBaseline) {
        VStack(alignment: .leading, spacing: 1) {
          Text(heading).font(.system(size: compact ? 12 : 13, weight: .medium)).foregroundStyle(Brand.quiet)
          headline
        }
        Spacer(minLength: 8)
        if s.step != .skipped && !closed {
          VStack(alignment: .trailing, spacing: 1) {
            Text(s.items)
            Text(s.when)
          }
          .font(.system(size: compact ? 12 : 13, weight: .medium))
          .foregroundStyle(Brand.quiet)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        }
      }
      buttons
    }
  }

  private var heading: String {
    switch s.step {
    case .ask: return s.title
    case .pay: return closed ? s.title : "How would you like to pay?"
    case .skipped: return s.title
    }
  }

  @ViewBuilder private var headline: some View {
    switch s.step {
    case .skipped:
      Text("Skipped").font(.system(size: compact ? 24 : 28, weight: .semibold)).foregroundStyle(Brand.paper)
    default:
      (Text("₹\(s.rupees)").foregroundColor(Brand.paper)
        + Text(s.paise).foregroundColor(.white.opacity(0.32)).font(
          .system(size: compact ? 16 : 18, weight: .semibold)))
        .font(.system(size: compact ? 25 : 30, weight: .semibold))
        .monospacedDigit()
        .contentTransition(.numericText())
    }
  }

  @ViewBuilder private var buttons: some View {
    if s.step == .skipped {
      Text("Nothing was ordered and nothing was charged.")
        .font(.system(size: 13)).foregroundStyle(Brand.quiet)
        .frame(maxWidth: .infinity, minHeight: compact ? 38 : 46, alignment: .leading)
    } else if closed {
      Link(destination: link(ctx, nil)) { pill("Ordering has closed. See the day", icon: nil) }
    } else if s.step == .pay {
      HStack(spacing: 10) {
        if s.cashAllowed {
          Link(destination: link(ctx, "cod")) { pill("Cash on delivery", icon: nil) }
        }
        Link(destination: link(ctx, "pay")) {
          pill(s.payLabel, icon: "chevron.right", primary: true)
        }
      }
    } else {
      HStack(spacing: 10) {
        Button(intent: IslandSkipIntent(date: ctx.attributes.date)) {
          pill("Skip tomorrow", icon: nil)
        }
        .buttonStyle(.plain)
        if let shortBy = s.shortBy {
          Link(destination: link(ctx, nil)) { pill(shortBy, icon: "plus", primary: true) }
        } else {
          Button(intent: IslandConfirmIntent(date: ctx.attributes.date)) {
            pill("Confirm order", icon: "chevron.right", primary: true)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func pill(_ label: String, icon: String?, primary: Bool = false) -> some View {
    HStack(spacing: 6) {
      Text(label).lineLimit(1).minimumScaleFactor(0.75)
      if let icon { Image(systemName: icon).font(.system(size: 12, weight: .bold)) }
    }
    .font(.system(size: 15, weight: .semibold))
    .foregroundStyle(primary ? Brand.ink : Brand.paper)
    .frame(maxWidth: .infinity, minHeight: compact ? 38 : 46)
    .padding(.horizontal, 8)
    .background(primary ? Brand.sprout : Brand.pill, in: Capsule())
    .contentShape(Capsule())
  }
}
