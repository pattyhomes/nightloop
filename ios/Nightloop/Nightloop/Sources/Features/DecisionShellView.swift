import SwiftUI

struct DecisionShellView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Decision")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)

                NightloopCard {
                    VStack(alignment: .leading, spacing: 16) {
                        PulsePill(level: 2, label: "Future backend")
                        Text("Group decision mode")
                            .font(.title2.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                        Text("The v3 design calls for swipe voting, live X/Y counters, invites, and a night-of session TTL. The shell is ready, while the group-session backend stays in Phase 7.")
                            .font(.subheadline)
                            .foregroundStyle(NightloopTheme.inkMuted)
                        HStack(spacing: 10) {
                            DecisionAction(title: "Skip", symbol: "xmark")
                            DecisionAction(title: "Details", symbol: "info.circle")
                            DecisionAction(title: "I'm In", symbol: "checkmark")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Decision")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DecisionAction: View {
    let title: String
    let symbol: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.headline)
            Text(title)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(NightloopTheme.ink)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(NightloopTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
    }
}
