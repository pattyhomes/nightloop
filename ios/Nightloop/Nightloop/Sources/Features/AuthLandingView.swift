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
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.08)

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    statsStrip
                    authPanel

                    if let message = authMessage ?? message {
                        ErrorStateView(title: "Sign-in status", message: message)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 72)
                .padding(.bottom, 34)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
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
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 7) {
                Circle()
                    .fill(NightloopTheme.rose)
                    .frame(width: 7, height: 7)
                    .shadow(color: NightloopTheme.rose.opacity(0.9), radius: 8)
                Text("LIVE IN SF · TONIGHT")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.rose)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(NightloopTheme.roseSoft)
            .clipShape(Capsule())
            .overlay {
                Capsule().stroke(NightloopTheme.rose.opacity(0.36))
            }

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
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 10) {
            StatMiniCard(value: "142", label: "Spots live")
            StatMiniCard(value: "38", label: "Packed now", color: NightloopTheme.rose)
            StatMiniCard(value: "2.1k", label: "Signals · 1h", color: NightloopTheme.amber)
        }
    }

    private var authPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 10) {
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

                phoneFlow
            }

            Text("21+ · SF only · be cool to doors, tip bartenders")
                .font(.caption2.weight(.semibold))
                .tracking(0.3)
                .foregroundStyle(NightloopTheme.inkDim)
                .frame(maxWidth: .infinity)
        }
    }

    private var phoneFlow: some View {
        NightloopCard(padding: 14, radius: NightloopTheme.cornerMedium, fill: Color.white.opacity(0.045)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Phone number", systemImage: "message.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NightloopTheme.ink)
                    Spacer()
                    Text("US SMS")
                        .font(.caption2.weight(.black))
                        .tracking(1)
                        .foregroundStyle(NightloopTheme.inkDim)
                }

                TextField("(415) 555-0134", text: $phoneNumber)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .padding(13)
                    .background(NightloopTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                    .foregroundStyle(NightloopTheme.ink)

                NightloopSecondaryButton(
                    title: normalizedPhone == nil ? "Text me a code" : "Send a new code",
                    systemImage: isSendingPhoneCode ? nil : "message.fill"
                ) {
                    Task { await sendPhoneCode() }
                }
                .disabled(isSendingPhoneCode || USPhoneNumber.normalize(phoneNumber) == nil)
                .opacity(isSendingPhoneCode || USPhoneNumber.normalize(phoneNumber) == nil ? 0.55 : 1)

                if normalizedPhone != nil {
                    TextField("6-digit code", text: $verificationCode)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .padding(13)
                        .background(NightloopTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                        .foregroundStyle(NightloopTheme.ink)

                    NightloopPrimaryButton(
                        title: "Verify code",
                        systemImage: "checkmark.seal.fill",
                        isLoading: isVerifyingPhoneCode,
                        isEnabled: verificationCode.trimmingCharacters(in: .whitespacesAndNewlines).count >= 4
                    ) {
                        Task { await verifyPhoneCode() }
                    }
                }

                #if DEBUG
                PhoneAuthDebugHelper(config: authStore.config) { number, code in
                    phoneNumber = number
                    normalizedPhone = USPhoneNumber.normalize(number)
                    if let code {
                        verificationCode = code
                    }
                    authMessage = code == nil ? "Test phone loaded. Send a code when ready." : "Test phone and code loaded."
                }
                #endif
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

#if DEBUG
private struct PhoneAuthDebugHelper: View {
    let config: NightloopConfig
    let apply: (String, String?) -> Void

    private var testNumber: String? {
        config.debugPhoneTestNumber
    }

    private var testCode: String? {
        config.debugPhoneTestCode
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
                .overlay(NightloopTheme.hairlineSoft)
                .padding(.vertical, 2)

            HStack(alignment: .top, spacing: 9) {
                Image(systemName: "testtube.2")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.amber)
                    .frame(width: 18)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Phone test helper")
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)

                    if let testNumber {
                        Text("Configured for \(maskedPhone(testNumber)). Use only Supabase test numbers or a controlled dev number.")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)

                        Button {
                            apply(testNumber, testCode)
                        } label: {
                            Label(testCode == nil ? "Fill test phone" : "Fill test phone + code", systemImage: "wand.and.stars")
                                .font(.caption.weight(.black))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(NightloopTheme.ink)
                        .padding(.vertical, 9)
                        .background(NightloopTheme.purpleSoft)
                        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall, style: .continuous)
                                .stroke(NightloopTheme.purpleEdge)
                        }
                    } else {
                        Text("Optional: set DEBUG_PHONE_TEST_NUMBER and DEBUG_PHONE_TEST_CODE in your ignored iOS config after Supabase phone testing is configured.")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                }
            }
        }
    }

    private func maskedPhone(_ phone: String) -> String {
        let digits = phone.filter(\.isNumber)
        let suffix = digits.suffix(4)
        return "(***) ***-\(suffix)"
    }
}
#endif
