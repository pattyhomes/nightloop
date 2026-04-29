import SwiftUI
import UIKit

struct DecisionStartSeed: Equatable {
    let id: UUID
    let friendIDs: [String]
}

struct DecisionShellView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse
    let onAccountChanged: (MeResponse) -> Void
    let startSeed: DecisionStartSeed?

    @State private var sessions: [DecisionSessionSummary] = []
    @State private var activeSession: DecisionSessionResponse?
    @State private var friends: [FriendConnection] = []
    @State private var selectedInviteIDs: Set<String> = []
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
    @State private var showingCreateSheet = false
    @State private var showingJoinSheet = false
    @State private var showingRoomsSheet = false
    @State private var showingSuggestionSheet = false
    @State private var showingChatSheet = false
    @State private var showingProgressSheet = false
    @State private var swipeTranslation: CGSize = .zero
    @State private var rewindSnapshot: DecisionSessionResponse?

    private var activeMarketID: String {
        me.profile?.selectedMarketId ?? "san-francisco"
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            OrchidBackground(animated: true, gridOpacity: 0.035)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    if activeSession != nil {
                        statusStrip
                    }

                    if isLoading && sessions.isEmpty && activeSession == nil {
                        LoadingStateView(title: "Loading decision")
                    } else if let errorMessage, sessions.isEmpty && activeSession == nil {
                        ErrorStateView(title: "Decision unavailable", message: errorMessage) {
                            Task { await loadDecision() }
                        }
                    } else {
                        if let activeSession {
                            sessionDetail(activeSession)
                        } else {
                            noActiveRoomView
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
        .task(id: startSeed?.id) { applyStartSeed(startSeed) }
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
        .sheet(isPresented: $showingCreateSheet) {
            ScrollView {
                createSection.padding(20)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingJoinSheet) {
            ScrollView {
                joinSection.padding(20)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingRoomsSheet) {
            ScrollView {
                sessionsSection.padding(20)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingSuggestionSheet) {
            if let activeSession {
                ScrollView {
                    suggestionSection(activeSession).padding(20)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(isPresented: $showingChatSheet) {
            if let activeSession {
                ScrollView {
                    roomChatSection(activeSession).padding(20)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(isPresented: $showingProgressSheet) {
            if let progress = activeSession?.session.progress {
                DecisionProgressSheet(progress: progress)
                    .padding(20)
                    .presentationDetents([.fraction(0.38), .medium])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("PICK TONIGHT")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text(activeSession?.session.roomTitle ?? "Decision")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.ink)
            }

            Spacer()

            if sessions.count > 1 {
                GlassIconButton(systemName: "rectangle.stack.fill") {
                    showingRoomsSheet = true
                }
            }

            GlassIconButton(systemName: "plus") {
                showingCreateSheet = true
            }

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
        if activeSession?.session.stage == .shortlistVoting {
            return "Shortlist is open. Pick one winner from the top five."
        }
        if let leader = activeSession?.leader {
            return "\(leader.venue.name) is leading with \(leader.inCount) in."
        }
        if let first = sessions.first {
            return first.leader.map { "\($0.venueName) is leading." } ?? "\(first.memberCounts.joined) joined tonight."
        }
        return "Create a private friend room and vote from 12 Nightloop picks."
    }

    private var noActiveRoomView: some View {
        NightloopCard(fill: NightloopTheme.purpleSoft) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Pick a spot with friends")
                    .font(.title2.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Text("Start a private room, invite friends, then swipe enough venues to unlock a top-five shortlist.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button {
                        showingCreateSheet = true
                    } label: {
                        Label("Create room", systemImage: "sparkles")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.purple)

                    Button {
                        showingJoinSheet = true
                    } label: {
                        Label("Join", systemImage: "qrcode")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.ink)
                }
            }
        }
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

                HStack(spacing: 8) {
                    TextField("Room code", text: $joinCode)
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
                    .disabled(joinCode.trimmingCharacters(in: .whitespacesAndNewlines).count < 6 || isMutating)
                    .accessibilityLabel("Join decision room")
                }

                Text("Use the short code from a friend. Codes expire with tonight's room.")
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
            NightloopSectionHeader(
                title: response.session.roomTitle ?? "Tonight room",
                trailing: response.session.stage == .shortlistVoting ? "Top 5" : response.session.stage?.rawValue.replacingOccurrences(of: "_", with: " ") ?? nil
            )

            if let finalPlan = response.session.finalPlan {
                finalPlanCard(finalPlan, session: response.session)
            } else if response.session.stage == .shortlistVoting {
                shortlistSection(response)
            } else {
                leaderCard(response)
                deckSection(response)
            }

            roomActionTray(response)

            if response.session.viewerRole == "creator" && response.session.status == "active" {
                HStack(spacing: 8) {
                    Button {
                        revokeCode(response.session)
                    } label: {
                        Label("Revoke code", systemImage: "qrcode.viewfinder")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)

                    Button {
                        endSession(response.session)
                    } label: {
                        Label("End room", systemImage: "checkmark.circle")
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

    private func deckSection(_ response: DecisionSessionResponse) -> some View {
        let deck = response.deckCandidates ?? Array(response.candidates.prefix(8))
        let nextCandidate = deck.first { $0.viewerVote == nil } ?? deck.first
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button {
                    showingProgressSheet = true
                } label: {
                    Label("Group progress", systemImage: "chart.bar.fill")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(NightloopTheme.purple)

                if response.session.capabilities?.canForceShortlist == true {
                    Button {
                        advanceShortlist()
                    } label: {
                        Text("See results")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                    .disabled(isMutating)
                }
            }

            if let nextCandidate {
                DecisionDeckCard(
                    candidate: nextCandidate,
                    translation: swipeTranslation,
                    isPending: isMutating,
                    apiClient: apiClient,
                    authStore: authStore,
                    onAccountChanged: onAccountChanged,
                    onDragChanged: { swipeTranslation = $0 },
                    onDragEnded: { translation in
                        let presentation = DecisionSwipePresentation.state(for: translation)
                        switch presentation.intent {
                        case .voteIn:
                            vote(nextCandidate, .voteIn)
                        case .skip:
                            vote(nextCandidate, .skip)
                        case .neutral:
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                                swipeTranslation = .zero
                            }
                        }
                    },
                    skip: { vote(nextCandidate, .skip) },
                    voteIn: { vote(nextCandidate, .voteIn) },
                    coming: { setComing(nextCandidate.venue) }
                )

                if rewindSnapshot != nil {
                    Button {
                        rewindLastSwipe()
                    } label: {
                        Label("Rewind", systemImage: "arrow.uturn.backward")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)
                    .disabled(isMutating)
                }
            } else {
                EmptyStateView(title: "Deck complete", message: "Open group progress to unlock the shortlist.")
            }
        }
    }

    private func shortlistSection(_ response: DecisionSessionResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let recommended = response.recommendedFinalCandidate {
                leaderCard(response)
                Text("Recommended winner: \(recommended.venue.name)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            ForEach(response.shortlist ?? []) { candidate in
                DecisionShortlistCard(
                    candidate: candidate,
                    isPending: isMutating,
                    canFinalize: response.session.capabilities?.canFinalize == true,
                    vote: { voteShortlist(candidate) },
                    finalize: { prepareFinalize(response.recommendedFinalCandidate ?? candidate) },
                    details: { setComing(candidate.venue) }
                )
            }
        }
    }

    private func roomActionTray(_ response: DecisionSessionResponse) -> some View {
        NightloopCard(fill: Color.white.opacity(0.035)) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Button {
                        if let code = response.session.code {
                            UIPasteboard.general.string = code
                            showToast("Code copied")
                        } else {
                            showToast("Code appears for newly created rooms")
                        }
                    } label: {
                        Label("Share code", systemImage: "square.and.arrow.up")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.purple)

                    Button {
                        showingSuggestionSheet = true
                    } label: {
                        Label("Suggest", systemImage: "plus.circle")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.ink)
                    .disabled(response.session.capabilities?.canSuggestCandidates != true)

                    Button {
                        showingChatSheet = true
                    } label: {
                        Label("Chat", systemImage: "bubble.left.and.bubble.right.fill")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                }

                HStack {
                    Text(response.session.code.map { "Code \($0)" } ?? "Private room")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .lineLimit(1)
                    Spacer()
                    Text("\(response.session.memberCounts.joined) joined")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
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
                    Text(session.code ?? "Private room")
                        .font(.system(size: session.code == nil ? 14 : 20, weight: .black, design: session.code == nil ? .default : .monospaced))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                    Text("Expires \(relativeTime(session.expiresAt))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                    Text("Private room")
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
            rewindSnapshot = nil
            swipeTranslation = .zero
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
        let code = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard code.count >= 6, let token = authStore.accessToken else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.joinDecisionSession(code: code, bearerToken: token)
                joinCode = ""
                showToast("Joined")
                await loadDecision()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func applyStartSeed(_ seed: DecisionStartSeed?) {
        guard let seed else { return }
        selectedInviteIDs.formUnion(seed.friendIDs)
        showingCreateSheet = true
        showToast(seed.friendIDs.isEmpty ? "Create a room" : "Friends preselected")
    }

    private func openSession(_ id: String) {
        guard let token = authStore.accessToken else { return }
        Task {
            do {
                activeSession = try await apiClient.decisionSession(id: id, bearerToken: token)
                rewindSnapshot = nil
                swipeTranslation = .zero
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
        }
    }

    private func vote(_ candidate: DecisionCandidate, _ vote: DecisionVoteValue) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        let previous = activeSession
        rewindSnapshot = previous
        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
            swipeTranslation = .zero
        }
        applyOptimisticVote(candidateID: candidate.id, vote: vote)
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
                activeSession = previous
                rewindSnapshot = nil
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func rewindLastSwipe() {
        guard let snapshot = rewindSnapshot else { return }
        withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
            activeSession = snapshot
            rewindSnapshot = nil
            swipeTranslation = .zero
        }
        showToast("Last card restored")
    }

    private func advanceShortlist() {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.advanceDecisionShortlist(sessionID: session.id, bearerToken: token)
                showToast("Shortlist ready")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isMutating = false
        }
    }

    private func voteShortlist(_ candidate: DecisionCandidate) {
        guard let token = authStore.accessToken, let session = activeSession?.session else { return }
        let previous = activeSession
        applyOptimisticShortlistVote(candidateID: candidate.id)
        Task {
            isMutating = true
            do {
                activeSession = try await apiClient.voteDecisionShortlist(
                    sessionID: session.id,
                    candidateID: candidate.id,
                    bearerToken: token
                )
            } catch {
                activeSession = previous
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

    private func applyOptimisticVote(candidateID: String, vote: DecisionVoteValue) {
        guard let response = activeSession else { return }
        activeSession = DecisionUIState.optimisticVote(response: response, candidateID: candidateID, vote: vote)
    }

    private func applyOptimisticShortlistVote(candidateID: String) {
        guard let response = activeSession else { return }
        activeSession = DecisionUIState.optimisticShortlistVote(response: response, candidateID: candidateID)
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

enum DecisionSwipeIntent: Equatable {
    case neutral
    case skip
    case voteIn
}

struct DecisionSwipePresentation: Equatable {
    static let commitThreshold: CGFloat = 96

    let intent: DecisionSwipeIntent
    let skipScale: CGFloat
    let voteInScale: CGFloat
    let skipGlow: Double
    let voteInGlow: Double
    let rotationDegrees: Double

    static func state(for translation: CGSize) -> DecisionSwipePresentation {
        let horizontal = translation.width
        let progress = min(abs(horizontal) / commitThreshold, 1)
        let intent: DecisionSwipeIntent
        if horizontal >= commitThreshold {
            intent = .voteIn
        } else if horizontal <= -commitThreshold {
            intent = .skip
        } else {
            intent = .neutral
        }

        let emphasis = 1 + (progress * 0.12)
        let rotation = Double(max(min(horizontal / 12, 10), -10))

        return DecisionSwipePresentation(
            intent: intent,
            skipScale: horizontal < 0 ? emphasis : 1,
            voteInScale: horizontal > 0 ? emphasis : 1,
            skipGlow: horizontal < 0 ? Double(progress) : 0,
            voteInGlow: horizontal > 0 ? Double(progress) : 0,
            rotationDegrees: rotation
        )
    }
}

struct DecisionSwipeDeckState: Equatable {
    let visibleIDs: [String]
    let rewindCandidateID: String?
    let lastVote: DecisionVoteValue?

    init(visibleIDs: [String], rewindCandidateID: String? = nil, lastVote: DecisionVoteValue? = nil) {
        self.visibleIDs = visibleIDs
        self.rewindCandidateID = rewindCandidateID
        self.lastVote = lastVote
    }

    func committingVisible(_ vote: DecisionVoteValue) -> DecisionSwipeDeckState {
        guard let first = visibleIDs.first else { return self }
        return DecisionSwipeDeckState(
            visibleIDs: Array(visibleIDs.dropFirst()),
            rewindCandidateID: first,
            lastVote: vote
        )
    }

    func rewindingLast() -> DecisionSwipeDeckState {
        guard let rewindCandidateID else { return self }
        return DecisionSwipeDeckState(
            visibleIDs: [rewindCandidateID] + visibleIDs,
            rewindCandidateID: nil,
            lastVote: nil
        )
    }
}

enum DecisionUIState {
    static func optimisticVote(
        response: DecisionSessionResponse,
        candidateID: String,
        vote: DecisionVoteValue
    ) -> DecisionSessionResponse {
        response.replacingCandidates { candidate in
            guard candidate.id == candidateID else { return candidate }
            return candidate.replacingVote(vote)
        }
    }

    static func optimisticShortlistVote(
        response: DecisionSessionResponse,
        candidateID: String
    ) -> DecisionSessionResponse {
        response.replacingCandidates { candidate in
            candidate.replacingShortlistVote(candidate.id == candidateID)
        }
    }
}

private extension DecisionSessionResponse {
    func replacingCandidates(_ transform: (DecisionCandidate) -> DecisionCandidate) -> DecisionSessionResponse {
        let mappedCandidates = candidates.map(transform)
        let mappedDeck = deckCandidates?.map(transform)
        let mappedShortlist = shortlist?.map(transform)
        return DecisionSessionResponse(
            session: session,
            candidates: mappedCandidates,
            deckCandidates: mappedDeck,
            shortlist: mappedShortlist,
            recommendedFinalCandidate: recommendedFinalCandidate.map(transform),
            leader: leader.map(transform),
            messages: messages
        )
    }
}

private extension DecisionCandidate {
    func replacingVote(_ vote: DecisionVoteValue) -> DecisionCandidate {
        var nextInCount = inCount
        var nextSkipCount = skipCount
        if viewerVote == .voteIn {
            nextInCount -= 1
        } else if viewerVote == .skip {
            nextSkipCount -= 1
        }
        if vote == .voteIn {
            nextInCount += 1
        } else {
            nextSkipCount += 1
        }
        return copy(
            inCount: max(0, nextInCount),
            skipCount: max(0, nextSkipCount),
            viewerVote: vote
        )
    }

    func replacingShortlistVote(_ isSelected: Bool) -> DecisionCandidate {
        let current = viewerShortlistVote == true
        var nextCount = shortlistVoteCount ?? 0
        if current && !isSelected {
            nextCount -= 1
        } else if !current && isSelected {
            nextCount += 1
        }
        return copy(
            shortlistVoteCount: max(0, nextCount),
            viewerShortlistVote: isSelected
        )
    }

    func copy(
        inCount: Int? = nil,
        skipCount: Int? = nil,
        viewerVote: DecisionVoteValue? = nil,
        shortlistVoteCount: Int? = nil,
        viewerShortlistVote: Bool? = nil
    ) -> DecisionCandidate {
        DecisionCandidate(
            id: id,
            venueId: venueId,
            originalRank: originalRank,
            baseScore: baseScore,
            source: source,
            suggestedBy: suggestedBy,
            suggestedAt: suggestedAt,
            canRemove: canRemove,
            venue: venue,
            recommendation: recommendation,
            inCount: inCount ?? self.inCount,
            skipCount: skipCount ?? self.skipCount,
            viewerVote: viewerVote ?? self.viewerVote,
            shortlistVoteCount: shortlistVoteCount ?? self.shortlistVoteCount,
            viewerShortlistVote: viewerShortlistVote ?? self.viewerShortlistVote,
            groupFitScore: groupFitScore,
            groupFitMemberCount: groupFitMemberCount,
            groupFitReason: groupFitReason
        )
    }
}

private struct DecisionDeckCard: View {
    let candidate: DecisionCandidate
    let translation: CGSize
    let isPending: Bool
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let onAccountChanged: (MeResponse) -> Void
    let onDragChanged: (CGSize) -> Void
    let onDragEnded: (CGSize) -> Void
    let skip: () -> Void
    let voteIn: () -> Void
    let coming: () -> Void

    private var presentation: DecisionSwipePresentation {
        DecisionSwipePresentation.state(for: translation)
    }

    var body: some View {
        VStack(spacing: 14) {
            NightloopCard(fill: Color.white.opacity(0.042)) {
                VStack(alignment: .leading, spacing: 14) {
                    VenueArtView(venue: candidate.venue, height: 245, cornerRadius: 18)
                        .overlay(alignment: .topLeading) {
                            HStack(spacing: 8) {
                                LivenessChip(liveness: candidate.venue.liveness, compact: true)
                                ConfidencePips(confidence: candidate.venue.liveness?.confidence)
                            }
                            .padding(12)
                        }
                        .overlay(alignment: .topTrailing) {
                            swipeBadge
                                .padding(14)
                        }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(candidate.venue.name)
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(2)
                        Text("\(candidate.venue.neighborhood) · \(candidate.venue.category)")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                        Text(candidate.groupFitReason)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: 8) {
                        DecisionCountPill(title: "In", value: candidate.inCount, isSelected: candidate.viewerVote == .voteIn)
                        DecisionCountPill(title: "Skip", value: candidate.skipCount, isSelected: candidate.viewerVote == .skip)
                        Spacer()
                        Text("\(Int(candidate.groupFitScore))% fit")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.purple)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(NightloopTheme.purple.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
            }
            .offset(translation)
            .rotationEffect(.degrees(presentation.rotationDegrees))
            .shadow(color: NightloopTheme.purple.opacity(0.16 + presentation.voteInGlow * 0.22), radius: 18 + presentation.voteInGlow * 8, x: 0, y: 10)
            .shadow(color: NightloopTheme.rose.opacity(presentation.skipGlow * 0.22), radius: 18 + presentation.skipGlow * 8, x: 0, y: 10)
            .gesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        onDragChanged(value.translation)
                    }
                    .onEnded { value in
                        onDragEnded(value.translation)
                    }
            )
            .animation(.spring(response: 0.32, dampingFraction: 0.82), value: translation)

            HStack(spacing: 12) {
                Button(action: skip) {
                    Label("Skip", systemImage: "xmark")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.bordered)
                .tint(NightloopTheme.rose)
                .scaleEffect(presentation.skipScale)
                .shadow(color: NightloopTheme.rose.opacity(presentation.skipGlow * 0.36), radius: 14, x: 0, y: 7)

                NavigationLink {
                    VenueDetailView(
                        apiClient: apiClient,
                        authStore: authStore,
                        venueID: candidate.venue.id,
                        initialVenue: candidate.venue,
                        onAccountChanged: onAccountChanged
                    )
                } label: {
                    Label("Details", systemImage: "info.circle")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.bordered)
                .tint(NightloopTheme.ink)

                Button(action: voteIn) {
                    Label("I'm in", systemImage: "checkmark")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.fab)
                .scaleEffect(presentation.voteInScale)
                .shadow(color: NightloopTheme.fab.opacity(presentation.voteInGlow * 0.42), radius: 15, x: 0, y: 7)
            }
            .disabled(isPending)
        }
    }

    @ViewBuilder
    private var swipeBadge: some View {
        if presentation.intent == .voteIn {
            Label("I'm in", systemImage: "checkmark")
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.good)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.52))
                .clipShape(Capsule())
                .overlay {
                    Capsule().stroke(NightloopTheme.good.opacity(0.65))
                }
        } else if presentation.intent == .skip {
            Label("Skip", systemImage: "xmark")
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.rose)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.52))
                .clipShape(Capsule())
                .overlay {
                    Capsule().stroke(NightloopTheme.rose.opacity(0.65))
                }
        }
    }
}

private struct DecisionShortlistCard: View {
    let candidate: DecisionCandidate
    let isPending: Bool
    let canFinalize: Bool
    let vote: () -> Void
    let finalize: () -> Void
    let details: () -> Void

    var body: some View {
        NightloopCard(fill: candidate.viewerShortlistVote == true ? NightloopTheme.purpleSoft : Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    DecisionVenuePulseTile(venue: candidate.venue)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(candidate.venue.name)
                            .font(.headline.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(1)
                        Text("\(candidate.shortlistVoteCount ?? 0) picks · \(Int(candidate.groupFitScore))% fit")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }
                    Spacer()
                }

                HStack(spacing: 8) {
                    Button(action: vote) {
                        Label(candidate.viewerShortlistVote == true ? "Your pick" : "Pick winner", systemImage: "checkmark.seal.fill")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.purple)
                    .disabled(isPending)

                    Button(action: details) {
                        Label("I'm Coming", systemImage: "figure.walk")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.good)

                    if canFinalize {
                        Button(action: finalize) {
                            Image(systemName: "lock.fill")
                                .font(.caption.weight(.black))
                                .frame(width: 40, height: 34)
                        }
                        .buttonStyle(.bordered)
                        .tint(NightloopTheme.fab)
                        .accessibilityLabel("Lock final pick")
                    }
                }
            }
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

private struct DecisionProgressSheet: View {
    let progress: DecisionProgress

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            NightloopSectionHeader(title: "Group progress", trailing: "\(progress.confidence)%")
            Text(progress.readyForShortlist ? "Ready for shortlist." : "Swipe a few more picks to make the shortlist sharper.")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)

            VStack(spacing: 12) {
                ForEach(Array(progress.members.enumerated()), id: \.offset) { _, member in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(member.user.displayName)
                                .font(.caption.weight(.black))
                                .foregroundStyle(NightloopTheme.ink)
                            Spacer()
                            Text("\(member.swipedCount)/\(member.requiredSwipes)")
                                .font(.caption2.weight(.black))
                                .foregroundStyle(NightloopTheme.inkMuted)
                        }
                        GeometryReader { geometry in
                            let fraction = member.requiredSwipes == 0 ? 0 : min(1, CGFloat(member.swipedCount) / CGFloat(member.requiredSwipes))
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.08))
                                Capsule()
                                    .fill(LinearGradient(colors: [NightloopTheme.purple, NightloopTheme.fab], startPoint: .leading, endPoint: .trailing))
                                    .frame(width: geometry.size.width * fraction)
                            }
                        }
                        .frame(height: 7)
                    }
                }
            }
        }
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
