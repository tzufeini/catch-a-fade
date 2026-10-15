import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Starts, updates and ends the booking's lock-screen Live Activity.
/// JS: registerPlugin('CAFLive') in src/native.js. The activity's push token is
/// sent to JS ("pushToken") so the server can update it while the app is closed.
@objc(CAFLivePlugin)
public class CAFLivePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CAFLivePlugin"
    public let jsName = "CAFLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["ok": false]); return }
        let attrs = CAFActivityAttributes(
            barberName: call.getString("barberName") ?? "Your barber",
            initials: call.getString("initials") ?? "CF",
            service: call.getString("service") ?? "Haircut")
        let state = Self.state(call)
        let bookingId = call.getString("bookingId") ?? ""
        Task {
            // one booking at a time: close anything left over
            for old in Activity<CAFActivityAttributes>.activities {
                await old.end(nil, dismissalPolicy: .immediate)
            }
            do {
                let activity = try Activity.request(attributes: attrs,
                                                    content: .init(state: state, staleDate: nil),
                                                    pushType: .token)
                Task { [weak self] in
                    for await data in activity.pushTokenUpdates {
                        let hex = data.map { String(format: "%02x", $0) }.joined()
                        self?.notifyListeners("pushToken", data: ["token": hex, "bookingId": bookingId])
                    }
                }
                call.resolve(["ok": true, "id": activity.id])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        let state = Self.state(call)
        Task {
            for a in Activity<CAFActivityAttributes>.activities {
                await a.update(.init(state: state, staleDate: nil))
            }
            call.resolve(["ok": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false]); return }
        let state = Self.state(call)
        let immediate = call.getBool("immediate") ?? false
        Task {
            for a in Activity<CAFActivityAttributes>.activities {
                await a.end(.init(state: state, staleDate: nil),
                            dismissalPolicy: immediate ? .immediate : .after(Date().addingTimeInterval(15 * 60)))
            }
            call.resolve(["ok": true])
        }
    }

    @available(iOS 16.1, *)
    private static func state(_ call: CAPPluginCall) -> CAFActivityAttributes.ContentState {
        CAFActivityAttributes.ContentState(
            status: call.getString("status") ?? "accepted",
            headline: call.getString("headline") ?? "",
            detail: call.getString("detail") ?? "",
            eta: call.getInt("eta") ?? 0,
            step: call.getInt("step") ?? 1)
    }
}
