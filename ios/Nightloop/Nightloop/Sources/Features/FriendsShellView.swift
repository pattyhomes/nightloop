import SwiftUI

struct FriendsShellView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Friends")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)

                NightloopCard {
                    VStack(alignment: .leading, spacing: 16) {
                        PulsePill(level: 1, label: "Social phase")
                        Text("Friends activity feed")
                            .font(.title2.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                        Text("This tab keeps the v3 shape for check-ins, signal replies, and \"I'm Coming\" actions. Real feed sync, block/report, contacts, and notifications wait for Phase 6.")
                            .font(.subheadline)
                            .foregroundStyle(NightloopTheme.inkMuted)

                        FriendPreview(initials: "MM", name: "Maya", detail: "Halcyon · 7m ago")
                        FriendPreview(initials: "RS", name: "Rosa", detail: "Short line signal")
                        FriendPreview(initials: "DV", name: "Devon", detail: "Trick Dog · got a booth")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Friends")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct FriendPreview: View {
    let initials: String
    let name: String
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            AvatarInitials(initials: initials)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }
            Spacer()
            Button("I'm Coming") {}
                .font(.caption.weight(.bold))
                .buttonStyle(.bordered)
                .tint(NightloopTheme.purple)
        }
    }
}
