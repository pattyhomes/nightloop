import SwiftUI

struct VenueDetailView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let venueID: String
    let initialVenue: VenueItem?
    let onAccountChanged: (MeResponse) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationManager = NightloopLocationManager()
    @State private var detail: VenueDetailResponse?
    @State private var errorMessage: String?
    @State private var isLoading = true
    @State private var signalMessage: String?
    @State private var submittingSignal: SignalKind?
    @State private var isSaved = false

    var venue: VenueItem? {
        detail?.venue ?? initialVenue
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            OrchidBackground(animated: true, gridOpacity: 0.025)

            if let venue {
                ScrollView {
                    VStack(spacing: 0) {
                        detailHero(venue)
                        detailContent(venue)
                    }
                    .padding(.bottom, 190)
                }
                .ignoresSafeArea(edges: .top)
                .overlay(alignment: .top) {
                    topControls
                }
            } else {
                VStack {
                    if isLoading {
                        LoadingStateView(title: "Loading venue")
                    } else if let errorMessage {
                        ErrorStateView(title: "Venue unavailable", message: errorMessage) {
                            Task { await load() }
                        }
                        .padding(20)
                    }
                }
            }

            if let signalMessage {
                SignalToast(message: signalMessage, isError: !signalMessage.contains("+"))
                    .padding(.bottom, 162)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if let venue {
                SignalVerificationTray(
                    venue: venue,
                    status: signalStatus(for: venue),
                    isDenied: locationManager.isDenied,
                    locationError: locationManager.locationError,
                    submittingSignal: submittingSignal,
                    verify: { locationManager.requestLocationAccess() },
                    submit: { kind in
                        Task { await submitSignal(venueID: venue.id, kind: kind) }
                    }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
    }

    private var topControls: some View {
        HStack {
            GlassIconButton(systemName: "chevron.left") {
                dismiss()
            }
            Spacer()
            HStack(spacing: 8) {
                GlassIconButton(systemName: isSaved ? "bookmark.fill" : "bookmark") {
                    isSaved.toggle()
                }
                GlassIconButton(systemName: "square.and.arrow.up") {}
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 54)
    }

    private func detailHero(_ venue: VenueItem) -> some View {
        ZStack(alignment: .bottomLeading) {
            VenueArtView(venue: venue, height: 340, cornerRadius: 0)
                .overlay(
                    LinearGradient(
                        colors: [.black.opacity(0.08), NightloopTheme.background.opacity(0.92)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )

            HStack(spacing: 6) {
                PulsePill(level: venue.pulse.level, label: venue.pulse.label)
                Text("Trending \(venue.trend)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Color.black.opacity(0.42))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
        }
        .frame(height: 340)
    }

    private func detailContent(_ venue: VenueItem) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            titleBlock(venue)
            energyBar(venue)
            statsRow(venue)
            whyNightloopCard(venue)
            liveTrendCard(venue)
            tagsSection(venue)
            if let eventTitle = venue.event?.title {
                eventCard(eventTitle)
            }
            infoSection(venue)
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
    }

    private func titleBlock(_ venue: VenueItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(venue.name)
                    .font(.system(size: 32, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)

                Text("\(venue.neighborhood) · \(venue.category.replacingOccurrences(of: "_", with: " "))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            Spacer(minLength: 8)
            EnergyScoreBlock(score: venue.pulse.score)
        }
    }

    private func energyBar(_ venue: VenueItem) -> some View {
        VStack(spacing: 5) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.06))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [NightloopTheme.cool, NightloopTheme.amber, NightloopTheme.rose],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * CGFloat(max(0, min(venue.pulse.score, 100))) / 100)
                }
            }
            .frame(height: 6)

            HStack {
                Text("Chill")
                Spacer()
                Text("Active")
                Spacer()
                Text("Packed")
            }
            .font(.caption2.weight(.black))
            .tracking(1)
            .foregroundStyle(NightloopTheme.inkDim)
        }
    }

    private func statsRow(_ venue: VenueItem) -> some View {
        HStack(spacing: 10) {
            StatMiniCard(value: venue.waitMinutes.map { "\($0)m" } ?? "?", label: "Wait", color: waitColor(venue.waitMinutes))
            StatMiniCard(value: coverCopy(for: venue), label: "Cover")
            StatMiniCard(value: "\(venue.friendSummary.friendsHereCount)", label: "Friends", color: NightloopTheme.purple)
        }
    }

    private func whyNightloopCard(_ venue: VenueItem) -> some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Why Nightloop picks it", systemImage: "sparkles")
                    .font(.caption.weight(.black))
                    .tracking(1.2)
                    .foregroundStyle(Color(hex: "#e9d5ff"))

                ForEach(whyLines(for: venue), id: \.self) { line in
                    HStack(alignment: .top, spacing: 8) {
                        Circle()
                            .fill(NightloopTheme.purple)
                            .frame(width: 5, height: 5)
                            .padding(.top, 7)
                        Text(line)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineSpacing(3)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func liveTrendCard(_ venue: VenueItem) -> some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    NightloopSectionHeader(title: "Live trend · last 3 hours")
                    Spacer()
                    Text("\(venue.recentSignalCount) reports")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
                SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)
                HStack {
                    Text("9:00")
                    Spacer()
                    Text("10:00")
                    Spacer()
                    Text("11:00")
                    Spacer()
                    Text("now")
                }
                .font(.caption2.monospaced())
                .foregroundStyle(NightloopTheme.inkDim)
            }
        }
    }

    private func tagsSection(_ venue: VenueItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            tagGroup(title: "Vibe tonight", tags: vibeTags(for: venue), isMusic: false)
            tagGroup(title: "Music", tags: musicTags(for: venue), isMusic: true)
        }
    }

    private func tagGroup(title: String, tags: [String], isMusic: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            NightloopSectionHeader(title: title)
            FlowLayout(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(isMusic ? Color(hex: "#e9d5ff") : NightloopTheme.ink)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(isMusic ? NightloopTheme.purpleSoft : Color.white.opacity(0.05))
                        .clipShape(Capsule())
                        .overlay {
                            Capsule().stroke(isMusic ? NightloopTheme.purpleEdge : NightloopTheme.hairlineSoft)
                        }
                }
            }
        }
    }

    private func eventCard(_ title: String) -> some View {
        NightloopCard(fill: NightloopTheme.amber.opacity(0.10)) {
            Label(title, systemImage: "music.note")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NightloopTheme.amber)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func infoSection(_ venue: VenueItem) -> some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            VStack(alignment: .leading, spacing: 12) {
                NightloopSectionHeader(title: "Worth noting")

                DetailLine(label: "Signals", value: "\(venue.signalCount) total · \(venue.recentSignalCount) recent")
                DetailLine(label: "Wait", value: venue.waitMinutes.map { "\($0) min" } ?? "Unknown")
                DetailLine(label: "Confidence", value: venue.confidence.capitalized)
                DetailLine(label: "Address", value: "\(venue.neighborhood), San Francisco")
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
        guard let venue else { return }
        guard let userCoordinate = locationManager.userCoordinate else {
            signalMessage = "Share location to verify you're at \(venue.name)."
            locationManager.requestLocationAccess()
            return
        }
        guard SignalProximity.status(userCoordinate: userCoordinate, venueCoordinate: venue.coordinate) == .verified else {
            signalMessage = "Signals unlock when you're at the venue."
            return
        }

        submittingSignal = kind
        do {
            let result = try await apiClient.submitSignal(
                venueID: venueID,
                kind: kind,
                bearerToken: token,
                userCoordinate: userCoordinate
            )
            signalMessage = "Signal sent · +\(result.pointsAwarded) pts"
            await load()
            if let updatedMe = try? await apiClient.me(bearerToken: token) {
                onAccountChanged(updatedMe)
            }
        } catch {
            signalMessage = error.localizedDescription
        }
        submittingSignal = nil
    }

    private func waitColor(_ wait: Int?) -> Color {
        guard let wait else { return NightloopTheme.ink }
        if wait < 10 { return NightloopTheme.good }
        if wait < 20 { return NightloopTheme.amber }
        return NightloopTheme.rose
    }

    private func coverCopy(for venue: VenueItem) -> String {
        if venue.pulse.level >= 3 { return "$20-30" }
        if venue.pulse.level == 2 { return "$10-15" }
        return "Free"
    }

    private func whyLines(for venue: VenueItem) -> [String] {
        var lines = [venue.whyShort]
        if venue.trend == "rising" {
            lines.append("Energy is rising in the last hour; get there before the line does.")
        } else if venue.trend == "cooling" {
            lines.append("Cooling off; expect easier entry but less atmosphere.")
        }
        if venue.friendSummary.friendsHereCount > 0 {
            lines.append("\(venue.friendSummary.firstFriendName ?? "A friend") is already here.")
        }
        if let event = venue.event?.title {
            lines.append("\(event) is live tonight.")
        }
        return Array(lines.prefix(4))
    }

    private func vibeTags(for venue: VenueItem) -> [String] {
        var tags = [venue.category.replacingOccurrences(of: "_", with: " ").capitalized, venue.pulse.label]
        if venue.neighborhood.localizedCaseInsensitiveContains("Castro") { tags.append("Queer-forward") }
        if venue.neighborhood.localizedCaseInsensitiveContains("SoMa") { tags.append("Dance floor") }
        if venue.pulse.level >= 3 { tags.append("Packed") }
        return Array(Set(tags)).prefix(4).map { $0 }
    }

    private func musicTags(for venue: VenueItem) -> [String] {
        let raw = "\(venue.category) \(venue.event?.title ?? "")".lowercased()
        var tags: [String] = []
        if raw.contains("club") { tags.append("DJs") }
        if raw.contains("live") { tags.append("Live") }
        if raw.contains("lounge") { tags.append("Lounge") }
        if raw.contains("bar") { tags.append("Mixed") }
        return tags.isEmpty ? ["Nightlife"] : Array(tags.prefix(3))
    }

    private func shortSignalLabel(_ kind: SignalKind) -> String {
        switch kind {
        case .packed: return "Packed"
        case .shortLine: return "Short"
        case .longLine: return "Long"
        case .dead: return "Dead"
        case .eventLive: return "Event"
        }
    }

    private func signalStatus(for venue: VenueItem) -> SignalProximityStatus {
        SignalProximity.status(userCoordinate: locationManager.userCoordinate, venueCoordinate: venue.coordinate)
    }
}

private struct SignalVerificationTray: View {
    let venue: VenueItem
    let status: SignalProximityStatus
    let isDenied: Bool
    let locationError: String?
    let submittingSignal: SignalKind?
    let verify: () -> Void
    let submit: (SignalKind) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: statusColor.opacity(0.75), radius: 8)
                Text(statusTitle)
                    .font(.caption.weight(.black))
                    .tracking(1.1)
                    .foregroundStyle(statusColor)
                Spacer()
                Text("LIVE SIGNAL")
                    .font(.caption2.weight(.black))
                    .tracking(1.2)
                    .foregroundStyle(NightloopTheme.inkDim)
            }

            if status == .verified {
                SignalChoiceGrid(submittingSignal: submittingSignal, submit: submit)
            } else {
                Text(locationError ?? statusMessage)
                    .font(.caption.weight(.semibold))
                    .lineSpacing(2)
                    .foregroundStyle(NightloopTheme.inkMuted)

                Button(action: verify) {
                    Label(isDenied ? "Location unavailable" : "Verify you're here", systemImage: "location.fill")
                        .font(.subheadline.weight(.black))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(isDenied ? Color.white.opacity(0.10) : NightloopTheme.fab)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isDenied)
            }
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [NightloopTheme.surface.opacity(0.98), NightloopTheme.background.opacity(0.98)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
        .shadow(color: .black.opacity(0.45), radius: 26, x: 0, y: 12)
    }

    private var statusTitle: String {
        switch status {
        case .needsLocation: return "Verify at \(venue.name)"
        case .tooFar: return "Too far to signal"
        case .verified: return "You're at \(venue.name)"
        }
    }

    private var statusMessage: String {
        switch status {
        case .needsLocation:
            return "Nightloop only accepts live signals when you are at the venue. We do not store your precise coordinates."
        case .tooFar:
            return "Move closer to the venue to report what it feels like right now."
        case .verified:
            return ""
        }
    }

    private var statusColor: Color {
        switch status {
        case .needsLocation: return NightloopTheme.amber
        case .tooFar: return NightloopTheme.rose
        case .verified: return NightloopTheme.good
        }
    }
}

private struct SignalChoiceGrid: View {
    let submittingSignal: SignalKind?
    let submit: (SignalKind) -> Void

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
            ForEach(SignalKind.allCases) { kind in
                Button {
                    submit(kind)
                } label: {
                    if submittingSignal == kind {
                        ProgressView()
                            .tint(kind == .packed ? NightloopTheme.fab : NightloopTheme.purple)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                    } else {
                        VStack(spacing: 4) {
                            Image(systemName: kind.symbol)
                                .font(.callout.weight(.bold))
                            Text(shortSignalLabel(kind))
                                .font(.caption2.weight(.bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(NightloopTheme.ink)
                .background(submittingSignal == kind ? NightloopTheme.good : Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .disabled(submittingSignal != nil)
            }
        }
    }

    private func shortSignalLabel(_ kind: SignalKind) -> String {
        switch kind {
        case .packed: return "Packed"
        case .shortLine: return "Short"
        case .longLine: return "Long"
        case .dead: return "Dead"
        case .eventLive: return "Event"
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

private struct FlowLayout<Content: View>: View {
    var spacing: CGFloat = 8
    @ViewBuilder var content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: spacing) { content }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: spacing)], alignment: .leading, spacing: spacing) {
                content
            }
        }
    }
}
