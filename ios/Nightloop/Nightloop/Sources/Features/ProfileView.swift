import SwiftUI

struct ProfileView: View {
    @ObservedObject var authStore: AuthStore
    let apiClient: NightloopAPIClient
    let me: MeResponse

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
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

                NightloopCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Signal Scout", systemImage: "sparkles")
                            .font(.headline)
                            .foregroundStyle(NightloopTheme.ink)
                        Text("\(me.user.signalScoutPoints) points")
                            .font(.title.weight(.black))
                            .foregroundStyle(NightloopTheme.fab)
                        Text("Signals decay on the backend; the app only sends a one-tap report.")
                            .font(.footnote)
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                settingsCard

                Button(role: .destructive) {
                    Task { await authStore.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var initials: String {
        let display = me.profile?.displayName ?? "Nightloop User"
        let parts = display.split(separator: " ")
        let firstTwo = parts.prefix(2).compactMap { $0.first }
        return firstTwo.isEmpty ? "NL" : String(firstTwo)
    }

    private var settingsCard: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Settings smoke", systemImage: "gearshape.fill")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)
                SettingLine(label: "Ghost mode", enabled: me.settings?.ghostMode ?? false)
                SettingLine(label: "Neighborhood labels", enabled: me.settings?.mapShowNeighborhoodLabels ?? true)
                SettingLine(label: "Street grid", enabled: me.settings?.mapShowStreetGrid ?? true)
                Text("Full editable settings arrive in Phase 4. Map preferences move here from the design-time Tweaks panel.")
                    .font(.footnote)
                    .foregroundStyle(NightloopTheme.inkDim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct SettingLine: View {
    let label: String
    let enabled: Bool

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(NightloopTheme.inkMuted)
            Spacer()
            Image(systemName: enabled ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(enabled ? NightloopTheme.good : NightloopTheme.inkDim)
        }
        .font(.subheadline)
    }
}
