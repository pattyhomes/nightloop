import GoogleMaps
import SwiftUI

@main
struct NightloopApp: App {
    @StateObject private var authStore: AuthStore
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
        }
    }
}
