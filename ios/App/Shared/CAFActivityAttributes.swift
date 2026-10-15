import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// The lock-screen / Dynamic Island card for a booking ("Andre is on the way · 6 min").
/// ContentState's keys must match activityState() in marketplace.js (server pushes)
/// and the payload sent by the app in src/native.js.
@available(iOS 16.1, *)
struct CAFActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String
        var headline: String
        var detail: String
        var eta: Int     // minutes away, 0 = unknown / not travelling
        var step: Int    // 0 requested · 1 accepted · 2 on the way · 3 arrived · 4 cutting · 5 done
    }
    var barberName: String
    var initials: String
    var service: String
}
#endif
