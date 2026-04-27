import SwiftUI

struct AccountGateView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient

    @State private var me: MeResponse?
    @State private var markets: [Market] = []
    @State private var preferences: [String: [String]] = [:]
    @State private var errorMessage: String?
    @State private var saveErrorMessage: String?
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var didStartInitialLoad = false

    var body: some View {
        ZStack {
            OrchidBackground()

            if isLoading {
                LoadingStateView(title: "Loading your account")
            } else if let errorMessage {
                ErrorStateView(title: "Account unavailable", message: errorMessage) {
                    Task { await loadAccount() }
                }
                .padding(20)
            } else if let me {
                route(for: me)
            }
        }
        .onAppear {
            guard !didStartInitialLoad else { return }
            didStartInitialLoad = true
            Task { await loadAccount() }
        }
    }

    @ViewBuilder
    private func route(for me: MeResponse) -> some View {
        if me.user.eligibilityStatus == "eligible" {
            if me.onboarding.missingSteps.contains("profile") {
                ProfileSetupView(
                    me: me,
                    markets: markets,
                    isSaving: isSaving,
                    errorMessage: saveErrorMessage,
                    save: { displayName, username, marketID, bio in
                        Task { await saveProfile(displayName: displayName, username: username, marketID: marketID, bio: bio) }
                    },
                    signOut: {
                        Task { await authStore.signOut() }
                    }
                )
            } else if me.onboarding.missingSteps.contains("preferences") {
                OnboardingFlowView(
                    displayName: me.profile?.displayName ?? "Nightloop User",
                    initialSelections: OnboardingPreferences.uiSelections(from: preferences),
                    isSaving: isSaving,
                    errorMessage: saveErrorMessage,
                    onComplete: { payload in
                        Task { await savePreferences(payload) }
                    }
                )
            } else {
                NightloopTabShell(authStore: authStore, apiClient: apiClient, me: me, preferences: preferences) { updated in
                    self.me = updated
                }
            }
        } else {
            AgeGateView(
                status: me.user.eligibilityStatus,
                isSaving: isSaving,
                isDeleting: isDeleting,
                errorMessage: saveErrorMessage,
                attest: { value in
                    Task { await attestAge(is21OrOver: value) }
                },
                signOut: {
                    Task { await authStore.signOut() }
                },
                deleteAccount: {
                    Task { await deleteAccount() }
                }
            )
        }
    }

    private func loadAccount() async {
        guard let token = authStore.accessToken else {
            errorMessage = "Your Supabase session is missing. Please sign in again."
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil
        saveErrorMessage = nil

        do {
            let loadedMe = try await apiClient.me(bearerToken: token)
            let loadedMarkets = try await apiClient.markets()
            me = loadedMe
            markets = loadedMarkets.items

            if loadedMe.user.eligibilityStatus == "eligible" {
                preferences = (try? await apiClient.preferences(bearerToken: token).preferences) ?? [:]
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func attestAge(is21OrOver: Bool) async {
        guard let token = authStore.accessToken else { return }

        isSaving = true
        saveErrorMessage = nil
        do {
            me = try await apiClient.attestAge(is21OrOver: is21OrOver, bearerToken: token)
            if is21OrOver {
                preferences = (try? await apiClient.preferences(bearerToken: token).preferences) ?? [:]
            }
        } catch {
            saveErrorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func saveProfile(displayName: String, username: String, marketID: String?, bio: String?) async {
        guard let token = authStore.accessToken else { return }

        isSaving = true
        saveErrorMessage = nil
        do {
            me = try await apiClient.updateProfile(
                displayName: displayName,
                username: username,
                selectedMarketId: marketID ?? markets.first?.id,
                bio: bio,
                includeBio: true,
                bearerToken: token
            )
        } catch {
            saveErrorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func savePreferences(_ payload: [String: [String]]) async {
        guard let token = authStore.accessToken else { return }

        isSaving = true
        saveErrorMessage = nil
        do {
            preferences = try await apiClient.replacePreferences(payload, bearerToken: token).preferences
            me = try await apiClient.me(bearerToken: token)
        } catch {
            saveErrorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteAccount() async {
        guard let token = authStore.accessToken else { return }

        isDeleting = true
        saveErrorMessage = nil
        do {
            _ = try await apiClient.deleteAccount(bearerToken: token)
            await authStore.signOut()
        } catch {
            saveErrorMessage = error.localizedDescription
        }
        isDeleting = false
    }
}

private struct AgeGateView: View {
    let status: String
    let isSaving: Bool
    let isDeleting: Bool
    let errorMessage: String?
    let attest: (Bool) -> Void
    let signOut: () -> Void
    let deleteAccount: () -> Void

    @State private var showDeleteConfirmation = false
    @State private var showUnderageConfirmation = false

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.055)

            VStack(alignment: .leading, spacing: 24) {
                Spacer()

                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 7) {
                        Circle()
                            .fill(status == "ineligible" ? NightloopTheme.amber : NightloopTheme.rose)
                            .frame(width: 7, height: 7)
                        Text(status == "ineligible" ? "ELIGIBILITY LOCKED" : "ENTRY CHECK")
                            .font(.caption2.weight(.black))
                            .tracking(1.6)
                    }
                    .foregroundStyle(status == "ineligible" ? NightloopTheme.amber : NightloopTheme.rose)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background((status == "ineligible" ? NightloopTheme.amber : NightloopTheme.rose).opacity(0.14))
                    .clipShape(Capsule())
                    .overlay {
                        Capsule().stroke((status == "ineligible" ? NightloopTheme.amber : NightloopTheme.rose).opacity(0.32))
                    }

                    Text(status == "ineligible" ? "Nightloop is not available for this account." : "Confirm your age to enter.")
                        .font(.system(size: 40, weight: .black))
                        .lineSpacing(-2)
                        .foregroundStyle(NightloopTheme.ink)
                    Text(status == "ineligible" ? "You can sign out or delete this account. No date of birth is stored." : "We store only your eligibility attestation and timestamp. No date of birth.")
                        .font(.subheadline.weight(.semibold))
                        .lineSpacing(4)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                if let errorMessage {
                    ErrorStateView(title: "Eligibility save failed", message: errorMessage)
                }

                NightloopCard(fill: Color.white.opacity(0.045)) {
                    VStack(spacing: 12) {
                        if status != "ineligible" {
                            NightloopPrimaryButton(
                                title: "I am 21 or older",
                                systemImage: "checkmark.seal.fill",
                                isLoading: isSaving
                            ) {
                                attest(true)
                            }

                            NightloopSecondaryButton(title: "I am under 21") {
                                showUnderageConfirmation = true
                            }
                            .disabled(isSaving)
                            .opacity(isSaving ? 0.5 : 1)
                        }

                        Button("Sign out", action: signOut)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                            .frame(maxWidth: .infinity)

                        if status == "ineligible" {
                            Button(role: .destructive) {
                                showDeleteConfirmation = true
                            } label: {
                                Text(isDeleting ? "Deleting..." : "Delete account")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .disabled(isDeleting)
                        }
                    }
                }

                Spacer()
            }
            .padding(24)
        }
        .alert("Confirm eligibility", isPresented: $showUnderageConfirmation) {
            Button("I am under 21", role: .destructive) { attest(false) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will mark this Nightloop account as ineligible.")
        }
        .alert("Delete account?", isPresented: $showDeleteConfirmation) {
            Button("Delete account", role: .destructive, action: deleteAccount)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This anonymizes your Nightloop profile and signs you out.")
        }
    }
}
