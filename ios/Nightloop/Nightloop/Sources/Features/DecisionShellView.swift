import SwiftUI

struct DecisionShellView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse
    let onAccountChanged: (MeResponse) -> Void

    @State private var sessions: [DecisionSessionSummary] = []
    @State private var activeSession: DecisionSessionResponse?
    @State private var friends: [FriendConnection] = []
    @State private var selectedInviteIDs: Set<String> = []
    @State private var joinSessionID = ""
    @State private var joinCode = ""
    @State private var neighborhoodFilter = ""
    @State private var categoryFilter = ""
    @State private var pulseFilter: String?
    @State private var isLoading = true
    @State private var isMutating = false
    @State private var errorMessage: String?
    @State private var toastMessage: String?
    @State private var toastIsError = false

    private var activeMarketID: String {
        me.profile?.selectedMarketId ?? "san-francisco"
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            OrchidBackground(animated: true, gridOpacity: 0.035)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    statusStrip

                    if isLoading && sessions.isEmpty && activeSession == nil {
                        LoadingStateView(title: "Loading decision")
                    } else if let errorMessage, sessions.isEmpty && activeSession == nil {
                        ErrorStateView(title: "Decision unavailable", message: errorMessage) {
                            Task { await loadDecision() }
                        }
                    } else {
                        createSection
                        joinSection
                        sessionsSection
                        if let activeSession {
                            sessionDetail(activeSession)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 22)
            }
            .refreshable { await loadDecision() }

            if let toastMessage {
                SignalToast(message: toastMessage, isError: toastIsError)
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await loadDecision() }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("GROUP PICK")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text("Decision")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.ink)
            }

            Spacer()

            GlassIconButton(systemName: "arrow.clockwise") {
                Task { await loadDecision() }
            }
        }
    }

    private var statusStrip: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(NightloopTheme.purple.opacity(0.24))
                    .frame(width: 34, height: 34)
                Image(systemName: "person.3.sequence.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.purple)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("TONIGHT ROOM")
                    .font(.caption2.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(Color(hex: "#e9d5ff"))
                Text(statusCopy)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(2)
            }

            Spacer()
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

    private var statusCopy: String {
        if let leader = activeSession?.leader {
            return "\(leader.venue.name) is leading with \(leader.inCount) in."
        }
        if let first = sessions.first {
            return first.leader.map { "\($0.venueName) is leading." } ?? "\(first.memberCounts.joined) joined tonight."
        }
        return "Create a private friend room and vote from 12 Nightloop picks."
    }

    private var createSection: some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 14) {
                NightloopSectionHeader(title: "Create room", trailing: "\(friends.count) friends")

                VStack(spacing: 10) {
                    HStack(spacing: 8) {
                        DecisionFilterField(title: "Neighborhood", text: $neighborhoodFilter)
                        DecisionFilterField(title: "Type", text: $categoryFilter)
                    }

                    HStack(spacing: 8) {
                        DecisionPulseButton(title: "Any", isSelected: pulseFilter == nil) { pulseFilter = nil }
                        DecisionPulseButton(title: "Chill", isSelected: pulseFilter == "chill") { pulseFilter = "chill" }
                        DecisionPulseButton(title: "Active", isSelected: pulseFilter == "active") { pulseFilter = "active" }
                        DecisionPulseButton(title: "Packed", isSelected: pulseFilter == "packed") { pulseFilter = "packed" }
                    }
                }

                if friends.isEmpty {
                    Text("Friend invites appear after you add accepted friends.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(friends) { connection in
                                DecisionInviteChip(
                                    profile: connection.user,
                                    isSelected: selectedInviteIDs.contains(connection.user.id)
                                ) {
                                    toggleInvite(connection.user.id)
                                }
                            }
                        }
                    }
                }

                Button {
                    createSession()
                } label: {
                    Label("Create", systemImage: "sparkles")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(isMutating)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var joinSection: some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            VStack(alignment: .leading, spacing: 12) {
                NightloopSectionHeader(title: "Join room")

                TextField("Session ID", text: $joinSessionID)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .background(Color.white.opacity(0.055))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(NightloopTheme.hairline)
                    }

                HStack(spacing: 8) {
                    TextField("Code", text: $joinCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                        .padding(.horizontal, 12)
                        .frame(height: 42)
                        .background(Color.white.opacity(0.055))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(NightloopTheme.hairline)
                        }

                    Button {
                        joinSession()
                    } label: {
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.black))
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                    .disabled(joinSessionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isMutating)
                    .accessibilityLabel("Join decision session")
                }
            }
        }
    }

    @ViewBuilder
    private var sessionsSection: some View {
        if !sessions.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                NightloopSectionHeader(title: "Rooms", trailing: "\(sessions.count)")
                ForEach(sessions) { session in
                    Button {
                        openSession(session.id)
                    } label: {
                        DecisionSessionRow(
                            session: session,
                            isSelected: activeSession?.session.id == session.id
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func sessionDetail(_ response: DecisionSessionResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NightloopSectionHeader(title: "Current slate", trailing: "\(response.candidates.count)")

            leaderCard(response)
            codeCard(response.session)

            VStack(spacing: 12) {
                ForEach(response.candidates) { candidate in
                    DecisionCandidateCard(
                        candidate: candidate,
                        isPending: isMutating,
                        apiClient: apiClient,
                        authStore: authStore,
                        onAccountChanged: onAccountChanged,
                        voteIn: { vote(candidate, .voteIn) },
                        skip: { vote(candidate, .skip) },
                        coming: { setComing(candidate.venue) }
                    )
                }
            }

            if response.session.viewerRole == "creator" && response.session.status == "active" {
                HStack(spacing: 8) {
                    Button {
                        revokeCode(response.session)
                    } label: {
                        Label("Revoke", systemImage: "qrcode.viewfinder")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)

                    Button {
                        endSession(response.session)
                    } label: {
                        Label("End", systemImage: "checkmark.circle")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.rose)
                }
                .disabled(isMutating)
            }
        }
    }

    private func leaderCard(_ response: DecisionSessionResponse) -> some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            HStack(spacing: 12) {
                Image(systemName: "crown.fill")
                    .font(.title3.weight(.black))
                    .foregroundStyle(NightloopTheme.amber)
                    .frame(width: 34, height: 34)

                VStack(alignment: .leading, spacing: 4) {
                    Text(response.leader?.venue.name ?? "No leader yet")
                        .font(.headline.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                    Text(response.leader?.groupFitReason ?? "Votes will settle the room.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .lineLimit(2)
                }

                Spacer()

                if let leader = response.leader {
                    Text("\(leader.inCount) in")
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Capsule())
                }
            }
        }
    }

    private func codeCard(_ session: DecisionSession) -> some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    NightloopSectionHeader(title: "Code", trailing: session.codeRevokedAt == nil ? "ends \(session.codeHint ?? "--")" : "revoked")
                    Text(session.code ?? "Session \(session.id)")
                        .font(.system(size: session.code == nil ? 12 : 20, weight: .black, design: session.code == nil ? .default : .monospaced))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                    Text("Expires \(relativeTime(session.expiresAt))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 5) {
                    Text("\(session.memberCounts.joined)")
                        .font(.title3.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("joined")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
            }
        }
    }

    private func loadDecision() async {
        guard let token = authStore.accessToken else {
            isLoading = false
            errorMessage = "Sign in to sync decision rooms."
            return
        }

        isLoading = sessions.isEmpty && activeSession == nil
        errorMessage = nil

        do {
            async let sessionsTask = apiClient.decisionSessions(bearerToken: token)
            async let friendsTask = apiClient.friends(bearerToken: token)
            let (sessionsResponse, friendsResponse) = try await (sessionsTask, friendsTask)
            sessions = sessionsResponse.items
            friends = friendsResponse.friends

            if let activeID = activeSession?.session.id {
                activeSession = try await apiClient.decisionSession(id: activeID, bearerToken: token)
            } else if let first = sessions.first {
                activeSession = try await apiClient.decisionSession(id: first.id, bearerToken: token)
            }
        } catch {
            errorMessage = error.localizedDescription
            showToast(error.localizedDescription, isError: true)
        }

        isLoading = false
    }

    private func createSession() {
        guard let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                let filters = DecisionFilters(
                    neighborhood: emptyToNil(neighborhoodFilter),
                    category: emptyToNil(categoryFilter),
                    pulse: pulseFilter
                )
                activeSession = try await apiClient.createDecisionSession(
                    marketID: activeMarketID,
                    invitedUserIDs: Array(selectedInviteIDs),
                    filters: filters,
                    bearerToken: token
                )
                selectedInviteIDs.removeAll()
                showToast("Room created")
                await loadDecision()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func joinSession() {
        let sessionID = joinSessionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let code = emptyToNil(joinCode)
        guard !sessionID.isEmpty, let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.joinDecisionSession(id: sessionID, code: code, bearerToken: token)
                joinSessionID = ""
                joinCode = ""
                showToast("Joined")
                await loadDecision()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func openSession(_ id: String) {
        guard let token = authStore.accessToken else { return }
        Task {
            do {
                activeSession = try await apiClient.decisionSession(id: id, bearerToken: token)
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
        }
    }

    private func vote(_ candidate: DecisionCandidate, _ vote: DecisionVoteValue) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.voteDecisionSession(
                    id: session.id,
                    candidateID: candidate.id,
                    vote: vote,
                    bearerToken: token
                )
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func setComing(_ venue: VenueItem) {
        guard let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                _ = try await apiClient.toggleComing(venueID: venue.id, isComing: true, bearerToken: token)
                showToast("You're coming")
                if let session = activeSession?.session {
                    activeSession = try await apiClient.decisionSession(id: session.id, bearerToken: token)
                }
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func revokeCode(_ session: DecisionSession) {
        guard let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.revokeDecisionSessionCode(id: session.id, bearerToken: token)
                showToast("Code revoked")
                await loadDecision()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func endSession(_ session: DecisionSession) {
        guard let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.endDecisionSession(id: session.id, bearerToken: token)
                showToast("Room ended")
                await loadDecision()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func toggleInvite(_ userID: String) {
        if selectedInviteIDs.contains(userID) {
            selectedInviteIDs.remove(userID)
        } else {
            selectedInviteIDs.insert(userID)
        }
    }

    private func showToast(_ message: String, isError: Bool = false) {
        toastMessage = message
        toastIsError = isError
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            if toastMessage == message {
                withAnimation(.easeOut(duration: 0.2)) {
                    toastMessage = nil
                    toastIsError = false
                }
            }
        }
    }

    private func emptyToNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct DecisionFilterField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        TextField(title, text: $text)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .font(.caption.weight(.bold))
            .foregroundStyle(NightloopTheme.ink)
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(Color.white.opacity(0.055))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(NightloopTheme.hairline)
            }
    }
}

private struct DecisionPulseButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption2.weight(.black))
                .frame(maxWidth: .infinity)
                .frame(height: 32)
        }
        .buttonStyle(.plain)
        .foregroundStyle(isSelected ? Color.white : NightloopTheme.inkMuted)
        .background(isSelected ? NightloopTheme.purple : Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isSelected ? NightloopTheme.purpleEdge : NightloopTheme.hairline)
        }
    }
}

private struct DecisionInviteChip: View {
    let profile: FriendProfile
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "person.crop.circle")
                    .font(.caption.weight(.black))
                Text(profile.displayName)
                    .font(.caption.weight(.black))
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? Color.white : NightloopTheme.ink)
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(isSelected ? NightloopTheme.purple : Color.white.opacity(0.055))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct DecisionSessionRow: View {
    let session: DecisionSessionSummary
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? NightloopTheme.purple.opacity(0.26) : Color.white.opacity(0.05))
                    .frame(width: 44, height: 44)
                Image(systemName: session.status == "active" ? "person.3.fill" : "checkmark.circle.fill")
                    .foregroundStyle(isSelected ? NightloopTheme.purple : NightloopTheme.inkMuted)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(session.leader?.venueName ?? "Decision room")
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                Text("\(session.memberCounts.joined) joined · expires \(relativeTime(session.expiresAt))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.inkMuted)
        }
        .padding(12)
        .background(Color.white.opacity(isSelected ? 0.065 : 0.035))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(isSelected ? NightloopTheme.purpleEdge : NightloopTheme.hairline)
        }
    }
}

private struct DecisionCandidateCard: View {
    let candidate: DecisionCandidate
    let isPending: Bool
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let onAccountChanged: (MeResponse) -> Void
    let voteIn: () -> Void
    let skip: () -> Void
    let coming: () -> Void

    var body: some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 12) {
                NavigationLink {
                    VenueDetailView(
                        apiClient: apiClient,
                        authStore: authStore,
                        venueID: candidate.venue.id,
                        initialVenue: candidate.venue,
                        onAccountChanged: onAccountChanged
                    )
                } label: {
                    HStack(spacing: 12) {
                        if candidate.venue.image?.url != nil {
                            VenueArtView(venue: candidate.venue, height: 58, cornerRadius: 10)
                                .frame(width: 58, height: 58)
                                .clipped()
                        } else {
                            DecisionVenuePulseTile(venue: candidate.venue)
                        }

                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                LivenessChip(liveness: candidate.venue.liveness, compact: true)
                                ConfidencePips(confidence: candidate.venue.liveness?.confidence)
                            }
                            Text(candidate.venue.name)
                                .font(.headline.weight(.black))
                                .foregroundStyle(NightloopTheme.ink)
                                .lineLimit(1)
                            Text("\(candidate.venue.neighborhood) · \(candidate.groupFitScore, specifier: "%.0f") fit")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NightloopTheme.inkMuted)
                                .lineLimit(1)
                        }

                        Spacer()
                    }
                }
                .buttonStyle(.plain)

                Text(candidate.groupFitReason)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    DecisionCountPill(title: "In", value: candidate.inCount, isSelected: candidate.viewerVote == .voteIn)
                    DecisionCountPill(title: "Skip", value: candidate.skipCount, isSelected: candidate.viewerVote == .skip)
                    Spacer()
                    if candidate.venue.friendSummary.friendsHereCount > 0 {
                        Label("\(candidate.venue.friendSummary.friendsHereCount)", systemImage: "person.2.fill")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.good)
                    }
                }

                HStack(spacing: 8) {
                    Button(action: skip) {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.black))
                            .frame(width: 40, height: 34)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)

                    Button(action: coming) {
                        Label("I'm Coming", systemImage: "figure.walk")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.good)

                    Button(action: voteIn) {
                        Label("Vote In", systemImage: "checkmark")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                }
                .disabled(isPending)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DecisionVenuePulseTile: View {
    let venue: VenueItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(NightloopTheme.purpleSoft)
                .frame(width: 58, height: 58)
            Text("\(venue.pulse.score)")
                .font(.headline.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
        }
    }
}

private struct DecisionCountPill: View {
    let title: String
    let value: Int
    let isSelected: Bool

    var body: some View {
        Text("\(value) \(title)")
            .font(.caption2.weight(.black))
            .foregroundStyle(isSelected ? Color.white : NightloopTheme.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(isSelected ? NightloopTheme.purple : Color.white.opacity(0.055))
            .clipShape(Capsule())
    }
}

private func relativeTime(_ value: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    guard let date else { return "tonight" }

    let relative = RelativeDateTimeFormatter()
    relative.unitsStyle = .short
    return relative.localizedString(for: date, relativeTo: Date())
}
