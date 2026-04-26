import SwiftUI

struct ProfileSetupView: View {
    let me: MeResponse
    let markets: [Market]
    let isSaving: Bool
    let errorMessage: String?
    let save: (String, String, String?, String?) -> Void
    let signOut: () -> Void

    @State private var displayName: String
    @State private var username: String
    @State private var bio: String
    @State private var selectedMarketID: String?

    init(
        me: MeResponse,
        markets: [Market],
        isSaving: Bool,
        errorMessage: String?,
        save: @escaping (String, String, String?, String?) -> Void,
        signOut: @escaping () -> Void
    ) {
        self.me = me
        self.markets = markets
        self.isSaving = isSaving
        self.errorMessage = errorMessage
        self.save = save
        self.signOut = signOut

        let existingName = me.profile?.displayName == "Nightloop User" ? "" : (me.profile?.displayName ?? "")
        _displayName = State(initialValue: existingName)
        _username = State(initialValue: me.profile?.username ?? "")
        _bio = State(initialValue: me.profile?.bio ?? "")
        _selectedMarketID = State(initialValue: me.profile?.selectedMarketId ?? markets.first?.id)
    }

    private var canSave: Bool {
        !normalizedDisplayName.isEmpty && usernameError == nil && selectedMarketID != nil && !isSaving
    }

    private var normalizedDisplayName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var usernameError: String? {
        if normalizedUsername.count < 3 { return "Username must be at least 3 characters." }
        if normalizedUsername.count > 24 { return "Username must be 24 characters or fewer." }
        if normalizedUsername.range(of: #"^[a-z0-9_]+$"#, options: .regularExpression) == nil {
            return "Use lowercase letters, numbers, and underscores only."
        }
        return nil
    }

    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.055)

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 12) {
                        PulsePill(level: 2, label: "Profile")
                        Text("Set up your profile.")
                            .font(.system(size: 36, weight: .black))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineSpacing(-2)
                        Text("Choose the name people see on signals. You can edit this later from Profile.")
                            .font(.subheadline.weight(.semibold))
                            .lineSpacing(4)
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }

                    HStack(spacing: 10) {
                        StatMiniCard(value: "21+", label: "Verified", color: NightloopTheme.good)
                        StatMiniCard(value: "SF", label: "Home market", color: NightloopTheme.rose)
                    }

                    NightloopCard(fill: Color.white.opacity(0.045)) {
                        VStack(alignment: .leading, spacing: 14) {
                            FieldLabel("Display name")
                            nightloopTextField("Alex", text: $displayName)
                                .textContentType(.name)

                            FieldLabel("Username")
                            HStack(spacing: 4) {
                                Text("@")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(NightloopTheme.inkMuted)
                                TextField("alexsf", text: $username)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .foregroundStyle(NightloopTheme.ink)
                            }
                            .padding(13)
                            .background(NightloopTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))

                            if let usernameError {
                                Text(usernameError)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(NightloopTheme.amber)
                            }

                            FieldLabel("Home market")
                            Picker("Home market", selection: Binding(
                                get: { selectedMarketID ?? markets.first?.id },
                                set: { selectedMarketID = $0 }
                            )) {
                                ForEach(markets) { market in
                                    Text(market.displayName).tag(Optional(market.id))
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(NightloopTheme.ink)
                            .padding(.horizontal, 4)

                            FieldLabel("Bio")
                            nightloopTextField("Optional", text: $bio, axis: .vertical)
                                .lineLimit(2...4)
                        }
                    }

                    if let errorMessage {
                        ErrorStateView(title: "Profile save failed", message: errorMessage)
                    }

                    NightloopPrimaryButton(
                        title: "Continue",
                        systemImage: "arrow.right",
                        isLoading: isSaving,
                        isEnabled: canSave
                    ) {
                        save(
                            normalizedDisplayName,
                            normalizedUsername,
                            selectedMarketID,
                            bio.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : bio.trimmingCharacters(in: .whitespacesAndNewlines)
                        )
                    }

                    Button("Sign out", action: signOut)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .frame(maxWidth: .infinity)
                }
                .padding(24)
                .padding(.top, 44)
            }
        }
    }

    private func nightloopTextField(
        _ placeholder: String,
        text: Binding<String>,
        axis: Axis = .horizontal
    ) -> some View {
        TextField(placeholder, text: text, axis: axis)
            .padding(13)
            .background(NightloopTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
            .foregroundStyle(NightloopTheme.ink)
    }
}

private struct FieldLabel: View {
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
