import SwiftUI
import UIKit

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
    @State private var isSearchingSuggestions = false
    @State private var errorMessage: String?
    @State private var toastMessage: String?
    @State private var toastIsError = false
    @State private var suggestionQuery = ""
    @State private var suggestionResults: [VenueItem] = []
    @State private var messageText = ""
    @State private var finalizingCandidate: DecisionCandidate?
    @State private var finalMeetupAt = ""
    @State private var finalNote = ""

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
                        sessionsSection
                        if let activeSession {
                            sessionDetail(activeSession)
                        }
                        createSection
                        joinSection
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
        .sheet(item: $finalizingCandidate) { candidate in
            DecisionFinalizationSheet(
                candidate: candidate,
                meetupAt: $finalMeetupAt,
                note: $finalNote,
                isPending: isMutating,
                finalize: {
                    finalize(candidate)
                }
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
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
        if let finalPlan = activeSession?.session.finalPlan {
            return "Locked: \(finalPlan.venue?.name ?? "tonight's pick"). Chat stays open until expiry."
        }
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

                Text("Use a room ID plus code, or tap an invited room from your list.")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
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
            NightloopSectionHeader(title: response.session.finalPlan == nil ? "Current slate" : "Locked plan", trailing: "\(response.candidates.count)")

            if let finalPlan = response.session.finalPlan {
                finalPlanCard(finalPlan, session: response.session)
            } else {
                leaderCard(response)
            }
            codeCard(response.session)
            suggestionSection(response)

            VStack(spacing: 12) {
                ForEach(response.candidates) { candidate in
                    DecisionCandidateCard(
                        candidate: candidate,
                        isPending: isMutating,
                        canVote: response.session.capabilities?.canVote ?? (response.session.finalPlan == nil),
                        canFinalize: response.session.capabilities?.canFinalize == true,
                        apiClient: apiClient,
                        authStore: authStore,
                        onAccountChanged: onAccountChanged,
                        voteIn: { vote(candidate, .voteIn) },
                        skip: { vote(candidate, .skip) },
                        coming: { setComing(candidate.venue) },
                        remove: { removeSuggestion(candidate) },
                        finalize: { prepareFinalize(candidate) }
                    )
                }
            }

            roomChatSection(response)

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

    private func finalPlanCard(_ finalPlan: DecisionFinalPlan, session: DecisionSession) -> some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title3.weight(.black))
                        .foregroundStyle(NightloopTheme.good)
                        .frame(width: 34, height: 34)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(finalPlan.venue?.name ?? "Final pick locked")
                            .font(.headline.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(1)
                        Text("Locked by \(finalPlan.lockedBy.displayName)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }

                    Spacer()
                }

                if let meetupAt = finalPlan.meetupAt {
                    Label("Meet \(relativeTime(meetupAt))", systemImage: "clock.fill")
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                }

                if let note = finalPlan.note, !note.isEmpty {
                    Text(note)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let venue = finalPlan.venue {
                    Button {
                        setComing(venue)
                    } label: {
                        Label("I'm Coming", systemImage: "figure.walk")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.good)
                    .disabled(isMutating || session.status != "active")
                }
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
                    Text("Room ID \(shortSessionID(session.id))")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    Text("\(session.memberCounts.joined)")
                        .font(.title3.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("joined")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                    HStack(spacing: 6) {
                        if let code = session.code, session.codeRevokedAt == nil {
                            ClipboardMiniButton(systemName: "qrcode", label: "Copy code") {
                                UIPasteboard.general.string = code
                                showToast("Code copied")
                            }
                        }
                        ClipboardMiniButton(systemName: "number", label: "Copy room ID") {
                            UIPasteboard.general.string = session.id
                            showToast("Room ID copied")
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func suggestionSection(_ response: DecisionSessionResponse) -> some View {
        if response.session.capabilities?.canSuggestCandidates == true {
            NightloopCard(fill: Color.white.opacity(0.035)) {
                VStack(alignment: .leading, spacing: 12) {
                    NightloopSectionHeader(title: "Suggest venue", trailing: "\(response.candidates.filter { $0.source == "suggested" }.count)/6")

                    HStack(spacing: 8) {
                        TextField("Search Nightloop venues", text: $suggestionQuery)
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

                        Button {
                            searchSuggestions()
                        } label: {
                            Image(systemName: "magnifyingglass")
                                .font(.caption.weight(.black))
                                .frame(width: 40, height: 40)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.purple)
                        .disabled(isSearchingSuggestions || suggestionQuery.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
                        .accessibilityLabel("Search venues to suggest")
                    }

                    if isSearchingSuggestions {
                        ProgressView()
                            .tint(NightloopTheme.purple)
                    } else if !suggestionResults.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(suggestionResults.prefix(5)) { venue in
                                DecisionSuggestionRow(venue: venue) {
                                    suggest(venue)
                                }
                                .disabled(isMutating)
                            }
                        }
                    }

                    Text("Suggestions stay inside this room and count as your in vote.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
            }
        } else if response.session.finalPlan != nil {
            Text("Votes and suggestions are frozen after the creator locks a pick. Chat stays open until the room expires.")
                .font(.caption.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
                .padding(.horizontal, 4)
        }
    }

    private func roomChatSection(_ response: DecisionSessionResponse) -> some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            VStack(alignment: .leading, spacing: 12) {
                NightloopSectionHeader(title: "Room chat", trailing: "\(response.messages.count)")

                if response.messages.isEmpty {
                    Text("Tiny room-only chat for quick planning. Messages expire tonight.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                } else {
                    VStack(spacing: 8) {
                        ForEach(response.messages.prefix(6)) { message in
                            DecisionMessageRow(message: message) {
                                reportMessage(message)
                            }
                        }
                    }
                }

                if response.session.capabilities?.canMessage == true {
                    HStack(spacing: 8) {
                        TextField("Message", text: $messageText)
                            .textInputAutocapitalization(.sentences)
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
                            .onChange(of: messageText) { _, newValue in
                                if newValue.count > 140 {
                                    messageText = String(newValue.prefix(140))
                                }
                            }

                        Button {
                            sendTextMessage()
                        } label: {
                            Image(systemName: "paperplane.fill")
                                .font(.caption.weight(.black))
                                .frame(width: 40, height: 40)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.fab)
                        .disabled(isMutating || messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    HStack(spacing: 8) {
                        ForEach([DecisionEmoji.fire, .eyes, .thumbsUp, .thinking, .down], id: \.rawValue) { emoji in
                            Button {
                                sendEmoji(emoji)
                            } label: {
                                Image(systemName: emoji.symbol)
                                    .font(.caption.weight(.black))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 32)
                            }
                            .buttonStyle(.bordered)
                            .tint(NightloopTheme.inkMuted)
                            .disabled(isMutating)
                        }
                    }
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

    private func searchSuggestions() {
        let query = suggestionQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isSearchingSuggestions = true
            do {
                let response = try await apiClient.searchDecisionVenues(
                    sessionID: session.id,
                    query: query,
                    bearerToken: token
                )
                suggestionResults = response.items
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isSearchingSuggestions = false
        }
    }

    private func suggest(_ venue: VenueItem) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.suggestDecisionCandidate(
                    sessionID: session.id,
                    venueID: venue.id,
                    bearerToken: token
                )
                suggestionQuery = ""
                suggestionResults = []
                showToast("Suggested \(venue.name)")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func removeSuggestion(_ candidate: DecisionCandidate) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.removeDecisionCandidate(
                    sessionID: session.id,
                    candidateID: candidate.id,
                    bearerToken: token
                )
                showToast("Suggestion removed")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func prepareFinalize(_ candidate: DecisionCandidate) {
        finalMeetupAt = ""
        finalNote = ""
        finalizingCandidate = candidate
    }

    private func finalize(_ candidate: DecisionCandidate) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.finalizeDecisionSession(
                    id: session.id,
                    candidateID: candidate.id,
                    meetupAt: emptyToNil(finalMeetupAt),
                    note: emptyToNil(finalNote),
                    bearerToken: token
                )
                finalizingCandidate = nil
                showToast("Pick locked")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func sendTextMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.addDecisionMessage(
                    sessionID: session.id,
                    type: .text,
                    text: text,
                    bearerToken: token
                )
                messageText = ""
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func sendEmoji(_ emoji: DecisionEmoji) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.addDecisionMessage(
                    sessionID: session.id,
                    type: .emoji,
                    emoji: emoji,
                    bearerToken: token
                )
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func reportMessage(_ message: DecisionMessage) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            do {
                _ = try await apiClient.reportDecisionMessage(
                    sessionID: session.id,
                    messageID: message.id,
                    reason: "inappropriate",
                    bearerToken: token
                )
                showToast("Reported")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
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
    let canVote: Bool
    let canFinalize: Bool
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let onAccountChanged: (MeResponse) -> Void
    let voteIn: () -> Void
    let skip: () -> Void
    let coming: () -> Void
    let remove: () -> Void
    let finalize: () -> Void

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

                if candidate.source == "suggested" {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(NightloopTheme.purple)
                        Text(candidate.suggestedBy.map { "Suggested by \($0.displayName)" } ?? "Suggested venue")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(NightloopTheme.inkMuted)
                        Spacer()
                    }
                }

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
                    if canVote {
                        Button(action: skip) {
                            Image(systemName: "xmark")
                                .font(.caption.weight(.black))
                                .frame(width: 40, height: 34)
                        }
                        .buttonStyle(.bordered)
                        .tint(NightloopTheme.inkMuted)
                    } else {
                        Text("Locked")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.inkMuted)
                            .frame(width: 58, height: 34)
                            .background(Color.white.opacity(0.045))
                            .clipShape(Capsule())
                    }

                    Button(action: coming) {
                        Label("I'm Coming", systemImage: "figure.walk")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.good)

                    Button(action: canVote ? voteIn : finalize) {
                        Label(canVote ? "Vote In" : "Details", systemImage: canVote ? "checkmark" : "info.circle")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                    .disabled(!canVote && !canFinalize)
                }
                .disabled(isPending)

                if canFinalize || candidate.canRemove == true {
                    HStack(spacing: 8) {
                        if candidate.canRemove == true {
                            Button(action: remove) {
                                Label("Remove", systemImage: "trash")
                                    .font(.caption2.weight(.black))
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(NightloopTheme.rose)
                        }

                        if canFinalize {
                            Button(action: finalize) {
                                Label("Lock pick", systemImage: "lock.fill")
                                    .font(.caption2.weight(.black))
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(NightloopTheme.purple)
                        }
                    }
                    .disabled(isPending)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DecisionSuggestionRow: View {
    let venue: VenueItem
    let suggest: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            DecisionVenuePulseTile(venue: venue)
                .frame(width: 44, height: 44)
                .scaleEffect(0.76)
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(venue.name)
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                Text("\(venue.neighborhood) · \(venue.category)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(1)
            }

            Spacer()

            Button(action: suggest) {
                Label("Add", systemImage: "plus")
                    .font(.caption2.weight(.black))
            }
            .buttonStyle(.borderedProminent)
            .tint(NightloopTheme.purple)
        }
        .padding(10)
        .background(Color.white.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct DecisionMessageRow: View {
    let message: DecisionMessage
    let report: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.06))
                    .frame(width: 30, height: 30)
                Text(String(message.actor.displayName.prefix(1)).uppercased())
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(message.actor.displayName)
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                    Text(relativeTime(message.createdAt))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted.opacity(0.75))
                    Spacer()
                    Button(action: report) {
                        Image(systemName: "flag")
                            .font(.caption2.weight(.bold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .accessibilityLabel("Report message")
                }

                if message.type == .emoji, let emoji = message.emoji {
                    Label(emoji.rawValue.replacingOccurrences(of: "_", with: " "), systemImage: emoji.symbol)
                        .font(.caption.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                } else {
                    Text(message.text ?? "")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct DecisionFinalizationSheet: View {
    let candidate: DecisionCandidate
    @Binding var meetupAt: String
    @Binding var note: String
    let isPending: Bool
    let finalize: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            OrchidBackground(animated: false, gridOpacity: 0.035)
            VStack(alignment: .leading, spacing: 16) {
                Text("LOCK PICK")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text(candidate.venue.name)
                    .font(.title2.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)

                Text("Finalizing freezes votes, suggestions, and removals. Chat and I'm Coming stay open until the room expires.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)

                TextField("Meetup ISO time (optional)", text: $meetupAt)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 42)
                    .background(Color.white.opacity(0.055))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                TextField("Note, max 140 chars", text: $note)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 42)
                    .background(Color.white.opacity(0.055))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .onChange(of: note) { _, newValue in
                        if newValue.count > 140 {
                            note = String(newValue.prefix(140))
                        }
                    }

                HStack(spacing: 10) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .font(.caption.weight(.black))
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)

                    Button {
                        finalize()
                    } label: {
                        Label("Lock", systemImage: "lock.fill")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.purple)
                    .disabled(isPending)
                }
            }
            .padding(20)
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

private struct ClipboardMiniButton: View {
    let systemName: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.caption2.weight(.black))
                .frame(width: 28, height: 26)
        }
        .buttonStyle(.bordered)
        .tint(NightloopTheme.inkMuted)
        .accessibilityLabel(label)
    }
}

private func shortSessionID(_ id: String) -> String {
    let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count > 12 else { return trimmed }
    return "\(trimmed.prefix(8))..."
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
