import SwiftUI

struct VenueDetailView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let venueID: String
    let initialVenue: VenueItem?

    @State private var detail: VenueDetailResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true
    @State private var signalMessage: String?

    var venue: VenueItem? {
        detail?.venue ?? initialVenue
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let venue {
                    detailHeader(venue)
                    signalGrid(venue)
                    infoSection(venue)
                } else if isLoading {
                    LoadingStateView(title: "Loading venue")
                } else if let errorMessage {
                    ErrorStateView(title: "Venue unavailable", message: errorMessage) {
                        Task { await load() }
                    }
                }
            }
            .padding(20)
        }
        .background(OrchidBackground())
        .navigationTitle(venue?.name ?? "Venue")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func detailHeader(_ venue: VenueItem) -> some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    PulsePill(level: venue.pulse.level, label: venue.pulse.label)
                    Spacer()
                    EnergyScorePill(score: venue.pulse.score)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(venue.name)
                        .font(.largeTitle.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)

                    Text("\(venue.neighborhood) · \(venue.category.replacingOccurrences(of: "_", with: " "))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)

                if let eventTitle = venue.event?.title {
                    Label(eventTitle, systemImage: "music.note")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NightloopTheme.amber)
                }

                if let signalMessage {
                    Text(signalMessage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(NightloopTheme.good)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func signalGrid(_ venue: VenueItem) -> some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Send a signal")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(SignalKind.allCases) { kind in
                        Button {
                            Task { await submitSignal(venueID: venue.id, kind: kind) }
                        } label: {
                            Label(kind.label, systemImage: kind.symbol)
                                .font(.caption.weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        }
                        .buttonStyle(.bordered)
                        .tint(kind == .packed ? NightloopTheme.fab : NightloopTheme.purple)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func infoSection(_ venue: VenueItem) -> some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label("Live state", systemImage: "waveform.path.ecg")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)

                DetailLine(label: "Signals", value: "\(venue.signalCount) total · \(venue.recentSignalCount) recent")
                DetailLine(label: "Wait", value: venue.waitMinutes.map { "\($0) min" } ?? "Unknown")
                DetailLine(label: "Confidence", value: venue.confidence.capitalized)
                DetailLine(label: "Coordinates", value: String(format: "%.4f, %.4f", venue.coordinate.latitude, venue.coordinate.longitude))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
            detail = try await apiClient.venue(id: venueID, bearerToken: token)
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

private struct DetailLine: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(NightloopTheme.inkMuted)
            Spacer()
            Text(value)
                .foregroundStyle(NightloopTheme.ink)
                .fontWeight(.semibold)
        }
        .font(.subheadline)
    }
}
