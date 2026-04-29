import SwiftUI

struct DevSignInView: View {
    @ObservedObject var authStore: AuthStore
    let message: String?

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var isCreatingAccount = false
    @State private var isResettingCrew = false
    @State private var devMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nightloop")
                        .font(.largeTitle.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("Debug-only account testing for repeated onboarding runs.")
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                if let message = devMessage ?? message {
                    ErrorStateView(title: "Sign-in status", message: message)
                }

                #if DEBUG
                devCrewCard
                #endif

                NightloopCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Local Supabase user")
                            .font(.headline)
                            .foregroundStyle(NightloopTheme.ink)

                        TextField("Email", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(12)
                            .background(NightloopTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))

                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .padding(12)
                            .background(NightloopTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))

                        VStack(spacing: 10) {
                            #if DEBUG
                            Button {
                                Task { await createConfirmedAccountAndSignIn() }
                            } label: {
                                if isCreatingAccount {
                                    ProgressView().tint(.white)
                                } else {
                                    Label("Create + Sign In", systemImage: "person.badge.plus.fill")
                                        .font(.headline)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(NightloopTheme.purple)
                            .disabled(!canSubmit)
                            .frame(maxWidth: .infinity)
                            #endif

                            Button {
                                Task { await submit() }
                            } label: {
                                if isSubmitting {
                                    ProgressView().tint(NightloopTheme.ink)
                                } else {
                                    Label("Sign In Existing Dev User", systemImage: "key.fill")
                                        .font(.headline)
                                }
                            }
                            .buttonStyle(.bordered)
                            .tint(NightloopTheme.amber)
                            .disabled(!canSubmit)
                            .frame(maxWidth: .infinity)
                        }

                        Text("Use Create + Sign In with a fresh email alias to test age gate, profile setup, onboarding, and the first Home load from scratch.")
                            .font(.footnote)
                            .foregroundStyle(NightloopTheme.inkDim)
                    }
                }

                NightloopCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Local config", systemImage: "lock.shield.fill")
                            .font(.headline)
                            .foregroundStyle(NightloopTheme.ink)
                        Text("Set `SUPABASE_PUBLISHABLE_KEY` in `ios/Nightloop/Config/NightloopConfig.xcconfig`. Do not put service-role, database, Google, or Foursquare secrets in the iOS project.")
                            .font(.footnote)
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(OrchidBackground())
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isBusy: Bool {
        isSubmitting || isCreatingAccount || isResettingCrew
    }

    private var canSubmit: Bool {
        !normalizedEmail.isEmpty && password.count >= 8 && !isBusy
    }

    private func submit() async {
        isSubmitting = true
        devMessage = nil
        await authStore.signIn(email: normalizedEmail, password: password)
        isSubmitting = false
    }

    #if DEBUG
    private var devCrewCard: some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Dev crew")
                        .font(.headline.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("Reset the seeded social graph, then jump between real Supabase dev users.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                Button {
                    Task { await resetCrewAndSignIn(as: DevCrewPreset.chuck) }
                } label: {
                    if isResettingCrew {
                        ProgressView().tint(.white)
                    } else {
                        Label("Reset + Sign In as Chuck", systemImage: "person.3.sequence.fill")
                            .font(.headline.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(isBusy)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(DevCrewPreset.allCases.filter { $0 != .chuck }) { preset in
                        Button {
                            Task { await ensurePresetAndSignIn(preset) }
                        } label: {
                            VStack(spacing: 3) {
                                Text(preset.displayName)
                                    .font(.caption.weight(.black))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                Text(preset.roleLabel)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(NightloopTheme.inkMuted)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                        }
                        .buttonStyle(.bordered)
                        .tint(preset == .blocked ? NightloopTheme.amber : NightloopTheme.purple)
                        .disabled(isBusy)
                    }
                }
            }
        }
    }

    private func createConfirmedAccountAndSignIn() async {
        isCreatingAccount = true
        devMessage = nil

        do {
            let client = NightloopAPIClient(baseURL: authStore.config.apiBaseURL)
            let response = try await client.createConfirmedDevAuthUser(
                email: normalizedEmail,
                password: password
            )
            devMessage = response.message
            await authStore.signIn(email: normalizedEmail, password: password)
        } catch {
            devMessage = error.localizedDescription
        }

        isCreatingAccount = false
    }

    private func resetCrewAndSignIn(as preset: DevCrewPreset) async {
        isResettingCrew = true
        devMessage = nil

        do {
            let client = NightloopAPIClient(baseURL: authStore.config.apiBaseURL)
            let response = try await client.resetDevSocialCrew()
            devMessage = response.audit.ok ? "Dev crew reset. \(response.users.count) users ready around \(response.venue)." : "Dev crew reset, but audit needs attention."
            await authStore.signIn(email: preset.email, password: preset.password)
        } catch {
            devMessage = error.localizedDescription
        }

        isResettingCrew = false
    }

    private func ensurePresetAndSignIn(_ preset: DevCrewPreset) async {
        isCreatingAccount = true
        devMessage = nil

        do {
            let client = NightloopAPIClient(baseURL: authStore.config.apiBaseURL)
            _ = try await client.createConfirmedDevAuthUser(email: preset.email, password: preset.password)
            devMessage = "Signed in as \(preset.displayName)."
            await authStore.signIn(email: preset.email, password: preset.password)
        } catch {
            devMessage = error.localizedDescription
        }

        isCreatingAccount = false
    }
    #endif
}

#if DEBUG
private enum DevCrewPreset: String, CaseIterable, Identifiable {
    case chuck
    case alex
    case maya
    case jules
    case blocked

    var id: String { rawValue }

    var email: String {
        switch self {
        case .chuck: return "test@dev.com"
        case .alex: return "alex@dev.com"
        case .maya: return "maya@dev.com"
        case .jules: return "jules@dev.com"
        case .blocked: return "blocked@dev.com"
        }
    }

    var password: String { "Charlietest" }

    var displayName: String {
        switch self {
        case .chuck: return "Chuck"
        case .alex: return "Alex"
        case .maya: return "Maya"
        case .jules: return "Jules"
        case .blocked: return "Blocked"
        }
    }

    var roleLabel: String {
        switch self {
        case .chuck: return "primary"
        case .alex, .maya, .jules: return "friend"
        case .blocked: return "blocked"
        }
    }
}
#endif
