import AuthenticationServices
import SwiftUI

struct AuthLandingView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient
    let message: String?

    @State private var phoneNumber = ""
    @State private var verificationCode = ""
    @State private var normalizedPhone: String?
    @State private var isSendingPhoneCode = false
    @State private var isVerifyingPhoneCode = false
    @State private var authMessage: String?
    @State private var landingMetrics: LandingMetricsResponse?
    @State private var currentAppleNonce: String?
    @State private var showDebugSignIn = false
    @State private var showEmailLogin = false

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
        .sheet(isPresented: $showDebugSignIn) {
            DevSignInView(authStore: authStore, message: nil)
        }
        #endif
        .sheet(isPresented: $showEmailLogin) {
            EmailPasswordSignInView(authStore: authStore)
        }
        .task { await loadLandingMetrics() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 7) {
                Circle()
                    .fill(NightloopTheme.rose)
                    .frame(width: 7, height: 7)
                    .shadow(color: NightloopTheme.rose.opacity(0.9), radius: 8)
                Text("SF PREVIEW · NIGHTLOOP IS BUILDING")
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

            Text("A sharper way to pick the night. Source-backed venues, trusted hours, and social plans without pretending the whole city is live at noon.")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 10) {
            StatMiniCard(
                value: MetricDisplay.compact(landingMetrics?.metrics.approvedPublicVenues ?? 100),
                label: "SF venues"
            )
            StatMiniCard(
                value: MetricDisplay.compact(landingMetrics?.metrics.approvedFutureVenueOwnedEvents ?? 4),
                label: "Events queued",
                color: NightloopTheme.rose
            )
            StatMiniCard(
                value: MetricDisplay.compact(landingMetrics?.metrics.venueDatapoints ?? 240),
                label: landingMetrics?.copy.venueDatapointsLabel ?? "Venue datapoints",
                color: NightloopTheme.amber
            )
        }
    }

    private var authPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 10) {
                appleSignInControl

                Button {
                    showEmailLogin = true
                } label: {
                    Label("Log in", systemImage: "envelope.fill")
                        .font(.subheadline.weight(.black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.bordered)
                .tint(NightloopTheme.purple)

                if authStore.config.phoneAuthEnabled {
                    phoneFlow
                }
            }

            VStack(spacing: 10) {
                Text("21+ · live first in SF · built for nights out, not doomscrolling")
                    .font(.caption2.weight(.semibold))
                    .tracking(0.3)
                    .foregroundStyle(NightloopTheme.inkDim)
                    .frame(maxWidth: .infinity)

                #if DEBUG
                Button {
                    showDebugSignIn = true
                } label: {
                    Label("Developer testing", systemImage: "hammer.fill")
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(NightloopTheme.surface.opacity(0.62))
                        .clipShape(Capsule())
                        .overlay {
                            Capsule().stroke(NightloopTheme.hairline)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open debug sign-in")
                #endif
            }
        }
    }

    @ViewBuilder
    private var appleSignInControl: some View {
        if authStore.config.appleAuthEnabled {
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
        } else {
            AuthProviderPendingButton(
                title: "Sign in with Apple",
                subtitle: "Apple Developer setup pending",
                systemImage: "apple.logo"
            )
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

                if authStore.config.phoneAuthEnabled {
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
                }

                #if DEBUG
                PhoneAuthDebugHelper(config: authStore.config, isPhoneAuthEnabled: authStore.config.phoneAuthEnabled) { number, code in
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

    private func loadLandingMetrics() async {
        do {
            landingMetrics = try await apiClient.landingMetrics()
        } catch {
            landingMetrics = nil
        }
    }
}

private struct EmailPasswordSignInView: View {
    @ObservedObject var authStore: AuthStore

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isSigningIn = false
    @State private var statusMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Log in")
                .font(.title2.weight(.black))
                .foregroundStyle(NightloopTheme.ink)

            Text("Use your email and password to get back into nightloop.")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)

            if let statusMessage {
                ErrorStateView(title: "Sign-in failed", message: statusMessage)
            }

            TextField("Email", text: $email)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
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
                Task {
                    await submit()
                }
            } label: {
                if isSigningIn {
                    ProgressView().tint(.white)
                } else {
                    Text("Sign in")
                        .font(.headline.weight(.black))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NightloopTheme.purple)
            .disabled(normalizedEmail.isEmpty || password.count < 8 || isSigningIn)

            Spacer()
        }
        .padding(22)
        .background(OrchidBackground())
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submit() async {
        isSigningIn = true
        statusMessage = nil
        await authStore.signIn(email: normalizedEmail, password: password)
        isSigningIn = false

        switch authStore.phase {
        case .signedIn:
            dismiss()
        case .failed(let message), .unconfigured(let message):
            statusMessage = message
        default:
            statusMessage = "Sign-in could not complete. Please try again."
        }
    }
}

enum MetricDisplay {
    static func compact(_ value: Int) -> String {
        if value >= 1_000 {
            let decimal = Double(value) / 1_000
            if value % 1_000 == 0 {
                return "\(Int(decimal))k"
            }
            return String(format: "%.1fk", decimal)
        }
        return "\(value)"
    }
}

private struct AuthProviderPendingButton: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.headline.weight(.black))
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline.weight(.black))
                Text(subtitle)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color(hex: "#59515f"))
            }
            Spacer()
            Image(systemName: "lock.fill")
                .font(.caption.weight(.black))
                .foregroundStyle(Color(hex: "#59515f"))
        }
        .foregroundStyle(Color(hex: "#1b1524"))
        .padding(.horizontal, 16)
        .frame(height: 52)
        .background(Color.white.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(Color.white.opacity(0.42))
        }
        .opacity(0.9)
    }
}

private struct AuthProviderPendingRow: View {
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "clock.badge.checkmark")
                .font(.subheadline.weight(.black))
                .foregroundStyle(NightloopTheme.amber)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Text(message)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(NightloopTheme.amber.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall, style: .continuous)
                .stroke(NightloopTheme.amber.opacity(0.18))
        }
    }
}

#if DEBUG
private struct PhoneAuthDebugHelper: View {
    let config: NightloopConfig
    let isPhoneAuthEnabled: Bool
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
                        Text(isPhoneAuthEnabled ? "Configured for \(maskedPhone(testNumber)). Use only Supabase test numbers or a controlled dev number." : "Test phone is configured, but phone auth is still marked setup-pending.")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)

                        if isPhoneAuthEnabled {
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
