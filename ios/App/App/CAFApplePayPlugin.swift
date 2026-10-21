import UIKit
import Capacitor
import PassKit

/// Whether this device can use Apple Pay, and a shortcut to add a card in Wallet.
/// Payments themselves go through @capacitor-community/stripe (window.CAF_APPLE_PAY.pay).
/// JS: registerPlugin('CAFApplePay') in src/native.js.
@objc(CAFApplePayPlugin)
public class CAFApplePayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CAFApplePayPlugin"
    public let jsName = "CAFApplePay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setUp", returnType: CAPPluginReturnPromise)
    ]
    private let networks: [PKPaymentNetwork] = [.visa, .masterCard, .amex, .discover]

    /// supported: the device can do Apple Pay; hasCards: a card we accept is in Wallet.
    @objc func status(_ call: CAPPluginCall) {
        call.resolve([
            "supported": PKPaymentAuthorizationController.canMakePayments(),
            "hasCards": PKPaymentAuthorizationController.canMakePayments(usingNetworks: networks)
        ])
    }

    /// Opens Wallet's "add a card" flow (Apple's "Set up Apple Pay" button).
    @objc func setUp(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            PKPassLibrary().openPaymentSetup()
            call.resolve()
        }
    }
}
