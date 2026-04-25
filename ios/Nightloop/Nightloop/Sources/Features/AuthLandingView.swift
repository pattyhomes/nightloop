import AuthenticationServices
import SwiftUI

struct AuthLandingView: View {
    @ObservedObject var authStore: AuthStore
    let message: String?

    @State private var phoneNumber = ""
    @State private var verificationCode = ""
    @State private var normalizedPhone: String?
    @State private var isSendingPhoneCode = false
    @State private var isVerifyingPhoneCode = false
    @State private var authMessage: String?
    @State private var currentAppleNonce: String?
    @State private var showDebugSignIn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                authCard

                if let message = authMessage ?? message {
                    ErrorStateView(title: "Sign-in status", message: message)
                }
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(OrchidBackground())
        #if DEBUG
        .overlay(alignment: .bottomTrailing) {
            Button {
                showDebugSignIn = true
            } label: {
                Image(systemName: "wrench.and.screwdriver.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .padding(10)
                    .background(NightloopTheme.surface.opacity(0.86))
                    .clipShape(Circle())
                    .overlay {
                        Circle().stroke(NightloopTheme.hairline)
                    }
            }
            .padding(18)
            .accessibilityLabel("Open debug sign-in")
        }
        .sheet(isPresented: $showDebugSignIn) {
            DevSignInView(authStore: authStore, message: nil)
        }
        #endif
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            PulsePill(level: 3, label: "Live in SF")

            Text("night\nloop.")
                .font(.system(size: 58, weight: .black, design: .rounded))
                .lineSpacing(-10)
                .foregroundStyle(
                    LinearGradient(
                        colors: [NightloopTheme.ink, NightloopTheme.purple, NightloopTheme.rose],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text("A live read on every room in the city. Who's going off. Who's dead. Where your people are.")
                .font(.body.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 46)
    }

    private var authCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 14) {
                SignInWithAppleButton(.signIn) { request in
                    let nonce = AppleNonce.make()
                    currentAppleNonce = nonce
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = AppleNonce.sha256(nonce)
                } onCompletion: { result in
                    handleAppleCompletion(result)
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 52)
                .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))

                VStack(alignment: .leading, spacing: 10) {
                    Text("Phone number")
                        .font(.headline)
                        .foregroundStyle(NightloopTheme.ink)

                    TextField("(415) 555-0134", text: $phoneNumber)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .padding(12)
                        .background(NightloopTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                        .foregroundStyle(NightloopTheme.ink)

                    Button {
                        Task { await sendPhoneCode() }
                    } label: {
                        if isSendingPhoneCode {
                            ProgressView().tint(.white)
                        } else {
                            Label(normalizedPhone == nil ? "Text me a code" : "Send a new code", systemImage: "message.fill")
                                .font(.headline)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.purple)
                    .disabled(isSendingPhoneCode || USPhoneNumber.normalize(phoneNumber) == nil)

                    if normalizedPhone != nil {
                        TextField("6-digit code", text: $verificationCode)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .padding(12)
                            .background(NightloopTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                            .foregroundStyle(NightloopTheme.ink)

                        Button {
                            Task { await verifyPhoneCode() }
                        } label: {
                            if isVerifyingPhoneCode {
                                ProgressView().tint(.white)
                            } else {
                                Label("Verify code", systemImage: "checkmark.seal.fill")
                                    .font(.headline)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.fab)
                        .disabled(isVerifyingPhoneCode || verificationCode.trimmingCharacters(in: .whitespacesAndNewlines).count < 4)
                    }
                }

                Text("21+ only. Nightloop uses Supabase for sign-in and Express for product data.")
                    .font(.footnote)
                    .foregroundStyle(NightloopTheme.inkDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let error):
            authMessage = safeAuthMessage(error)
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                authMessage = "Apple did not return a usable identity token."
                return
            }

            let nonce = currentAppleNonce
            currentAppleNonce = nil
            Task { await authStore.signInWithApple(idToken: idToken, nonce: nonce) }
        }
    }

    private func sendPhoneCode() async {
        isSendingPhoneCode = true
        authMessage = nil

        let result = await authStore.sendPhoneCode(phone: phoneNumber)
        switch result {
        case .success(let phone):
            normalizedPhone = phone
            authMessage = "Code sent to \(maskedPhone(phone))."
        case .failure(let error):
            authMessage = error.localizedDescription
        }

        isSendingPhoneCode = false
    }

    private func verifyPhoneCode() async {
        isVerifyingPhoneCode = true
        authMessage = nil

        let result = await authStore.verifyPhoneCode(phone: normalizedPhone ?? phoneNumber, code: verificationCode)
        if case .failure(let error) = result {
            authMessage = error.localizedDescription
        }

        isVerifyingPhoneCode = false
    }

    private func maskedPhone(_ phone: String) -> String {
        let suffix = phone.suffix(4)
        return "(***) ***-\(suffix)"
    }

    private func safeAuthMessage(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain,
           let code = ASAuthorizationError.Code(rawValue: nsError.code),
           code == .canceled {
            return "Apple sign-in was canceled."
        }

        let message = error.localizedDescription
        if message.localizedCaseInsensitiveContains("token") {
            return "Sign-in failed. Please try again."
        }
        return message
    }
}
