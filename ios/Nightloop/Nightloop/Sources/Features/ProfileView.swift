import SwiftUI

struct ProfileView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient
    let me: MeResponse
    let onAccountChanged: (MeResponse) -> Void

    @State private var settings = UserSettings.fallback
    @State private var recentSignals: [RecentSignalItem] = []
    @State private var isLoadingSignals = false
    @State private var recentSignalError: String?
    @State private var settingsStatus: String?
    @State private var profileStatus: String?
    @State private var isSavingProfile = false
    @State private var isDeleting = false
    @State private var showEditProfile = false
    @State private var showDeleteSheet = false

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.035)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    topHeader
                    profileHeader
                    signalScoutCard
                    statsRow
                    crewCard
                    recentSignalsCard
                }
                .padding(20)
                .padding(.top, 6)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            hydrateLocalState()
            await loadRecentSignals()
        }
        .sheet(isPresented: $showEditProfile) {
            EditProfileSheet(
                profile: me.profile,
                isSaving: isSavingProfile,
                statusMessage: profileStatus
            ) { displayName, username, bio in
                await saveProfile(displayName: displayName, username: username, bio: bio)
            }
        }
        .sheet(isPresented: $showDeleteSheet) {
            DeleteAccountSheet(isDeleting: isDeleting) {
                Task { await deleteAccount() }
            }
        }
    }

    private var topHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("YOUR NIGHTLOOP")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text("Profile")
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.ink)
            }
            Spacer()
            NavigationLink {
                SettingsHubView(
                    authStore: authStore,
                    settings: $settings,
                    statusMessage: $settingsStatus,
                    saveSettings: saveSettings,
                    showDeleteSheet: { showDeleteSheet = true }
                )
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .frame(width: 38, height: 38)
                    .background(Color.white.opacity(0.07))
                    .clipShape(Circle())
                    .overlay { Circle().stroke(NightloopTheme.hairline) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open settings")
        }
    }

    private var profileHeader: some View {
        HStack(spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                AvatarInitials(initials: initials, color: NightloopTheme.rose)
                    .frame(width: 68, height: 68)
                    .scaleEffect(1.35)
                Circle()
                    .fill(settings.ghostMode ? NightloopTheme.amber : NightloopTheme.good)
                    .frame(width: 22, height: 22)
                    .overlay { Circle().stroke(NightloopTheme.background, lineWidth: 3) }
            }
            .frame(width: 74, height: 74)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(me.profile?.displayName ?? "Nightloop User")
                            .font(.title2.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(1)
                        Text("@\(me.profile?.username ?? "nightloop")")
                            .font(.subheadline)
                            .foregroundStyle(NightloopTheme.inkMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    Button {
                        profileStatus = nil
                        showEditProfile = true
                    } label: {
                        Image(systemName: "pencil")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .frame(width: 30, height: 30)
                            .background(Color.white.opacity(0.07))
                            .clipShape(Circle())
                            .overlay { Circle().stroke(NightloopTheme.hairline) }
                    }
                    .accessibilityLabel("Edit profile")
                }

                if let bio = me.profile?.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.caption)
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .lineLimit(2)
                }

                HStack(spacing: 5) {
                    Circle()
                        .fill(settings.ghostMode ? NightloopTheme.amber : NightloopTheme.good)
                        .frame(width: 5, height: 5)
                    Text(settings.ghostMode ? "Ghost mode on" : "Ready for tonight")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(settings.ghostMode ? NightloopTheme.amber : NightloopTheme.good)
                }
            }
        }
    }

    private var signalScoutCard: some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    NightloopSectionHeader(title: "Signal Scout · Lv.1")
                    Spacer()
                    Text("\(max(100 - me.user.signalScoutPoints % 100, 0)) to next")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkDim)
                }
                Text("\(me.user.signalScoutPoints) points")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.fab)
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.08))
                        Capsule()
                            .fill(LinearGradient(colors: [NightloopTheme.purple, NightloopTheme.rose], startPoint: .leading, endPoint: .trailing))
                            .frame(width: max(18, geometry.size.width * min(CGFloat(me.user.signalScoutPoints % 100) / 100, 1)))
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            StatMiniCard(value: "\(me.user.signalScoutPoints)", label: "Points")
            StatMiniCard(value: "\(recentSignals.count)", label: "Recent", color: NightloopTheme.rose)
            StatMiniCard(value: (settings.ghostMode ? "On" : "Off"), label: "Ghost", color: settings.ghostMode ? NightloopTheme.amber : NightloopTheme.good)
        }
    }

    private var crewCard: some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(NightloopTheme.purpleSoft)
                        .frame(width: 42, height: 42)
                    Image(systemName: "person.2.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NightloopTheme.purple)
                }

                VStack(alignment: .leading, spacing: 3) {
                    NightloopSectionHeader(title: "Your crew", trailing: "Soon")
                    Text("Friends, presence, and group plans will land here once the social phase is wired.")
                        .font(.caption)
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var recentSignalsCard: some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            VStack(alignment: .leading, spacing: 12) {
                NightloopSectionHeader(title: "Your signals", trailing: "Latest")

                if isLoadingSignals {
                    LoadingStateView(title: "Loading your signals")
                        .frame(minHeight: 120)
                } else if let recentSignalError {
                    ErrorStateView(title: "Signal history unavailable", message: recentSignalError) {
                        Task { await loadRecentSignals() }
                    }
                } else if recentSignals.isEmpty {
                    EmptyStateView(
                        title: "No signals yet",
                        message: "Tap a signal on a venue tonight and it will show up here with your Signal Scout points."
                    )
                } else {
                    VStack(spacing: 8) {
                        ForEach(recentSignals) { signal in
                            RecentSignalRow(signal: signal)
                        }
                    }
                }
            }
        }
    }

    private var initials: String {
        let display = me.profile?.displayName ?? "Nightloop User"
        let parts = display.split(separator: " ")
        let firstTwo = parts.prefix(2).compactMap { $0.first }
        return firstTwo.isEmpty ? "NL" : String(firstTwo)
    }

    private func hydrateLocalState() {
        settings = me.settings ?? .fallback
    }

    private func loadRecentSignals() async {
        guard let token = authStore.accessToken else { return }

        isLoadingSignals = true
        recentSignalError = nil
        do {
            recentSignals = try await apiClient.recentSignals(bearerToken: token, limit: 5).items
        } catch {
            recentSignalError = error.localizedDescription
        }
        isLoadingSignals = false
    }

    private func saveProfile(displayName: String, username: String, bio: String) async -> Bool {
        guard let token = authStore.accessToken else { return false }

        isSavingProfile = true
        profileStatus = nil
        do {
            let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            let updated = try await apiClient.updateProfile(
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                username: username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                selectedMarketId: me.profile?.selectedMarketId,
                bio: trimmedBio.isEmpty ? nil : trimmedBio,
                includeBio: true,
                bearerToken: token
            )
            onAccountChanged(updated)
            profileStatus = "Profile saved."
            isSavingProfile = false
            return true
        } catch {
            profileStatus = error.localizedDescription
            isSavingProfile = false
            return false
        }
    }

    private func saveSettings(_ updatedSettings: UserSettings) async -> Bool {
        guard let token = authStore.accessToken else { return false }

        settingsStatus = "Saving..."
        do {
            let updated = try await apiClient.updateSettings(updatedSettings, bearerToken: token)
            settings = updated.settings ?? updatedSettings
            onAccountChanged(updated)
            settingsStatus = "Saved."
            return true
        } catch {
            settingsStatus = error.localizedDescription
            return false
        }
    }

    private func deleteAccount() async {
        guard let token = authStore.accessToken else { return }

        isDeleting = true
        do {
            _ = try await apiClient.deleteAccount(bearerToken: token)
            await authStore.signOut()
        } catch {
            settingsStatus = error.localizedDescription
        }
        isDeleting = false
    }
}

private struct EditProfileSheet: View {
    let profile: UserProfile?
    let isSaving: Bool
    let statusMessage: String?
    let save: (String, String, String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var displayName: String
    @State private var username: String
    @State private var bio: String

    init(
        profile: UserProfile?,
        isSaving: Bool,
        statusMessage: String?,
        save: @escaping (String, String, String) async -> Bool
    ) {
        self.profile = profile
        self.isSaving = isSaving
        self.statusMessage = statusMessage
        self.save = save
        _displayName = State(initialValue: profile?.displayName ?? "")
        _username = State(initialValue: profile?.username ?? "")
        _bio = State(initialValue: profile?.bio ?? "")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                OrchidBackground(animated: true, gridOpacity: 0.035)
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        NightloopSectionHeader(title: "Identity")

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

                        if let statusMessage {
                            Text(statusMessage)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(statusMessage.localizedCaseInsensitiveContains("saved") ? NightloopTheme.good : NightloopTheme.amber)
                        }

                        NightloopPrimaryButton(
                            title: "Save profile",
                            systemImage: "checkmark",
                            isLoading: isSaving,
                            isEnabled: canSaveProfile
                        ) {
                            Task {
                                if await save(displayName, username, bio) {
                                    dismiss()
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
    }

    private var canSaveProfile: Bool {
        !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && username.trimmingCharacters(in: .whitespacesAndNewlines).range(of: #"^[a-z0-9_]{3,24}$"#, options: .regularExpression) != nil
    }
}

private struct SettingsHubView: View {
    @ObservedObject var authStore: AuthStore
    @Binding var settings: UserSettings
    @Binding var statusMessage: String?
    let saveSettings: (UserSettings) async -> Bool
    let showDeleteSheet: () -> Void

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.035)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SettingsStatusText(statusMessage)
                    SettingsHubRow(title: "Privacy", subtitle: "Ghost mode and presence", systemImage: "eye.slash.fill") {
                        PrivacySettingsView(settings: $settings, statusMessage: $statusMessage, saveSettings: saveSettings)
                    }
                    SettingsHubRow(title: "Map", subtitle: "Neighborhood labels and street grid", systemImage: "map.fill") {
                        MapSettingsView(settings: $settings, statusMessage: $statusMessage, saveSettings: saveSettings)
                    }
                    SettingsHubRow(title: "Notifications", subtitle: "Social, decision, and venue alerts", systemImage: "bell.badge.fill") {
                        NotificationSettingsView(settings: $settings, statusMessage: $statusMessage, saveSettings: saveSettings)
                    }
                    SettingsHubRow(title: "Account", subtitle: "Sign out or delete account", systemImage: "person.crop.circle.fill") {
                        AccountSettingsView(authStore: authStore, showDeleteSheet: showDeleteSheet)
                    }
                }
                .padding(20)
            }
        }
        .toolbar(.visible, for: .navigationBar)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct PrivacySettingsView: View {
    @Binding var settings: UserSettings
    @Binding var statusMessage: String?
    let saveSettings: (UserSettings) async -> Bool

    var body: some View {
        SettingsSubpage(title: "Privacy", statusMessage: statusMessage) {
            AutoSavingToggle(
                title: "Ghost mode",
                subtitle: "Hide presence and check-in visibility from future social surfaces.",
                isOn: settings.ghostMode
            ) { value in
                await update(settings.with(ghostMode: value))
            }
        }
    }

    private func update(_ updated: UserSettings) async {
        settings = updated
        _ = await saveSettings(updated)
    }
}

private struct MapSettingsView: View {
    @Binding var settings: UserSettings
    @Binding var statusMessage: String?
    let saveSettings: (UserSettings) async -> Bool

    var body: some View {
        SettingsSubpage(title: "Map", statusMessage: statusMessage) {
            AutoSavingToggle(title: "Neighborhood labels", subtitle: "Show market neighborhood names on the map.", isOn: settings.mapShowNeighborhoodLabels) { value in
                await update(settings.with(mapShowNeighborhoodLabels: value))
            }
            AutoSavingToggle(title: "Street grid", subtitle: "Show street grid detail when the map phase lands.", isOn: settings.mapShowStreetGrid) { value in
                await update(settings.with(mapShowStreetGrid: value))
            }
        }
    }

    private func update(_ updated: UserSettings) async {
        settings = updated
        _ = await saveSettings(updated)
    }
}

private struct NotificationSettingsView: View {
    @Binding var settings: UserSettings
    @Binding var statusMessage: String?
    let saveSettings: (UserSettings) async -> Bool

    var body: some View {
        SettingsSubpage(title: "Notifications", statusMessage: statusMessage) {
            AutoSavingToggle(title: "Social notifications", subtitle: "Friend activity and group updates once social ships.", isOn: settings.pushSocialEnabled) { value in
                await update(settings.with(pushSocialEnabled: value))
            }
            AutoSavingToggle(title: "Decision notifications", subtitle: "Group voting and plan result updates.", isOn: settings.pushDecisionEnabled) { value in
                await update(settings.with(pushDecisionEnabled: value))
            }
            AutoSavingToggle(title: "Favorite venue alerts", subtitle: "Future alerts for venues you care about.", isOn: settings.pushFavoriteVenueAlertsEnabled) { value in
                await update(settings.with(pushFavoriteVenueAlertsEnabled: value))
            }
            Text("These preferences save now. The iOS permission prompt waits until notification features exist.")
                .font(.caption)
                .foregroundStyle(NightloopTheme.inkDim)
        }
    }

    private func update(_ updated: UserSettings) async {
        settings = updated
        _ = await saveSettings(updated)
    }
}

private struct AccountSettingsView: View {
    @ObservedObject var authStore: AuthStore
    let showDeleteSheet: () -> Void

    var body: some View {
        SettingsSubpage(title: "Account", statusMessage: nil) {
            Button {
                Task { await authStore.signOut() }
            } label: {
                Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button(role: .destructive) {
                showDeleteSheet()
            } label: {
                Label("Delete account", systemImage: "trash.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }
}

private struct SettingsSubpage<Content: View>: View {
    let title: String
    let statusMessage: String?
    let content: Content

    init(title: String, statusMessage: String?, @ViewBuilder content: () -> Content) {
        self.title = title
        self.statusMessage = statusMessage
        self.content = content()
    }

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.035)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SettingsStatusText(statusMessage)
                    content
                }
                .padding(20)
            }
        }
        .toolbar(.visible, for: .navigationBar)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SettingsHubRow<Destination: View>: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let destination: Destination

    init(title: String, subtitle: String, systemImage: String, @ViewBuilder destination: () -> Destination) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.destination = destination()
    }

    var body: some View {
        NavigationLink {
            destination
        } label: {
            NightloopCard(fill: Color.white.opacity(0.04)) {
                HStack(spacing: 12) {
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NightloopTheme.purple)
                        .frame(width: 36, height: 36)
                        .background(NightloopTheme.purpleSoft)
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(NightloopTheme.ink)
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.inkDim)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct AutoSavingToggle: View {
    let title: String
    let subtitle: String
    let isOn: Bool
    let update: (Bool) async -> Void

    var body: some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            Toggle(isOn: Binding(
                get: { isOn },
                set: { value in Task { await update(value) } }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(NightloopTheme.ink)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
            }
            .tint(NightloopTheme.fab)
        }
    }
}

private struct SettingsStatusText: View {
    let statusMessage: String?

    init(_ statusMessage: String?) {
        self.statusMessage = statusMessage
    }

    var body: some View {
        if let statusMessage {
            Text(statusMessage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(statusMessage == "Saved." ? NightloopTheme.good : NightloopTheme.amber)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct RecentSignalRow: View {
    let signal: RecentSignalItem

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: signal.kind.symbol)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)
                .frame(width: 36, height: 36)
                .background(kindColor.opacity(0.22))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(kindColor.opacity(0.35))
                }

            VStack(alignment: .leading, spacing: 3) {
                Text(signal.kind.label)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                Text("\(signal.venueName) · \(signal.venueNeighborhood)")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("+\(signal.pointsAwarded)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.good)
                Text(relativeTime(signal.observedAt))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkDim)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }

    private var kindColor: Color {
        switch signal.kind {
        case .packed: return NightloopTheme.rose
        case .shortLine: return NightloopTheme.good
        case .longLine: return NightloopTheme.amber
        case .dead: return NightloopTheme.cool
        case .eventLive: return NightloopTheme.purple
        }
    }

    private func relativeTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        guard let date else { return "recent" }
        return date.formatted(.relative(presentation: .numeric))
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
