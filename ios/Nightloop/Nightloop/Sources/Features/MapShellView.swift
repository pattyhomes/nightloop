import SwiftUI

struct MapShellView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse

    @State private var venues: [VenueItem] = []
    @State private var counts: VenueCounts?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Map")
                        .font(.largeTitle.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("Mapbox arrives in Phase 5. This smoke view proves market-aware live venue data first.")
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                if let counts {
                    HStack(spacing: 8) {
                        PulsePill(level: 3, label: "Packed", count: counts.packed)
                        PulsePill(level: 2, label: "Active", count: counts.active)
                    }
                }

                NightloopCard {
                    ZStack {
                        RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium)
                            .fill(
                                LinearGradient(
                                    colors: [NightloopTheme.surfaceElevated, NightloopTheme.background],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(height: 360)
                            .overlay {
                                GridPattern()
                                    .stroke(NightloopTheme.hairlineSoft, lineWidth: 1)
                            }

                        ForEach(Array(venues.prefix(16).enumerated()), id: \.element.id) { index, venue in
                            let x = CGFloat((index * 37) % 240) - 120
                            let y = CGFloat((index * 53) % 280) - 140
                            Circle()
                                .fill(EnergyTone.from(score: venue.pulse.score).color)
                                .frame(width: 12, height: 12)
                                .shadow(color: EnergyTone.from(score: venue.pulse.score).color.opacity(0.75), radius: 16)
                                .offset(x: x, y: y)
                        }
                    }
                }

                if isLoading {
                    LoadingStateView(title: "Loading map data")
                } else if let errorMessage {
                    ErrorStateView(title: "Map data unavailable", message: errorMessage) {
                        Task { await load() }
                    }
                } else {
                    ForEach(venues.prefix(6)) { venue in
                        VenueMapMiniRow(venue: venue)
                    }
                }
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle("Map")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let token = authStore.accessToken else {
            errorMessage = "Your session is missing."
            isLoading = false
            return
        }

        guard let marketID = me.profile?.selectedMarketId else {
            errorMessage = "No selected market found."
            isLoading = false
            return
        }

        isLoading = true
        do {
            let response = try await apiClient.venues(marketID: marketID, bearerToken: token, limit: 40)
            venues = response.items
            counts = response.counts
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private struct GridPattern: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let spacing: CGFloat = 42
        var x = rect.minX
        while x <= rect.maxX {
            path.move(to: CGPoint(x: x, y: rect.minY))
            path.addLine(to: CGPoint(x: x, y: rect.maxY))
            x += spacing
        }

        var y = rect.minY
        while y <= rect.maxY {
            path.move(to: CGPoint(x: rect.minX, y: y))
            path.addLine(to: CGPoint(x: rect.maxX, y: y))
            y += spacing
        }
        return path
    }
}

private struct VenueMapMiniRow: View {
    let venue: VenueItem

    var body: some View {
        HStack {
            PulsePill(level: venue.pulse.level, label: venue.pulse.label)
            VStack(alignment: .leading) {
                Text(venue.name)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                Text(venue.neighborhood)
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }
            Spacer()
        }
    }
}
