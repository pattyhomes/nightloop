import Combine
import Foundation
import UIKit
import UserNotifications

@MainActor
final class NotificationCoordinator: NSObject, ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var pendingDecisionSessionID: String?
    @Published private(set) var latestDeviceTokenHex: String?

    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
        super.init()
        Task {
            await refreshAuthorizationStatus()
        }
    }

    func refreshAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    func requestPermission() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            await refreshAuthorizationStatus()

            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }

            return granted
        } catch {
            await refreshAuthorizationStatus()
            return false
        }
    }

    func receiveDeviceToken(_ deviceToken: Data) {
        latestDeviceTokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
    }

    func receiveDeviceTokenRegistrationError(_: Error) {
        latestDeviceTokenHex = nil
    }

    func handleNotificationTap(userInfo: [AnyHashable: Any]) {
        pendingDecisionSessionID = NotificationRoutePolicy.destination(from: userInfo)?.decisionSessionID
    }

    func handleNotificationTap(_ response: UNNotificationResponse) {
        handleNotificationTap(userInfo: response.notification.request.content.userInfo)
    }

    func clearPendingDecisionSession() {
        pendingDecisionSessionID = nil
    }

    nonisolated static func decisionSessionID(from userInfo: [AnyHashable: Any]) -> String? {
        NotificationRoutePolicy.destination(from: userInfo)?.decisionSessionID
    }
}

enum NotificationRouteDestination: Equatable {
    case decisionSession(String)

    var decisionSessionID: String? {
        switch self {
        case .decisionSession(let sessionID):
            return sessionID
        }
    }
}

enum NotificationRoutePolicy {
    static func destination(from userInfo: [AnyHashable: Any]) -> NotificationRouteDestination? {
        if let sessionID = userInfo["session_id"] as? String {
            return .decisionSession(sessionID)
        }

        let route = (userInfo["route"] as? [AnyHashable: Any])
            ?? (userInfo["route"] as? [String: Any]).map { Dictionary(uniqueKeysWithValues: $0.map { (AnyHashable($0.key), $0.value) }) }

        guard let route,
              let type = route["type"] as? String,
              type == "decision_session" else {
            return nil
        }

        if let sessionID = route["session_id"] as? String {
            return .decisionSession(sessionID)
        }

        if let sessionID = route["sessionId"] as? String {
            return .decisionSession(sessionID)
        }

        return nil
    }

    static func selectedTab(for destination: NotificationRouteDestination) -> AppTab {
        switch destination {
        case .decisionSession:
            return .decision
        }
    }
}
