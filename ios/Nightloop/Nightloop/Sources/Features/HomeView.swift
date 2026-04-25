import SwiftUI

struct HomeView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse

    @State private var markets: [Market] = []
    @State private var venueFeed: VenueListResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var signalMessage: String?

    private var selectedMarketID: String? {
        me.profile?.selectedMarketId ?? markets.first?.id
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let venueFeed {
                    filterStrip(counts: venueFeed.counts)

                    if let hero = venueFeed.items.first {
                        heroCard(hero)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Tonight's pulse")
                            .font(.headline)
                            .foregroundStyle(NightloopTheme.ink)

                        ForEach(venueFeed.items.dropFirst()) { venue in
                            NavigationLink {
                                VenueDetailView(apiClient: apiClient, authStore: authStore, venueID: venue.id, initialVenue: venue)
                            } label: {
                                VenueRow(venue: venue)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else if isLoading {
                    LoadingStateView(title: "Loading SF venues")
                } else if let errorMessage {
                    ErrorStateView(title: "Home feed unavailable", message: errorMessage) {
                        Task { await load() }
                    }
                } else {
                    EmptyStateView(title: "No venues yet", message: "The backend returned an empty feed for this market.")
                }
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Nightloop")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await load() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .tint(NightloopTheme.ink)
            }
        }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tonight in \(markets.first?.shortLabel ?? "SF")")
                .font(.largeTitle.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
            Text("Live signals, venue energy, and trusted nightlife picks.")
                .font(.subheadline)
                .foregroundStyle(NightloopTheme.inkMuted)

            if let signalMessage {
                Text(signalMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(NightloopTheme.good)
            }
        }
    }

    private func filterStrip(counts: VenueCounts) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                PulsePill(level: 3, label: "Packed", count: counts.packed)
                PulsePill(level: 2, label: "Active", count: counts.active)
                PulsePill(level: 1, label: "Chill", count: counts.chill)
            }
        }
    }

    private func heroCard(_ venue: VenueItem) -> some View {
        NavigationLink {
            VenueDetailView(apiClient: apiClient, authStore: authStore, venueID: venue.id, initialVenue: venue)
        } label: {
            NightloopCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        PulsePill(level: venue.pulse.level, label: venue.pulse.label)
                        Spacer()
                        EnergyScorePill(score: venue.pulse.score)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(venue.name)
                            .font(.title.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                        Text("\(venue.neighborhood) · \(venue.category.replacingOccurrences(of: "_", with: " "))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }

                    SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)

                    Text(venue.whyShort)
                        .font(.footnote)
                        .foregroundStyle(NightloopTheme.inkMuted)

                    SignalButton(title: "Tap Packed", systemImage: "flame.fill") {
                        Task { await submitSignal(venueID: venue.id, kind: .packed) }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        guard let token = authStore.accessToken else {
            errorMessage = "Your session is missing. Please sign in again."
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil
        do {
            let marketResponse = try await apiClient.markets()
            markets = marketResponse.items
            guard let marketID = selectedMarketID else {
                throw NightloopAPIError.transport(statusCode: 0, message: "No active market is configured.")
            }
            venueFeed = try await apiClient.venues(marketID: marketID, bearerToken: token)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func submitSignal(venueID: String, kind: SignalKind) async {
        guard let token = authStore.accessToken else { return }

        do {
            let result = try await apiClient.submitSignal(venueID: venueID, kind: kind, bearerToken: token)
            signalMessage = "+\(result.pointsAwarded) Signal Scout points"
            await load()
        } catch {
            signalMessage = error.localizedDescription
        }
    }
}

private struct VenueRow: View {
    let venue: VenueItem

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(EnergyTone.from(score: venue.pulse.score).color.opacity(0.18))
                    .frame(width: 46, height: 46)
                    .shadow(color: EnergyTone.from(score: venue.pulse.score).color.opacity(0.45), radius: 12)
                Circle()
                    .fill(EnergyTone.from(score: venue.pulse.score).color)
                    .frame(width: 12, height: 12)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(venue.name)
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)
                Text("\(venue.neighborhood) · \(venue.trend.capitalized)")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            Spacer()

            EnergyScorePill(score: venue.pulse.score, showLabel: false)
        }
        .padding(12)
        .background(NightloopTheme.surface.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}
