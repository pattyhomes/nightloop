import SwiftUI

struct ProfileView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient
    let me: MeResponse
    let onAccountChanged: (MeResponse) -> Void

    @State private var displayName = ""
    @State private var username = ""
    @State private var bio = ""
    @State private var settings = UserSettings.fallback
    @State private var isSavingProfile = false
    @State private var isSavingSettings = false
    @State private var isDeleting = false
    @State private var statusMessage: String?
    @State private var showDeleteSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                profileHeader
                signalScoutCard
                editableProfileCard
                settingsCard
                accountCard
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { hydrateLocalState() }
        .sheet(isPresented: $showDeleteSheet) {
            DeleteAccountSheet(isDeleting: isDeleting) {
                Task { await deleteAccount() }
            }
        }
    }

    private var profileHeader: some View {
        HStack(spacing: 14) {
            AvatarInitials(initials: initials)
            VStack(alignment: .leading, spacing: 4) {
                Text(me.profile?.displayName ?? "Nightloop User")
                    .font(.title2.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Text("@\(me.profile?.username ?? "nightloop")")
                    .font(.subheadline)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }
        }
    }

    private var signalScoutCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Signal Scout", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)
                Text("\(me.user.signalScoutPoints) points")
                    .font(.title.weight(.black))
                    .foregroundStyle(NightloopTheme.fab)
                Text("Signals decay on the backend; the app only sends one-tap reports.")
                    .font(.footnote)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var editableProfileCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Identity", systemImage: "person.crop.circle.fill")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)

                ProfileFieldLabel("Display name")
                TextField("Display name", text: $displayName)
                    .textContentType(.name)
                    .padding(12)
                    .background(NightloopTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                    .foregroundStyle(NightloopTheme.ink)

                ProfileFieldLabel("Username")
                HStack(spacing: 4) {
                    Text("@").foregroundStyle(NightloopTheme.inkMuted)
                    TextField("username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .foregroundStyle(NightloopTheme.ink)
                }
                .padding(12)
                .background(NightloopTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))

                ProfileFieldLabel("Bio")
                TextField("Optional", text: $bio, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(12)
                    .background(NightloopTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                    .foregroundStyle(NightloopTheme.ink)

                Button {
                    Task { await saveProfile() }
                } label: {
                    if isSavingProfile {
                        ProgressView().tint(.white)
                    } else {
                        Label("Save profile", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(!canSaveProfile || isSavingProfile)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var settingsCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 14) {
                Label("Settings", systemImage: "gearshape.fill")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)

                Toggle("Ghost mode", isOn: Binding(
                    get: { settings.ghostMode },
                    set: { settings = settings.with(ghostMode: $0) }
                ))
                Toggle("Neighborhood labels", isOn: Binding(
                    get: { settings.mapShowNeighborhoodLabels },
                    set: { settings = settings.with(mapShowNeighborhoodLabels: $0) }
                ))
                Toggle("Street grid", isOn: Binding(
                    get: { settings.mapShowStreetGrid },
                    set: { settings = settings.with(mapShowStreetGrid: $0) }
                ))
                Toggle("Social notifications", isOn: Binding(
                    get: { settings.pushSocialEnabled },
                    set: { settings = settings.with(pushSocialEnabled: $0) }
                ))
                Toggle("Decision notifications", isOn: Binding(
                    get: { settings.pushDecisionEnabled },
                    set: { settings = settings.with(pushDecisionEnabled: $0) }
                ))
                Toggle("Favorite venue alerts", isOn: Binding(
                    get: { settings.pushFavoriteVenueAlertsEnabled },
                    set: { settings = settings.with(pushFavoriteVenueAlertsEnabled: $0) }
                ))

                Text("Notification toggles save your preference. The iOS permission prompt waits until social and decision notifications exist.")
                    .font(.footnote)
                    .foregroundStyle(NightloopTheme.inkDim)

                Button {
                    Task { await saveSettings() }
                } label: {
                    if isSavingSettings {
                        ProgressView().tint(.white)
                    } else {
                        Label("Save settings", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(isSavingSettings)
            }
            .tint(NightloopTheme.fab)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var accountCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Account", systemImage: "lock.shield.fill")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)

                if let statusMessage {
                    Text(statusMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(statusMessage.localizedCaseInsensitiveContains("saved") ? NightloopTheme.good : NightloopTheme.amber)
                }

                Button {
                    Task { await authStore.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button(role: .destructive) {
                    showDeleteSheet = true
                } label: {
                    Label("Delete Account", systemImage: "trash.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var initials: String {
        let display = me.profile?.displayName ?? "Nightloop User"
        let parts = display.split(separator: " ")
        let firstTwo = parts.prefix(2).compactMap { $0.first }
        return firstTwo.isEmpty ? "NL" : String(firstTwo)
    }

    private var canSaveProfile: Bool {
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && username.trimmingCharacters(in: .whitespacesAndNewlines).range(of: #"^[a-z0-9_]{3,24}$"#, options: .regularExpression) != nil
    }

    private func hydrateLocalState() {
        displayName = me.profile?.displayName ?? ""
        username = me.profile?.username ?? ""
        bio = me.profile?.bio ?? ""
        settings = me.settings ?? .fallback
    }

    private func saveProfile() async {
        guard let token = authStore.accessToken else { return }

        isSavingProfile = true
        statusMessage = nil
        do {
            let updated = try await apiClient.updateProfile(
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                username: username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                selectedMarketId: me.profile?.selectedMarketId,
                bio: bio.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : bio.trimmingCharacters(in: .whitespacesAndNewlines),
                includeBio: true,
                bearerToken: token
            )
            onAccountChanged(updated)
            statusMessage = "Profile saved."
        } catch {
            statusMessage = error.localizedDescription
        }
        isSavingProfile = false
    }

    private func saveSettings() async {
        guard let token = authStore.accessToken else { return }

        isSavingSettings = true
        statusMessage = nil
        do {
            let updated = try await apiClient.updateSettings(settings, bearerToken: token)
            onAccountChanged(updated)
            statusMessage = "Settings saved."
        } catch {
            statusMessage = error.localizedDescription
        }
        isSavingSettings = false
    }

    private func deleteAccount() async {
        guard let token = authStore.accessToken else { return }

        isDeleting = true
        do {
            _ = try await apiClient.deleteAccount(bearerToken: token)
            await authStore.signOut()
        } catch {
            statusMessage = error.localizedDescription
        }
        isDeleting = false
    }
}

private struct ProfileFieldLabel: View {
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.caption.weight(.black))
            .foregroundStyle(NightloopTheme.inkMuted)
            .textCase(.uppercase)
    }
}

private struct DeleteAccountSheet: View {
    let isDeleting: Bool
    let deleteAccount: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Capsule()
                .fill(NightloopTheme.hairline)
                .frame(width: 44, height: 5)
                .frame(maxWidth: .infinity)

            Text("Delete account")
                .font(.title.weight(.black))
                .foregroundStyle(NightloopTheme.ink)

            Text("This anonymizes your Nightloop profile, removes settings/preferences, detaches your signal identity, and signs you out.")
                .font(.subheadline)
                .foregroundStyle(NightloopTheme.inkMuted)

            TextField("Type DELETE", text: $confirmation)
                .textInputAutocapitalization(.characters)
                .padding(12)
                .background(NightloopTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
                .foregroundStyle(NightloopTheme.ink)

            Button(role: .destructive) {
                deleteAccount()
            } label: {
                Text(isDeleting ? "Deleting..." : "Delete my account")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(confirmation != "DELETE" || isDeleting)

            Button("Cancel") {
                dismiss()
            }
            .frame(maxWidth: .infinity)
            .buttonStyle(.bordered)

            Spacer()
        }
        .padding(24)
        .background(OrchidBackground())
        .presentationDetents([.medium])
    }
}

private extension UserSettings {
    func with(
        ghostMode: Bool? = nil,
        mapShowNeighborhoodLabels: Bool? = nil,
        mapShowStreetGrid: Bool? = nil,
        pushSocialEnabled: Bool? = nil,
        pushDecisionEnabled: Bool? = nil,
        pushFavoriteVenueAlertsEnabled: Bool? = nil
    ) -> UserSettings {
        UserSettings(
            ghostMode: ghostMode ?? self.ghostMode,
            mapShowNeighborhoodLabels: mapShowNeighborhoodLabels ?? self.mapShowNeighborhoodLabels,
            mapShowStreetGrid: mapShowStreetGrid ?? self.mapShowStreetGrid,
            pushSocialEnabled: pushSocialEnabled ?? self.pushSocialEnabled,
            pushDecisionEnabled: pushDecisionEnabled ?? self.pushDecisionEnabled,
            pushFavoriteVenueAlertsEnabled: pushFavoriteVenueAlertsEnabled ?? self.pushFavoriteVenueAlertsEnabled
        )
    }
}
