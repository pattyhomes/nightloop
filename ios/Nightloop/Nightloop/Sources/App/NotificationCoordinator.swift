import Combine
import Foundation
import UIKit
import UserNotifications

@MainActor
final class NotificationCoordinator: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var pendingDecisionSessionID: String?
    @Published private(set) var latestDeviceTokenHex: String?

    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
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
        pendingDecisionSessionID = Self.decisionSessionID(from: userInfo)
    }

    func handleNotificationTap(_ response: UNNotificationResponse) {
        handleNotificationTap(userInfo: response.notification.request.content.userInfo)
    }

    func clearPendingDecisionSession() {
        pendingDecisionSessionID = nil
    }

    static func decisionSessionID(from userInfo: [AnyHashable: Any]) -> String? {
        if let sessionID = userInfo["session_id"] as? String {
            return sessionID
        }

        guard let route = userInfo["route"] as? [AnyHashable: Any],
              let type = route["type"] as? String,
              type == "decision_session" else {
            return nil
        }

        return route["session_id"] as? String
    }
}
