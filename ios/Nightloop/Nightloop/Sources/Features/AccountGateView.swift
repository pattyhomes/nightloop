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
        .task { await loadAccount() }
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

    var body: some View {
        VStack {
            Spacer()

            NightloopCard {
                VStack(alignment: .leading, spacing: 16) {
                    PulsePill(level: status == "ineligible" ? 1 : 2, label: status == "ineligible" ? "Eligibility locked" : "21+")

                    Text(status == "ineligible" ? "Nightloop is 21+." : "Confirm 21+ to enter.")
                        .font(.system(size: 30, weight: .black, design: .rounded))
                        .foregroundStyle(NightloopTheme.ink)

                    Text("Nightloop stores only the attestation result and timestamp. It does not store your date of birth.")
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NightloopTheme.amber)
                    }

                    if status != "ineligible" {
                        Button {
                            attest(true)
                        } label: {
                            if isSaving {
                                ProgressView().tint(.white)
                            } else {
                                Label("I am 21 or older", systemImage: "checkmark.seal.fill")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.fab)
                        .disabled(isSaving)

                        Button {
                            attest(false)
                        } label: {
                            Text("I am not 21")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(NightloopTheme.inkMuted)
                        .disabled(isSaving)
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
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(22)

            Spacer()
        }
        .alert("Delete account?", isPresented: $showDeleteConfirmation) {
            Button("Delete account", role: .destructive, action: deleteAccount)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This anonymizes your Nightloop profile and signs you out.")
        }
    }
}
