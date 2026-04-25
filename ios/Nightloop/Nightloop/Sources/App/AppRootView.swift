import SwiftUI

struct AppRootView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient
    let startupError: String?

    @State private var didRestoreSession = false

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
                    DevSignInView(authStore: authStore, message: message)
                case .signedOut:
                    DevSignInView(authStore: authStore, message: nil)
                case .signedIn:
                    AccountGateView(authStore: authStore, apiClient: apiClient)
                case .failed(let message):
                    DevSignInView(authStore: authStore, message: message)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            guard !didRestoreSession else { return }
            didRestoreSession = true
            await authStore.restoreSession()
        }
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
    let apiClient: NightloopAPIClient
    let me: MeResponse

    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                HomeView(apiClient: apiClient, authStore: authStore, me: me)
            }
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.symbol) }
            .tag(AppTab.home)

            NavigationStack {
                MapShellView(apiClient: apiClient, authStore: authStore, me: me)
            }
            .tabItem { Label(AppTab.map.title, systemImage: AppTab.map.symbol) }
            .tag(AppTab.map)

            NavigationStack {
                DecisionShellView()
            }
            .tabItem { Label(AppTab.decision.title, systemImage: AppTab.decision.symbol) }
            .tag(AppTab.decision)

            NavigationStack {
                FriendsShellView()
            }
            .tabItem { Label(AppTab.friends.title, systemImage: AppTab.friends.symbol) }
            .tag(AppTab.friends)

            NavigationStack {
                ProfileView(authStore: authStore, apiClient: apiClient, me: me)
            }
            .tabItem { Label(AppTab.profile.title, systemImage: AppTab.profile.symbol) }
            .tag(AppTab.profile)
        }
        .tint(NightloopTheme.purple)
    }
}
