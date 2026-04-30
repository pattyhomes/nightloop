import GoogleMaps
import SwiftUI
import UIKit
import UserNotifications

@main
struct NightloopApp: App {
    @StateObject private var authStore: AuthStore
    @StateObject private var notificationCoordinator = NotificationCoordinator()
    @UIApplicationDelegateAdaptor(NightloopAppDelegate.self) private var appDelegate
    private let apiClient: NightloopAPIClient
    private let startupError: String?

    init() {
        do {
            let config = try NightloopConfig.current()
            if let googleMapsIOSAPIKey = config.googleMapsIOSAPIKey {
                GMSServices.provideAPIKey(googleMapsIOSAPIKey)
            }
            _authStore = StateObject(wrappedValue: AuthStore(config: config))
            apiClient = NightloopAPIClient(baseURL: config.apiBaseURL)
            startupError = nil
        } catch {
            let fallback = NightloopConfig(
                apiBaseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
                supabaseURL: nil,
                supabasePublishableKey: ""
            )
            _authStore = StateObject(wrappedValue: AuthStore(config: fallback))
            apiClient = NightloopAPIClient(baseURL: fallback.apiBaseURL)
            startupError = error.localizedDescription
        }
    }

    var body: some Scene {
        WindowGroup {
            AppRootView(authStore: authStore, apiClient: apiClient, startupError: startupError)
                .environmentObject(notificationCoordinator)
                .onAppear {
                    appDelegate.attach(notificationCoordinator)
                }
        }
    }
}

final class NightloopAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private weak var notificationCoordinator: NotificationCoordinator?
    private var pendingNotificationUserInfo: [AnyHashable: Any]?

    func attach(_ coordinator: NotificationCoordinator) {
        notificationCoordinator = coordinator
        UNUserNotificationCenter.current().delegate = self

        if let pendingNotificationUserInfo {
            self.pendingNotificationUserInfo = nil
            Task { @MainActor in
                coordinator.handleNotificationTap(userInfo: pendingNotificationUserInfo)
            }
        }
    }

    func application(
        _: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor [weak notificationCoordinator] in
            notificationCoordinator?.receiveDeviceToken(deviceToken)
        }
    }

    func application(
        _: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor [weak notificationCoordinator] in
            notificationCoordinator?.receiveDeviceTokenRegistrationError(error)
        }
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let notificationCoordinator {
            Task { @MainActor in
                notificationCoordinator.handleNotificationTap(userInfo: userInfo)
                completionHandler()
            }
        } else {
            pendingNotificationUserInfo = userInfo
            completionHandler()
        }
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
