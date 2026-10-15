import ActivityKit
import SwiftUI
import WidgetKit

@main
struct CAFLiveActivityBundle: WidgetBundle {
    var body: some Widget { CAFLiveActivityWidget() }
}

private let cream = Color(red: 0.96, green: 0.93, blue: 0.88)
private let ink = Color(red: 0.08, green: 0.07, blue: 0.05)
private let green = Color(red: 0.27, green: 0.79, blue: 0.55)

struct CAFLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CAFActivityAttributes.self) { context in
            LockScreenCard(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(cream)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Initials(text: context.attributes.initials, size: 44).padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Eta(minutes: context.state.eta, step: context.state.step).padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.headline).font(.system(size: 16, weight: .bold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 9) {
                        Text(context.state.detail).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                        Steps(step: context.state.step)
                    }.padding(.horizontal, 6)
                }
            } compactLeading: {
                Image(systemName: "scissors").foregroundStyle(green)
            } compactTrailing: {
                Text(compactLabel(context.state)).font(.system(size: 13, weight: .bold)).foregroundStyle(green)
            } minimal: {
                Image(systemName: "scissors").foregroundStyle(green)
            }
            .keylineTint(green)
        }
    }
}

private func compactLabel(_ s: CAFActivityAttributes.ContentState) -> String {
    if s.step == 2 && s.eta > 0 { return "\(s.eta) min" }
    switch s.step {
    case 0: return "…"
    case 1: return "Booked"
    case 3: return "Here"
    case 4: return "Cutting"
    case 5: return "Done"
    default: return ""
    }
}

struct LockScreenCard: View {
    let attributes: CAFActivityAttributes
    let state: CAFActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Initials(text: attributes.initials, size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.headline).font(.system(size: 17, weight: .bold)).foregroundStyle(cream).lineLimit(1)
                    Text(state.detail).font(.system(size: 13)).foregroundStyle(cream.opacity(0.7)).lineLimit(1)
                }
                Spacer(minLength: 4)
                Eta(minutes: state.eta, step: state.step)
            }
            Steps(step: state.step)
            HStack {
                Text(attributes.service).font(.system(size: 12, weight: .semibold)).foregroundStyle(cream.opacity(0.6))
                Spacer()
                Text("Catch a Fade").font(.system(size: 12, weight: .heavy)).foregroundStyle(cream.opacity(0.6))
            }
        }
        .padding(16)
    }
}

struct Initials: View {
    let text: String
    let size: CGFloat
    var body: some View {
        Text(text)
            .font(.system(size: size * 0.38, weight: .heavy))
            .foregroundStyle(ink)
            .frame(width: size, height: size)
            .background(Circle().fill(cream))
            .overlay(Circle().stroke(green, lineWidth: 2))
    }
}

struct Eta: View {
    let minutes: Int
    let step: Int
    var body: some View {
        if step == 2 && minutes > 0 {
            VStack(spacing: -2) {
                Text("\(minutes)").font(.system(size: 26, weight: .heavy)).foregroundStyle(green)
                Text("min").font(.system(size: 11, weight: .semibold)).foregroundStyle(green.opacity(0.85))
            }
        } else if step == 3 {
            Image(systemName: "house.fill").font(.system(size: 22)).foregroundStyle(green)
        } else if step == 4 {
            Image(systemName: "scissors").font(.system(size: 22)).foregroundStyle(green)
        } else if step >= 5 {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 24)).foregroundStyle(green)
        } else {
            Image(systemName: "clock").font(.system(size: 20)).foregroundStyle(green)
        }
    }
}

/// Booked · On the way · Arrived · Cutting, filled up to the current step.
struct Steps: View {
    let step: Int
    var body: some View {
        HStack(spacing: 5) {
            ForEach(1..<5) { i in
                Capsule()
                    .fill(i <= step ? green : Color.white.opacity(0.18))
                    .frame(height: 5)
            }
        }
    }
}
