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
                supabaseKey: config.supabasePublishableKey,
                options: SupabaseClientOptions(
                    auth: .init(emitLocalSessionAsInitialSession: true)
                )
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

        if let currentSession = client.auth.currentSession, !currentSession.isExpired {
            accessToken = currentSession.accessToken
            phase = .signedIn
            return
        }

        do {
            let session = try await Self.withTimeout(seconds: 8) {
                try await client.auth.session
            }
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

    func signInWithApple(idToken: String, nonce: String?) async {
        guard let client else {
            phase = .unconfigured("Supabase is not configured for this build.")
            return
        }

        phase = .loading
        do {
            try await client.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(
                    provider: .apple,
                    idToken: idToken,
                    nonce: nonce
                )
            )
            await restoreSession()
        } catch {
            accessToken = nil
            phase = .failed(Self.safeErrorMessage(error))
        }
    }

    func sendPhoneCode(phone: String) async -> Result<String, AuthActionError> {
        guard let client else {
            return .failure(.configuration("Supabase is not configured for this build."))
        }

        guard let normalized = USPhoneNumber.normalize(phone) else {
            return .failure(.validation("Enter a valid US phone number."))
        }

        do {
            try await client.auth.signInWithOTP(phone: normalized)
            return .success(normalized)
        } catch {
            return .failure(.authentication(Self.safeErrorMessage(error)))
        }
    }

    func verifyPhoneCode(phone: String, code: String) async -> Result<Void, AuthActionError> {
        guard let client else {
            return .failure(.configuration("Supabase is not configured for this build."))
        }

        guard let normalized = USPhoneNumber.normalize(phone) else {
            return .failure(.validation("Enter a valid US phone number."))
        }

        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedCode.count >= 4 else {
            return .failure(.validation("Enter the SMS code."))
        }

        do {
            try await client.auth.verifyOTP(phone: normalized, token: trimmedCode, type: .sms)
            await restoreSession()
            return .success(())
        } catch {
            return .failure(.authentication(Self.safeErrorMessage(error)))
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

    private static func withTimeout<T: Sendable>(
        seconds: UInt64,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: seconds * 1_000_000_000)
                throw AuthRestoreTimeout()
            }

            guard let result = try await group.next() else {
                throw AuthRestoreTimeout()
            }
            group.cancelAll()
            return result
        }
    }
}

private struct AuthRestoreTimeout: LocalizedError {
    var errorDescription: String? {
        "Session restore timed out."
    }
}

enum AuthActionError: LocalizedError, Equatable {
    case configuration(String)
    case validation(String)
    case authentication(String)

    var errorDescription: String? {
        switch self {
        case .configuration(let message), .validation(let message), .authentication(let message):
            return message
        }
    }
}
