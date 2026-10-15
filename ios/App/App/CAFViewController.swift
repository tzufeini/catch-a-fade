import UIKit
import Capacitor

/// The app's web view controller. Registers plugins that live in this app
/// (not in an npm package), like the lock-screen Live Activity.
class CAFViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CAFLivePlugin())
    }
}
