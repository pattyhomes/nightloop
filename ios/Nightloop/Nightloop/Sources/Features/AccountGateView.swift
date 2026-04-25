import SwiftUI

struct AccountGateView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient

    @State private var me: MeResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true
    @State private var isAttesting = false

    var body: some View {
        ZStack {
            OrchidBackground()

            if isLoading {
                LoadingStateView(title: "Loading your account")
            } else if let errorMessage {
                ErrorStateView(title: "Account unavailable", message: errorMessage) {
                    Task { await loadMe() }
                }
                .padding(20)
            } else if let me, me.user.eligibilityStatus == "eligible" {
                NightloopTabShell(authStore: authStore, apiClient: apiClient, me: me)
            } else if let me {
                AgeGateCard(me: me, isAttesting: isAttesting) {
                    Task { await attestAge() }
                } signOut: {
                    Task { await authStore.signOut() }
                }
                .padding(20)
            }
        }
        .task { await loadMe() }
    }

    private func loadMe() async {
        guard let token = authStore.accessToken else {
            errorMessage = "Your Supabase session is missing. Please sign in again."
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil
        do {
            me = try await apiClient.me(bearerToken: token)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func attestAge() async {
        guard let token = authStore.accessToken else { return }

        isAttesting = true
        do {
            me = try await apiClient.attestAge(is21OrOver: true, bearerToken: token)
        } catch {
            errorMessage = error.localizedDescription
        }
        isAttesting = false
    }
}

private struct AgeGateCard: View {
    let me: MeResponse
    let isAttesting: Bool
    let attest: () -> Void
    let signOut: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            NightloopCard {
                VStack(alignment: .leading, spacing: 14) {
                    PulsePill(level: 2, label: "Phase 3")

                    Text("Confirm 21+ to load live venues")
                        .font(.title2.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)

                    Text("Nightloop stores only the attestation result and timestamp. It does not store your date of birth.")
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)

                    if !me.onboarding.missingSteps.isEmpty {
                        Text("Remaining setup: \(me.onboarding.missingSteps.joined(separator: ", "))")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkDim)
                    }

                    Button {
                        attest()
                    } label: {
                        if isAttesting {
                            ProgressView().tint(.white)
                        } else {
                            Label("I am 21 or older", systemImage: "checkmark.seal.fill")
                                .font(.headline)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                    .disabled(isAttesting)

                    Button("Sign out", action: signOut)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
