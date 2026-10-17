import UIKit
import Capacitor
import CoreHaptics

/// Taptic Engine feedback for the web UI. JS: registerPlugin('CAFHaptics') in src/native.js,
/// called through haptic(kind) in index.html.
/// The generators stay prepared so a tap is felt the instant the finger lands, and iOS
/// mutes the standard ones when Settings → Sounds & Haptics → System Haptics is off.
@objc(CAFHapticsPlugin)
public class CAFHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CAFHapticsPlugin"
    public let jsName = "CAFHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    private lazy var selection = UISelectionFeedbackGenerator()
    private lazy var outcome = UINotificationFeedbackGenerator()
    private var impacts: [UIImpactFeedbackGenerator.FeedbackStyle: UIImpactFeedbackGenerator] = [:]
    private var engine: CHHapticEngine?

    @objc func play(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "tap"
        DispatchQueue.main.async {
            self.fire(kind)
            call.resolve()
        }
    }

    private func fire(_ kind: String) {
        switch kind {
        case "select":
            selection.selectionChanged(); selection.prepare()
        case "tap":     impact(.light, 1)
        case "soft":    impact(.soft, 0.9)
        case "toggle":  impact(.rigid, 0.7)
        case "press":   impact(.medium, 1)
        case "heavy":   impact(.heavy, 1)
        case "success": notify(.success)
        case "warning": notify(.warning)
        case "error":   notify(.error)
        case "match":
            if !playPattern(Self.match) { notify(.success) }
        case "incoming":
            if !playPattern(Self.incoming) { impact(.heavy, 1) }
        default:        impact(.light, 1)
        }
    }

    private func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle, _ intensity: CGFloat) {
        let g = impacts[style] ?? UIImpactFeedbackGenerator(style: style)
        impacts[style] = g
        g.impactOccurred(intensity: intensity)
        g.prepare()
    }

    private func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        outcome.notificationOccurred(type)
        outcome.prepare()
    }

    // MARK: custom patterns (Core Haptics)

    private static func tap(_ t: Double, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
        ], relativeTime: t)
    }

    private static func buzz(_ t: Double, _ duration: Double, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticContinuous, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
        ], relativeTime: t, duration: duration)
    }

    /// A barber accepted: a "ba-DUM" heartbeat that settles into a short soft swell,
    /// timed to the photo popping into the search circle.
    private static let match: ([CHHapticEvent], [CHHapticParameterCurve]) = (
        [tap(0, 0.55, 0.35), tap(0.12, 1.0, 0.55), buzz(0.14, 0.38, 0.45, 0.2)],
        [CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
            .init(relativeTime: 0.14, value: 1.0), .init(relativeTime: 0.52, value: 0.0)
        ], relativeTime: 0)]
    )

    /// A new request for a barber: three firm pulses, like a ride request ping.
    private static let incoming: ([CHHapticEvent], [CHHapticParameterCurve]) = (
        [buzz(0, 0.1, 1.0, 0.7), buzz(0.18, 0.1, 1.0, 0.7), buzz(0.36, 0.14, 1.0, 0.7)],
        []
    )

    private func playPattern(_ p: ([CHHapticEvent], [CHHapticParameterCurve])) -> Bool {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return false }
        do {
            if engine == nil {
                let e = try CHHapticEngine()
                e.playsHapticsOnly = true            // never interrupts music or the call audio
                e.isAutoShutdownEnabled = true       // sleeps when idle, saves battery
                e.resetHandler = { [weak self] in try? self?.engine?.start() }
                engine = e
            }
            guard let e = engine else { return false }
            try e.start()
            let pattern = try CHHapticPattern(events: p.0, parameterCurves: p.1)
            try e.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
            return true
        } catch {
            return false
        }
    }
}
