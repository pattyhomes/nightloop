import SwiftUI

struct DevSignInView: View {
    @ObservedObject var authStore: AuthStore
    let message: String?

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var isCreatingAccount = false
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
        isSubmitting || isCreatingAccount
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
    #endif
}
