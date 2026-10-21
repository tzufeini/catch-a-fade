import UIKit
import Capacitor
import StoreKit

/// Apple's own "Enjoying Catch a Fade?" rating popup (Guideline 5.6.1: no custom review prompts).
/// The app calls it only right after a 5-star cut; iOS decides whether to show it
/// and shows it at most 3 times a year. JS: registerPlugin('CAFReview') in src/native.js.
@objc(CAFReviewPlugin)
public class CAFReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CAFReviewPlugin"
    public let jsName = "CAFReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scene = UIApplication.shared.connectedScenes
                .first { $0.activationState == .foregroundActive } as? UIWindowScene
            if let scene = scene {
                if #available(iOS 16.0, *) { AppStore.requestReview(in: scene) }
                else { SKStoreReviewController.requestReview(in: scene) }
            }
            call.resolve()
        }
    }
}
