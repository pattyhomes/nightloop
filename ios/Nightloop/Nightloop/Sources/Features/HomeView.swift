import SwiftUI

struct HomeView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse
    let preferences: [String: [String]]

    @State private var markets: [Market] = []
    @State private var selectedMarketID: String?
    @State private var selectedPulse: PulseFilter?
    @State private var venueFeed: VenueListResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var signalMessage: String?
    @State private var isShowingMarketSheet = false
    @State private var submittingVenueID: String?

    private var activeMarketID: String? {
        selectedMarketID ?? me.profile?.selectedMarketId ?? markets.first?.id
    }

    private var activeMarket: Market? {
        markets.first { $0.id == activeMarketID } ?? markets.first
    }

    private var personalizedItems: [VenueItem] {
        guard let venueFeed else { return [] }
        return VenuePreferenceTuner.boostedItems(venueFeed.items, preferences: preferences)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let venueFeed {
                    filterStrip(counts: venueFeed.counts)

                    if let hero = personalizedItems.first {
                        heroCard(hero)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Tonight's pulse")
                            .font(.headline)
                            .foregroundStyle(NightloopTheme.ink)

                        ForEach(personalizedItems.dropFirst()) { venue in
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
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    isShowingMarketSheet = true
                } label: {
                    Label(activeMarket?.shortLabel ?? "SF", systemImage: "location.fill")
                        .labelStyle(.titleAndIcon)
                }
                .tint(NightloopTheme.ink)
            }

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
        .sheet(isPresented: $isShowingMarketSheet) {
            MarketPickerSheet(markets: markets, selectedMarketID: activeMarketID) { market in
                selectedMarketID = market.id
                isShowingMarketSheet = false
                Task { await load() }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tonight in \(activeMarket?.shortLabel ?? "SF")")
                .font(.largeTitle.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
            Text("Live energy, tuned by your setup picks.")
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
                FilterPill(title: "All", count: counts.all, isSelected: selectedPulse == nil, color: NightloopTheme.purple) {
                    selectedPulse = nil
                    Task { await load() }
                }
                FilterPill(title: "Packed", count: counts.packed, isSelected: selectedPulse == .packed, color: NightloopTheme.rose) {
                    selectedPulse = .packed
                    Task { await load() }
                }
                FilterPill(title: "Active", count: counts.active, isSelected: selectedPulse == .active, color: NightloopTheme.amber) {
                    selectedPulse = .active
                    Task { await load() }
                }
                FilterPill(title: "Chill", count: counts.chill, isSelected: selectedPulse == .chill, color: NightloopTheme.cool) {
                    selectedPulse = .chill
                    Task { await load() }
                }
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

                    VenueArtView(venue: venue)

                    SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)

                    Text(VenuePreferenceTuner.reason(for: venue, preferences: preferences))
                        .font(.footnote)
                        .foregroundStyle(NightloopTheme.inkMuted)

                    SignalButton(title: "Tap Packed", systemImage: "flame.fill") {
                        Task { await submitSignal(venueID: venue.id, kind: .packed) }
                    }
                    .disabled(submittingVenueID == venue.id)
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
        venueFeed = nil
        do {
            let marketResponse = try await apiClient.markets()
            markets = marketResponse.items
            if selectedMarketID == nil {
                selectedMarketID = me.profile?.selectedMarketId ?? marketResponse.items.first?.id
            }
            guard let marketID = activeMarketID else {
                throw NightloopAPIError.transport(statusCode: 0, message: "No active market is configured.")
            }
            venueFeed = try await apiClient.venues(marketID: marketID, bearerToken: token, pulse: selectedPulse?.rawValue)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func submitSignal(venueID: String, kind: SignalKind) async {
        guard let token = authStore.accessToken else { return }
        guard submittingVenueID == nil else { return }

        submittingVenueID = venueID
        do {
            let result = try await apiClient.submitSignal(venueID: venueID, kind: kind, bearerToken: token)
            signalMessage = "+\(result.pointsAwarded) Signal Scout points"
            await load()
        } catch {
            signalMessage = error.localizedDescription
        }
        submittingVenueID = nil
    }
}

private enum PulseFilter: String, Equatable {
    case chill
    case active
    case packed
}

private struct FilterPill: View {
    let title: String
    let count: Int
    let isSelected: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                    .shadow(color: color.opacity(0.8), radius: 8)
                Text("\(title) · \(count)")
                    .font(.caption.weight(.semibold))
            }
            .foregroundStyle(NightloopTheme.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(isSelected ? color.opacity(0.22) : Color.white.opacity(0.05))
            .clipShape(Capsule())
            .overlay {
                Capsule().stroke(isSelected ? color.opacity(0.55) : NightloopTheme.hairline)
            }
        }
        .buttonStyle(.plain)
    }
}

struct VenueArtView: View {
    let venue: VenueItem

    var body: some View {
        if let urlString = venue.image?.url, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(height: 132)
                        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
                        .overlay(alignment: .bottomLeading) {
                            Text(venue.image?.creditText ?? "")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(NightloopTheme.inkMuted)
                                .padding(8)
                        }
                default:
                    fallback
                }
            }
        } else {
            fallback
        }
    }

    private var fallback: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    EnergyTone.from(score: venue.pulse.score).color.opacity(0.42),
                    NightloopTheme.purple.opacity(0.25),
                    NightloopTheme.surfaceElevated
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(venue.neighborhood.uppercased())
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                    Text(venue.name)
                        .font(.headline.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: symbol(for: venue.category))
                    .font(.title.weight(.black))
                    .foregroundStyle(EnergyTone.from(score: venue.pulse.score).color)
            }
            .padding(14)
        }
        .frame(height: 132)
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }

    private func symbol(for category: String) -> String {
        if category.contains("club") { return "music.quarternote.3" }
        if category.contains("live") { return "guitars.fill" }
        if category.contains("lounge") { return "sparkles" }
        return "wineglass.fill"
    }
}

private struct MarketPickerSheet: View {
    let markets: [Market]
    let selectedMarketID: String?
    let select: (Market) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(markets) { market in
                Button {
                    select(market)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(market.displayName)
                                .font(.headline)
                            Text(market.launchStatus.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selectedMarketID == market.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(NightloopTheme.good)
                        }
                    }
                }
                .disabled(market.launchStatus != "active")
            }
            .navigationTitle("Choose market")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
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
