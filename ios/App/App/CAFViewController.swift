import UIKit
import Capacitor

/// The app's web view controller. Registers plugins that live in this app
/// (not in an npm package), like the lock-screen Live Activity and haptics.
class CAFViewController: CAPBridgeViewController {
    // WKWebView holds its uiDelegate weakly, so keep it here.
    private var safeDialogs: CAFSafeDialogs?

    override open func capacitorDidLoad() {
        if let wv = webView {
            safeDialogs = CAFSafeDialogs(fallback: wv.uiDelegate, host: self)
            wv.uiDelegate = safeDialogs
        }
        bridge?.registerPluginInstance(CAFLivePlugin())
        bridge?.registerPluginInstance(CAFHapticsPlugin())
        bridge?.registerPluginInstance(CAFApplePayPlugin())
        bridge?.registerPluginInstance(CAFReviewPlugin())
    }
}
