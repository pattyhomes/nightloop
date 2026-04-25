import Foundation
import Supabase

enum AuthPhase: Equatable {
    case loading
    case unconfigured(String)
    case signedOut
    case signedIn
    case failed(String)
}

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var phase: AuthPhase = .loading
    @Published private(set) var accessToken: String?

    let config: NightloopConfig
    private let client: SupabaseClient?

    init(config: NightloopConfig) {
        self.config = config

        if config.isSupabaseConfigured, let supabaseURL = config.supabaseURL {
            self.client = SupabaseClient(
                supabaseURL: supabaseURL,
                supabaseKey: config.supabasePublishableKey
            )
        } else {
            self.client = nil
        }
    }

    func restoreSession() async {
        guard let client else {
            phase = .unconfigured("Add SUPABASE_PUBLISHABLE_KEY to the ignored iOS config file for dev sign-in.")
            return
        }

        do {
            let session = try await client.auth.session
            accessToken = session.accessToken
            phase = .signedIn
        } catch {
            accessToken = nil
            phase = .signedOut
        }
    }

    func signIn(email: String, password: String) async {
        guard let client else {
            phase = .unconfigured("Supabase is not configured for this local build.")
            return
        }

        phase = .loading
        do {
            try await client.auth.signIn(email: email, password: password)
            await restoreSession()
        } catch {
            accessToken = nil
            phase = .failed(Self.safeErrorMessage(error))
        }
    }

    func signOut() async {
        guard let client else {
            phase = .signedOut
            return
        }

        do {
            try await client.auth.signOut()
        } catch {
            phase = .failed(Self.safeErrorMessage(error))
            return
        }

        accessToken = nil
        phase = .signedOut
    }

    private static func safeErrorMessage(_ error: Error) -> String {
        let message = error.localizedDescription
        if message.localizedCaseInsensitiveContains("token") {
            return "Authentication failed. Please check the account details and try again."
        }
        return message
    }
}
