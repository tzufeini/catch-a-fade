import UIKit
import WebKit

/// The web page's alert(), confirm() and prompt() boxes.
///
/// WebKit crashes the whole app if one of these boxes' completion handler is
/// never called. Capacitor presents confirm() and prompt() straight on the root
/// view controller, so when something else is on screen or still closing (the
/// photo picker after choosing a portfolio photo, Apple's rating popup, Apple
/// Pay, a share sheet) the box silently fails to appear and the app dies.
///
/// This delegate presents on whatever is on top, waits for a dismissal in
/// progress, and if the box still can't appear it answers "Cancel", so the
/// handler always runs exactly once. Everything else is forwarded to
/// Capacitor's own delegate.
final class CAFSafeDialogs: NSObject, WKUIDelegate {
    private weak var fallback: WKUIDelegate?
    private weak var host: UIViewController?

    init(fallback: WKUIDelegate?, host: UIViewController) {
        self.fallback = fallback
        self.host = host
    }

    // Capacitor's delegate handles everything not implemented here.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (fallback?.responds(to: aSelector) ?? false)
    }
    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        (fallback?.responds(to: aSelector) ?? false) ? fallback : nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let done = Once()
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.run(completionHandler) })
        present(alert, in: webView) { done.run(completionHandler) }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let done = Once()
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done.run { completionHandler(false) } })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.run { completionHandler(true) } })
        present(alert, in: webView) { done.run { completionHandler(false) } }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        // Capacitor uses prompt() internally for cookies and HTTP; those never show a box.
        if prompt.hasPrefix("{"), prompt.contains("\"Capacitor") {
            if let fb = fallback {
                fb.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText,
                            initiatedByFrame: frame, completionHandler: completionHandler)
            } else {
                completionHandler(nil)
            }
            return
        }
        let done = Once()
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done.run { completionHandler(nil) } })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            let text = alert?.textFields?.first?.text
            done.run { completionHandler(text) }
        })
        present(alert, in: webView) { done.run { completionHandler(nil) } }
    }

    // MARK: - presenting safely

    private func topViewController() -> UIViewController? {
        var vc = host
        while let next = vc?.presentedViewController, !next.isBeingDismissed { vc = next }
        return vc
    }

    /// Shows `alert` on the top view controller. `failed` runs if it can't be shown.
    private func present(_ alert: UIAlertController, in webView: WKWebView, attempt: Int = 0, failed: @escaping () -> Void) {
        DispatchQueue.main.async {
            guard webView.window != nil, let top = self.topViewController(), top.view.window != nil else { failed(); return }
            let busy = top.isBeingPresented || top.isBeingDismissed || (top.presentedViewController?.isBeingDismissed ?? false)
            if busy {
                // e.g. the photo picker is still sliding away: try again shortly
                if attempt < 20 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        self.present(alert, in: webView, attempt: attempt + 1, failed: failed)
                    }
                } else { failed() }
                return
            }
            top.present(alert, animated: true)
            // UIKit refuses some presentations without an error; if the box never
            // appeared, answer for it instead of leaving WebKit waiting.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                if alert.presentingViewController == nil && !alert.isBeingPresented && !alert.isBeingDismissed { failed() }
            }
        }
    }
}

/// Runs a completion handler at most once.
private final class Once {
    private var used = false
    func run(_ body: () -> Void) {
        guard !used else { return }
        used = true
        body()
    }
}
