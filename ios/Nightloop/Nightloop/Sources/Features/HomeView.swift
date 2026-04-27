import SwiftUI

struct HomeView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse
    let preferences: [String: [String]]
    let onAccountChanged: (MeResponse) -> Void

    @State private var markets: [Market] = []
    @State private var selectedMarketID: String?
    @State private var selectedPulse: PulseFilter?
    @State private var venueFeed: VenueListResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var signalMessage: String?
    @State private var isShowingMarketSheet = false

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
        ZStack(alignment: .bottom) {
            OrchidBackground(animated: true, gridOpacity: 0.035)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header

                    if let venueFeed {
                        livePulseStrip(counts: venueFeed.counts)
                        filterStrip(counts: venueFeed.counts)

                        if let hero = personalizedItems.first {
                            heroCard(hero)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            NightloopSectionHeader(title: "Tonight's pulse", trailing: "\(max(personalizedItems.count - 1, 0)) more")

                            ForEach(personalizedItems.dropFirst()) { venue in
                                NavigationLink {
                                    VenueDetailView(
                                        apiClient: apiClient,
                                        authStore: authStore,
                                        venueID: venue.id,
                                        initialVenue: venue,
                                        onAccountChanged: onAccountChanged
                                    )
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
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 18)
            }

            if let signalMessage {
                SignalToast(message: signalMessage, isError: !signalMessage.contains("+"))
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
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
        HStack(alignment: .bottom, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(currentNightLabel.uppercased())
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Button {
                    isShowingMarketSheet = true
                } label: {
                    HStack(spacing: 7) {
                        Text("Tonight in \(activeMarket?.shortLabel ?? "SF")")
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundStyle(NightloopTheme.ink)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                }
                .buttonStyle(.plain)
            }

            Spacer()

            GlassIconButton(systemName: "arrow.clockwise") {
                Task { await load() }
            }
        }
    }

    private var currentNightLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE · MMMM d"
        return formatter.string(from: Date())
    }

    private func livePulseStrip(counts: VenueCounts) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(NightloopTheme.rose.opacity(0.35))
                    .frame(width: 30, height: 30)
                    .shadow(color: NightloopTheme.rose.opacity(0.65), radius: 14)
                Circle()
                    .fill(.white)
                    .frame(width: 10, height: 10)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("LIVE PULSE")
                    .font(.caption2.weight(.black))
                    .tracking(1.5)
                    .foregroundStyle(Color(hex: "#e9d5ff"))
                Text("\(counts.packed) packed · \(counts.active) active · \(counts.chill) chill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
            }

            Spacer()

            Text(Date().formatted(date: .omitted, time: .shortened))
                .font(.caption.monospaced().weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            LinearGradient(
                colors: [NightloopTheme.purpleSoft, NightloopTheme.rose.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.purpleEdge)
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
            VenueDetailView(
                apiClient: apiClient,
                authStore: authStore,
                venueID: venue.id,
                initialVenue: venue,
                onAccountChanged: onAccountChanged
            )
        } label: {
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    VenueArtView(venue: venue, height: 200, cornerRadius: 0)
                    HStack(spacing: 6) {
                        PulsePill(level: venue.pulse.level, label: venue.pulse.label)
                        Text("#1 tonight")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.black.opacity(0.42))
                            .clipShape(Capsule())
                    }
                    .padding(14)
                }

                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            NightloopSectionHeader(title: "\(venue.pulse.label) · \(venue.trend)", trailing: "\(venue.signalCount) signals")
                        }
                        Text(venue.name)
                            .font(.title.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                        Text("\(venue.neighborhood) · \(venue.category.replacingOccurrences(of: "_", with: " "))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }

                    SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)

                    Text(VenuePreferenceTuner.reason(for: venue, preferences: preferences))
                        .font(.footnote)
                        .foregroundStyle(NightloopTheme.inkMuted)

                    SignalButton(title: "Verify at venue", systemImage: "location.fill") {
                        signalMessage = "Open details or the map to verify you're there before signaling."
                    }
                }
                .padding(16)
            }
            .background(NightloopTheme.surface.opacity(0.88))
            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerLarge, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NightloopTheme.cornerLarge, style: .continuous)
                    .stroke(NightloopTheme.hairline)
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
            HStack(spacing: 5) {
                Circle()
                    .fill(color)
                    .frame(width: 7, height: 7)
                    .shadow(color: color.opacity(0.8), radius: 8)
                Text("\(title) · \(count)")
                    .font(.caption2.weight(.bold))
            }
            .foregroundStyle(NightloopTheme.ink)
            .padding(.horizontal, 8)
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
    var height: CGFloat = 132
    var cornerRadius: CGFloat = NightloopTheme.cornerMedium

    var body: some View {
        if let urlString = venue.image?.url, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(height: height)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
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
            VenueFallbackArt(
                title: venue.name,
                subtitle: venue.neighborhood,
                score: venue.pulse.score,
                height: height,
                cornerRadius: cornerRadius,
                symbol: symbol(for: venue.category)
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
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
            if venue.image?.url != nil {
                VenueArtView(venue: venue, height: 58, cornerRadius: 10)
                    .frame(width: 58, height: 58)
                    .clipped()
            } else {
                VenuePulseTile(venue: venue)
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(EnergyTone.from(score: venue.pulse.score).color)
                        .frame(width: 6, height: 6)
                    Text("\(venue.pulse.label) · \(venue.trend)")
                        .font(.caption2.weight(.black))
                        .tracking(1.1)
                        .foregroundStyle(EnergyTone.from(score: venue.pulse.score).color)
                        .lineLimit(1)
                }

                Text(venue.name)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                Text("\(venue.neighborhood) · \(venue.trend.capitalized)")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 5) {
                SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)
                    .frame(width: 54, height: 20)
                EnergyScorePill(score: venue.pulse.score, showLabel: false)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}

private struct VenuePulseTile: View {
    let venue: VenueItem

    private var tone: EnergyTone {
        EnergyTone.from(score: venue.pulse.score)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [tone.color.opacity(0.55), NightloopTheme.purple.opacity(0.22), NightloopTheme.surfaceElevated],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
                .frame(width: 34, height: 34)

            Image(systemName: symbol(for: venue.category))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white.opacity(0.92))
                .shadow(color: tone.color.opacity(0.7), radius: 8)
        }
        .frame(width: 58, height: 58)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(tone.color.opacity(0.3))
        }
    }

    private func symbol(for category: String) -> String {
        if category.contains("club") { return "music.quarternote.3" }
        if category.contains("live") { return "guitars.fill" }
        if category.contains("lounge") { return "sparkles" }
        if category.contains("karaoke") { return "mic.fill" }
        return "wineglass.fill"
    }
}
