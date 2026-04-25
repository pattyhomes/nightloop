import SwiftUI

struct DevSignInView: View {
    @ObservedObject var authStore: AuthStore
    let message: String?

    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nightloop")
                        .font(.largeTitle.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("Dev sign-in for Phase 3 API smoke testing.")
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                if let message {
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

                        Button {
                            Task { await submit() }
                        } label: {
                            if isSubmitting {
                                ProgressView().tint(.white)
                            } else {
                                Label("Sign In", systemImage: "key.fill")
                                    .font(.headline)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.purple)
                        .disabled(email.isEmpty || password.isEmpty || isSubmitting)

                        Text("Production Apple and phone auth are Phase 4. This screen exists so the iOS shell can test Supabase sessions and bearer-token API calls locally.")
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

    private func submit() async {
        isSubmitting = true
        await authStore.signIn(email: email, password: password)
        isSubmitting = false
    }
}
