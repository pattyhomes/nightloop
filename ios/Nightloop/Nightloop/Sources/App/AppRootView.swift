import SwiftUI

struct AppRootView: View {
    @ObservedObject var authStore: AuthStore
    @EnvironmentObject private var notificationCoordinator: NotificationCoordinator
    let apiClient: NightloopAPIClient
    let startupError: String?

    @State private var didRestoreSession = false
    @State private var lastRegisteredDeviceTokenKey: String?

    var body: some View {
        ZStack {
            OrchidBackground()

            if let startupError {
                RootMessageView(
                    title: "Config needs attention",
                    message: startupError,
                    systemImage: "wrench.and.screwdriver.fill"
                )
            } else {
                switch authStore.phase {
                case .loading:
                    LoadingStateView(title: "Restoring Nightloop")
                case .unconfigured(let message):
                    AuthLandingView(authStore: authStore, message: message)
                case .signedOut:
                    AuthLandingView(authStore: authStore, message: nil)
                case .signedIn:
                    AccountGateView(authStore: authStore, apiClient: apiClient)
                case .failed(let message):
                    AuthLandingView(authStore: authStore, message: message)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            guard !didRestoreSession else { return }
            didRestoreSession = true
            await authStore.restoreSession()
        }
        .onChange(of: notificationCoordinator.latestDeviceTokenHex) { _, _ in
            Task { await registerLatestDeviceTokenIfPossible() }
        }
        .onChange(of: authStore.phase) { _, _ in
            Task { await registerLatestDeviceTokenIfPossible() }
        }
    }

    private func registerLatestDeviceTokenIfPossible() async {
        guard let token = notificationCoordinator.latestDeviceTokenHex,
              let bearerToken = authStore.accessToken else {
            if authStore.accessToken == nil {
                lastRegisteredDeviceTokenKey = nil
            }
            return
        }

        let registrationKey = "\(token)-\(bearerToken.hashValue)"
        guard registrationKey != lastRegisteredDeviceTokenKey else { return }

        do {
            _ = try await apiClient.registerDeviceToken(
                token: token,
                apnsEnvironment: APNsEnvironmentPolicy.currentBackendValue,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                buildNumber: Bundle.main.infoDictionary?["CFBundleVersion"] as? String,
                bearerToken: bearerToken
            )
            lastRegisteredDeviceTokenKey = registrationKey
        } catch {
            // Push registration is best-effort; room actions must keep working offline or on simulator.
        }
    }

}

enum APNsEnvironmentPolicy {
    static var currentBackendValue: String {
        #if DEBUG
        return backendValue(isDebug: true)
        #else
        return backendValue(isDebug: false)
        #endif
    }

    static func backendValue(isDebug: Bool) -> String {
        isDebug ? "sandbox" : "production"
    }
}

private struct RootMessageView: View {
    let title: String
    let message: String
    let systemImage: String

    var body: some View {
        VStack {
            Spacer()
            NightloopCard {
                VStack(alignment: .leading, spacing: 12) {
                    Label(title, systemImage: systemImage)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(NightloopTheme.ink)

                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            Spacer()
        }
    }
}

struct NightloopTabShell: View {
    @ObservedObject var authStore: AuthStore
    @EnvironmentObject private var notificationCoordinator: NotificationCoordinator
    let apiClient: NightloopAPIClient
    let me: MeResponse
    let preferences: [String: [String]]
    let onAccountChanged: (MeResponse) -> Void

    @State private var selectedTab: AppTab = .debugInitialTab
    @State private var decisionStartSeed: DecisionStartSeed?

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.045)

            switch selectedTab {
            case .home:
                NavigationStack {
                    HomeView(
                        apiClient: apiClient,
                        authStore: authStore,
                        me: me,
                        preferences: preferences,
                        onAccountChanged: onAccountChanged
                    )
                }
            case .map:
                NavigationStack {
                    MapShellView(apiClient: apiClient, authStore: authStore, me: me, onAccountChanged: onAccountChanged)
                }
            case .decision:
                NavigationStack {
                    DecisionShellView(
                        apiClient: apiClient,
                        authStore: authStore,
                        me: me,
                        onAccountChanged: onAccountChanged,
                        startSeed: decisionStartSeed
                    )
                }
            case .friends:
                NavigationStack {
                    FriendsShellView(apiClient: apiClient, authStore: authStore, me: me) { friendIDs in
                        decisionStartSeed = DecisionStartSeed(id: UUID(), friendIDs: friendIDs)
                        selectedTab = .decision
                    }
                }
            case .profile:
                NavigationStack {
                    ProfileView(authStore: authStore, apiClient: apiClient, me: me, onAccountChanged: onAccountChanged)
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            NightloopBottomTabBar(selectedTab: $selectedTab)
        }
        .toolbar(.hidden, for: .tabBar)
        .onAppear {
            routePendingNotificationIfNeeded()
        }
        .onChange(of: notificationCoordinator.pendingDecisionSessionID) { _, sessionID in
            guard sessionID != nil else { return }
            routePendingNotificationIfNeeded()
        }
    }

    private func routePendingNotificationIfNeeded() {
        guard let sessionID = notificationCoordinator.pendingDecisionSessionID else { return }
        decisionStartSeed = DecisionStartSeed(id: UUID(), friendIDs: [], decisionSessionID: sessionID)
        selectedTab = NotificationRoutePolicy.selectedTab(for: .decisionSession(sessionID))
        notificationCoordinator.clearPendingDecisionSession()
    }
}
