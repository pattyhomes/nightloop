import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct FriendsShellView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse

    @State private var friendsResponse: FriendsResponse?
    @State private var activityItems: [FriendActivityItem] = []
    @State private var searchText = ""
    @State private var searchResults: [FriendSearchItem] = []
    @State private var invite: FriendInvite?
    @State private var inviteCode = ""
    @State private var isLoading = true
    @State private var isSearching = false
    @State private var isCreatingInvite = false
    @State private var errorMessage: String?
    @State private var toastMessage: String?
    @State private var toastIsError = false
    @State private var pendingActionIDs: Set<String> = []
    @State private var selectedProfile: SocialProfileContext?

    private var ghostModeEnabled: Bool {
        me.settings?.ghostMode ?? false
    }

    private var friends: [FriendConnection] {
        friendsResponse?.friends ?? []
    }

    private var incomingRequests: [FriendConnection] {
        friendsResponse?.incomingRequests ?? []
    }

    private var outgoingRequests: [FriendConnection] {
        friendsResponse?.outgoingRequests ?? []
    }

    private var friendsGoingCount: Int {
        activityItems.filter(\.viewerHasComing).count
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            OrchidBackground(animated: true, gridOpacity: 0.035)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    socialStatusStrip
                    statsRow

                    if isLoading && friendsResponse == nil {
                        LoadingStateView(title: "Loading friends")
                    } else if let errorMessage, friendsResponse == nil {
                        ErrorStateView(title: "Friends unavailable", message: errorMessage) {
                            Task { await loadSocial() }
                        }
                    } else {
                        requestsSection
                        inviteSection
                        searchSection
                        friendsStrip
                        activitySection
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 18)
            }

            if let toastMessage {
                SignalToast(message: toastMessage, isError: toastIsError)
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await loadSocial() }
        .sheet(item: $selectedProfile) { context in
            SocialProfileSheet(
                context: context,
                isPending: pendingActionIDs.contains(context.profile.id),
                onUnfriend: { unfriend(context.profile) },
                onBlock: { block(context.profile) },
                onReport: { reportProfile(context.profile) }
            )
            .presentationDetents([.medium])
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("YOUR CREW")
                    .font(.caption2.weight(.black))
                    .tracking(1.6)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text("Friends")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(NightloopTheme.ink)
            }

            Spacer()

            GlassIconButton(systemName: "arrow.clockwise") {
                Task { await loadSocial() }
            }
        }
    }

    private var socialStatusStrip: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill((ghostModeEnabled ? NightloopTheme.amber : NightloopTheme.good).opacity(0.24))
                    .frame(width: 34, height: 34)
                Image(systemName: ghostModeEnabled ? "eye.slash.fill" : "person.2.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ghostModeEnabled ? NightloopTheme.amber : NightloopTheme.good)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(ghostModeEnabled ? "GHOST MODE ON" : "FRIENDS ACTIVITY")
                    .font(.caption2.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(Color(hex: "#e9d5ff"))
                Text(tickerText)
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

    private var tickerText: String {
        if ghostModeEnabled {
            return "Your activity is hidden tonight."
        }

        if let first = activityItems.first {
            return activitySummary(first, includeActor: true)
        }

        if friends.isEmpty {
            return "Add friends to see tonight plans here."
        }

        return "No friend activity yet tonight."
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            StatMiniCard(value: "\(friends.count)", label: "Friends", color: NightloopTheme.purple)
            StatMiniCard(value: "\(incomingRequests.count)", label: "Requests", color: incomingRequests.isEmpty ? NightloopTheme.ink : NightloopTheme.amber)
            StatMiniCard(value: "\(friendsGoingCount)", label: "Going", color: NightloopTheme.good)
        }
    }

    @ViewBuilder
    private var requestsSection: some View {
        if !incomingRequests.isEmpty || !outgoingRequests.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                NightloopSectionHeader(title: "Requests", trailing: "\(incomingRequests.count) incoming")

                VStack(spacing: 8) {
                    ForEach(incomingRequests) { connection in
                        RequestRow(
                            connection: connection,
                            isPending: pendingActionIDs.contains(connection.id),
                            onAccept: { accept(connection) },
                            onDecline: { decline(connection) },
                            onCancel: nil,
                            onProfile: { openProfile(connection.user, friendshipID: connection.friendship.id, isFriend: false) }
                        )
                    }

                    ForEach(outgoingRequests) { connection in
                        RequestRow(
                            connection: connection,
                            isPending: pendingActionIDs.contains(connection.id),
                            onAccept: nil,
                            onDecline: nil,
                            onCancel: { cancel(connection) },
                            onProfile: { openProfile(connection.user, friendshipID: connection.friendship.id, isFriend: false) }
                        )
                    }
                }
            }
        }
    }

    private var inviteSection: some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        NightloopSectionHeader(title: "Invite code", trailing: (invite?.codeHint).map { "ends \($0)" })
                        Text(invite?.code ?? "Create a 7-day code")
                            .font(.system(size: 22, weight: .black, design: .monospaced))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                        if let invite {
                            Text("Expires \(relativeTime(invite.expiresAt))")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NightloopTheme.inkMuted)
                        }
                    }

                    Spacer()

                    if let code = invite?.code {
                        QRCodeView(code: code)
                            .frame(width: 76, height: 76)
                    } else {
                        Image(systemName: "qrcode")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundStyle(NightloopTheme.purple)
                            .frame(width: 76, height: 76)
                            .background(Color.white.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }

                HStack(spacing: 8) {
                    Button {
                        createInvite()
                    } label: {
                        Label(invite == nil ? "Create" : "Refresh", systemImage: "qrcode")
                            .font(.caption.weight(.black))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.purple)
                    .disabled(isCreatingInvite)

                    if let invite {
                        Button {
                            UIPasteboard.general.string = invite.code
                            showToast("Code copied")
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption.weight(.black))
                                .frame(width: 38, height: 30)
                        }
                        .buttonStyle(.bordered)
                        .tint(NightloopTheme.purple)
                        .accessibilityLabel("Copy invite code")

                        Button {
                            revokeInvite(invite)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption.weight(.black))
                                .frame(width: 38, height: 30)
                        }
                        .buttonStyle(.bordered)
                        .tint(NightloopTheme.inkMuted)
                        .accessibilityLabel("Revoke invite")
                    }
                }

                HStack(spacing: 8) {
                    TextField("Enter invite code", text: $inviteCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.subheadline.weight(.bold))
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
                        acceptInviteCode()
                    } label: {
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.black))
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NightloopTheme.fab)
                    .disabled(inviteCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("Accept invite code")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            NightloopSectionHeader(title: "Find friends", trailing: searchResults.isEmpty ? nil : "\(searchResults.count) results")

            HStack(spacing: 8) {
                TextField("Name or @username", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .background(Color.white.opacity(0.055))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(NightloopTheme.hairline)
                    }
                    .onSubmit { search() }

                Button {
                    search()
                } label: {
                    Image(systemName: isSearching ? "hourglass" : "magnifyingglass")
                        .font(.subheadline.weight(.black))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(searchText.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || isSearching)
                .accessibilityLabel("Search friends")
            }

            if !searchResults.isEmpty {
                VStack(spacing: 8) {
                    ForEach(searchResults) { result in
                        SearchResultRow(
                            result: result,
                            isPending: pendingActionIDs.contains(result.id),
                            onAdd: { sendRequest(result) },
                            onProfile: { openProfile(result.profile, friendshipID: result.friendshipId, isFriend: result.friendshipStatus == "accepted") }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var friendsStrip: some View {
        if !friends.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                NightloopSectionHeader(title: "Friends", trailing: "\(friends.count)")

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(friends) { connection in
                            FriendBubble(profile: connection.user) {
                                openProfile(connection.user, friendshipID: connection.friendship.id, isFriend: true)
                            }
                        }
                    }
                }
            }
        }
    }

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            NightloopSectionHeader(title: "Tonight activity", trailing: activityItems.isEmpty ? nil : "\(activityItems.count)")

            if activityItems.isEmpty {
                EmptyStateView(
                    title: "Quiet so far",
                    message: friends.isEmpty ? "Search or share a code to build your crew." : "Friend signals and plans will appear here tonight."
                )
            } else {
                VStack(spacing: 12) {
                    ForEach(activityItems) { activity in
                        FriendActivityCard(
                            activity: activity,
                            isPending: pendingActionIDs.contains(activity.id),
                            onProfile: { openProfile(activity.actor, friendshipID: nil, isFriend: true) },
                            onComing: { setComing(for: activity) },
                            onReply: { text in reply(to: activity, text: text) },
                            onEmoji: { kind in emojiReply(to: activity, kind: kind) },
                            onReport: { reportActivity(activity) }
                        )
                    }
                }
            }
        }
    }

    private func loadSocial() async {
        guard let token = authStore.accessToken else {
            isLoading = false
            errorMessage = "Sign in to sync friends."
            return
        }

        isLoading = friendsResponse == nil
        errorMessage = nil

        do {
            async let friendsTask = apiClient.friends(bearerToken: token)
            async let activityTask = apiClient.friendActivity(bearerToken: token)
            let (friends, activity) = try await (friendsTask, activityTask)
            friendsResponse = friends
            activityItems = activity.items
        } catch {
            errorMessage = error.localizedDescription
            showToast(error.localizedDescription, isError: true)
        }

        isLoading = false
    }

    private func search() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2, let token = authStore.accessToken else { return }

        Task {
            isSearching = true
            do {
                searchResults = try await apiClient.searchFriends(query: query, bearerToken: token).items
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isSearching = false
        }
    }

    private func sendRequest(_ result: FriendSearchItem) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(result.id)
            do {
                _ = try await apiClient.sendFriendRequest(userID: result.id, bearerToken: token)
                showToast("Request sent")
                await loadSocial()
                search()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(result.id)
        }
    }

    private func accept(_ connection: FriendConnection) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(connection.id)
            do {
                _ = try await apiClient.acceptFriendRequest(friendshipID: connection.friendship.id, bearerToken: token)
                showToast("Friend added")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(connection.id)
        }
    }

    private func decline(_ connection: FriendConnection) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(connection.id)
            do {
                _ = try await apiClient.declineFriendRequest(friendshipID: connection.friendship.id, bearerToken: token)
                showToast("Request declined")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(connection.id)
        }
    }

    private func cancel(_ connection: FriendConnection) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(connection.id)
            do {
                _ = try await apiClient.cancelFriendRequest(friendshipID: connection.friendship.id, bearerToken: token)
                showToast("Request cancelled")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(connection.id)
        }
    }

    private func createInvite() {
        guard let token = authStore.accessToken else { return }

        Task {
            isCreatingInvite = true
            do {
                invite = try await apiClient.createFriendInvite(bearerToken: token).invite
                showToast("Invite code ready")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            isCreatingInvite = false
        }
    }

    private func revokeInvite(_ invite: FriendInvite) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(invite.id)
            do {
                _ = try await apiClient.revokeFriendInvite(inviteID: invite.id, bearerToken: token)
                self.invite = nil
                showToast("Invite revoked")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(invite.id)
        }
    }

    private func acceptInviteCode() {
        let code = inviteCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty, let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert("accept-invite")
            do {
                _ = try await apiClient.acceptFriendInvite(code: code, bearerToken: token)
                inviteCode = ""
                showToast("Invite accepted")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove("accept-invite")
        }
    }

    private func setComing(for activity: FriendActivityItem) {
        guard let venueID = activity.venue?.id, let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(activity.id)
            do {
                if activity.viewerHasComing {
                    _ = try await apiClient.cancelComing(venueID: venueID, bearerToken: token)
                    showToast("Plan removed")
                } else {
                    _ = try await apiClient.toggleComing(venueID: venueID, isComing: true, bearerToken: token)
                    showToast("You're coming")
                }
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(activity.id)
        }
    }

    private func reply(to activity: FriendActivityItem, text: String) {
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(140))
        guard !trimmed.isEmpty, let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(activity.id)
            do {
                _ = try await apiClient.replyToActivity(activityID: activity.id, kind: .comment, text: trimmed, bearerToken: token)
                showToast("Reply sent")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(activity.id)
        }
    }

    private func emojiReply(to activity: FriendActivityItem, kind: SignalKind) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(activity.id)
            do {
                _ = try await apiClient.replyToActivity(activityID: activity.id, kind: .emojiSignal, signalKind: kind, bearerToken: token)
                showToast("Signal reply sent")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(activity.id)
        }
    }

    private func reportActivity(_ activity: FriendActivityItem) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(activity.id)
            do {
                _ = try await apiClient.reportActivity(activityID: activity.id, reason: "inappropriate", bearerToken: token)
                showToast("Report sent")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(activity.id)
        }
    }

    private func unfriend(_ profile: FriendProfile) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(profile.id)
            do {
                _ = try await apiClient.unfriend(userID: profile.id, bearerToken: token)
                selectedProfile = nil
                showToast("Friend removed")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(profile.id)
        }
    }

    private func block(_ profile: FriendProfile) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(profile.id)
            do {
                _ = try await apiClient.blockUser(userID: profile.id, bearerToken: token)
                selectedProfile = nil
                showToast("Blocked")
                await loadSocial()
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(profile.id)
        }
    }

    private func reportProfile(_ profile: FriendProfile) {
        guard let token = authStore.accessToken else { return }

        Task {
            pendingActionIDs.insert(profile.id)
            do {
                _ = try await apiClient.reportProfile(userID: profile.id, reason: "inappropriate", bearerToken: token)
                selectedProfile = nil
                showToast("Report sent")
            } catch {
                showToast(error.localizedDescription, isError: true)
            }
            pendingActionIDs.remove(profile.id)
        }
    }

    private func openProfile(_ profile: FriendProfile, friendshipID: String?, isFriend: Bool) {
        selectedProfile = SocialProfileContext(profile: profile, friendshipID: friendshipID, isFriend: isFriend)
    }

    private func showToast(_ message: String, isError: Bool = false) {
        toastMessage = message
        toastIsError = isError
        Task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if toastMessage == message {
                withAnimation {
                    toastMessage = nil
                    toastIsError = false
                }
            }
        }
    }
}

private struct RequestRow: View {
    let connection: FriendConnection
    let isPending: Bool
    let onAccept: (() -> Void)?
    let onDecline: (() -> Void)?
    let onCancel: (() -> Void)?
    let onProfile: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onProfile) {
                AvatarInitials(initials: initials(for: connection.user.displayName), color: NightloopTheme.rose)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                Text(connection.user.displayName)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                Text("@\(connection.user.username)")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            Spacer()

            if let onAccept, let onDecline {
                SocialIconButton(systemName: "checkmark", color: NightloopTheme.good, isPending: isPending, action: onAccept)
                SocialIconButton(systemName: "xmark", color: NightloopTheme.inkMuted, isPending: isPending, action: onDecline)
            } else if let onCancel {
                Button("Cancel", action: onCancel)
                    .font(.caption.weight(.bold))
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.inkMuted)
                    .disabled(isPending)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}

private struct SearchResultRow: View {
    let result: FriendSearchItem
    let isPending: Bool
    let onAdd: () -> Void
    let onProfile: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onProfile) {
                AvatarInitials(initials: initials(for: result.displayName), color: NightloopTheme.purple)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                Text(result.displayName)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                Text("@\(result.username)")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            Spacer()

            if result.friendshipStatus == "none" {
                Button {
                    onAdd()
                } label: {
                    Label("Add", systemImage: "person.badge.plus")
                        .font(.caption.weight(.black))
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.purple)
                .disabled(isPending)
            } else {
                Text(statusLabel)
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.05))
                    .clipShape(Capsule())
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }

    private var statusLabel: String {
        switch result.friendshipStatus {
        case "accepted": return "Friends"
        case "pending": return result.direction == "incoming" ? "Requested you" : "Sent"
        default: return result.friendshipStatus.capitalized
        }
    }
}

private struct FriendBubble: View {
    let profile: FriendProfile
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                AvatarInitials(initials: initials(for: profile.displayName), color: NightloopTheme.purple)
                Text(profile.displayName)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                    .frame(width: 72)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .background(Color.white.opacity(0.035))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(NightloopTheme.hairline)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct FriendActivityCard: View {
    let activity: FriendActivityItem
    let isPending: Bool
    let onProfile: () -> Void
    let onComing: () -> Void
    let onReply: (String) -> Void
    let onEmoji: (SignalKind) -> Void
    let onReport: () -> Void

    @State private var replyText = ""

    var body: some View {
        NightloopCard(fill: Color.white.opacity(0.045)) {
            VStack(alignment: .leading, spacing: 13) {
                header

                if let venue = activity.venue {
                    VenueMiniStrip(venue: venue)
                }

                Text(activitySummary(activity, includeActor: false))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NightloopTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)

                activityActions

                if !activity.replies.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(activity.replies) { reply in
                            ReplyRow(reply: reply)
                        }
                    }
                }

                replyComposer
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button(action: onProfile) {
                AvatarInitials(initials: initials(for: activity.actor.displayName), color: activity.type == .coming ? NightloopTheme.good : NightloopTheme.rose)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(activity.actor.displayName)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Text("@\(activity.actor.username) · \(relativeTime(activity.createdAt))")
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            Spacer()

            activityPill

            Menu {
                Button("Report", role: .destructive, action: onReport)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
        }
    }

    private var activityPill: some View {
        HStack(spacing: 5) {
            Image(systemName: activityIcon)
                .font(.caption2.weight(.black))
            Text(activityLabel)
                .font(.caption2.weight(.black))
                .lineLimit(1)
        }
        .foregroundStyle(NightloopTheme.ink)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(activityColor.opacity(0.18))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(activityColor.opacity(0.36))
        }
    }

    private var activityActions: some View {
        HStack(spacing: 8) {
            if activity.venue != nil {
                Button {
                    onComing()
                } label: {
                    Label(activity.viewerHasComing ? "You're going" : "I'm Coming", systemImage: activity.viewerHasComing ? "checkmark.circle.fill" : "sparkles")
                        .font(.caption.weight(.black))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(activity.viewerHasComing ? NightloopTheme.good : NightloopTheme.purple)
                .disabled(isPending)
            }

            ForEach([SignalKind.packed, .shortLine, .eventLive], id: \.self) { kind in
                Button {
                    onEmoji(kind)
                } label: {
                    Image(systemName: kind.symbol)
                        .font(.caption.weight(.black))
                        .frame(width: 34, height: 30)
                }
                .buttonStyle(.bordered)
                .tint(kind.tint)
                .disabled(isPending)
                .accessibilityLabel("\(kind.label) reply")
            }
        }
    }

    private var replyComposer: some View {
        HStack(spacing: 8) {
            TextField("Reply", text: $replyText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NightloopTheme.ink)
                .padding(.horizontal, 10)
                .frame(height: 38)
                .background(Color.white.opacity(0.055))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(NightloopTheme.hairline)
                }
                .onChange(of: replyText) { _, value in
                    if value.count > 140 {
                        replyText = String(value.prefix(140))
                    }
                }

            Button {
                let value = replyText
                replyText = ""
                onReply(value)
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.caption.weight(.black))
                    .frame(width: 38, height: 38)
            }
            .buttonStyle(.borderedProminent)
            .tint(NightloopTheme.fab)
            .disabled(replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isPending)
            .accessibilityLabel("Send reply")
        }
    }

    private var activityIcon: String {
        switch activity.type {
        case .signal: return activity.signalKind?.symbol ?? "dot.radiowaves.left.and.right"
        case .coming: return "sparkles"
        case .comment: return "text.bubble.fill"
        case .emojiSignal: return activity.signalKind?.symbol ?? "hand.tap.fill"
        }
    }

    private var activityLabel: String {
        switch activity.type {
        case .signal: return activity.signalKind?.label ?? "Signal"
        case .coming: return "Going"
        case .comment: return "Reply"
        case .emojiSignal: return activity.signalKind?.label ?? "Tap"
        }
    }

    private var activityColor: Color {
        switch activity.type {
        case .signal: return activity.signalKind?.tint ?? NightloopTheme.rose
        case .coming: return NightloopTheme.good
        case .comment: return NightloopTheme.purple
        case .emojiSignal: return activity.signalKind?.tint ?? NightloopTheme.amber
        }
    }
}

private struct VenueMiniStrip: View {
    let venue: FriendActivityVenue

    var body: some View {
        HStack(spacing: 12) {
            VenueFallbackArt(
                title: venue.name,
                subtitle: venue.neighborhood ?? "SF",
                score: 72,
                height: 74,
                cornerRadius: 12,
                symbol: "music.note"
            )
            .frame(width: 112)

            VStack(alignment: .leading, spacing: 5) {
                Text(venue.name)
                    .font(.headline.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text([venue.neighborhood, venue.category?.capitalized].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .lineLimit(1)
                Text("Tonight plan")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(NightloopTheme.good)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(8)
        .background(Color.white.opacity(0.035))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}

private struct ReplyRow: View {
    let reply: FriendActivityReply

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            AvatarInitials(initials: initials(for: reply.actor.displayName), color: NightloopTheme.cool)
                .scaleEffect(0.72)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.actor.displayName)
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Text(replyText)
                    .font(.caption)
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(9)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var replyText: String {
        if let text = reply.text, !text.isEmpty {
            return text
        }
        if let signalKind = reply.signalKind {
            return signalKind.label
        }
        return "Reply"
    }
}

private struct SocialProfileSheet: View {
    let context: SocialProfileContext
    let isPending: Bool
    let onUnfriend: () -> Void
    let onBlock: () -> Void
    let onReport: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            OrchidBackground(animated: false)

            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    AvatarInitials(initials: initials(for: context.profile.displayName), color: NightloopTheme.rose)
                        .scaleEffect(1.42)
                        .frame(width: 62, height: 62)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.profile.displayName)
                            .font(.title2.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineLimit(1)
                        Text("@\(context.profile.username)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NightloopTheme.inkMuted)
                    }

                    Spacer()

                    GlassIconButton(systemName: "xmark") {
                        dismiss()
                    }
                    .accessibilityLabel("Close")
                }

                if let bio = context.profile.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if context.isFriend {
                    Button(role: .destructive, action: onUnfriend) {
                        Label("Unfriend", systemImage: "person.crop.circle.badge.minus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(NightloopTheme.amber)
                    .disabled(isPending)
                }

                Button(role: .destructive, action: onBlock) {
                    Label("Block", systemImage: "hand.raised.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(NightloopTheme.rose)
                .disabled(isPending)

                Button(role: .destructive, action: onReport) {
                    Label("Report", systemImage: "flag.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(NightloopTheme.inkMuted)
                .disabled(isPending)

                Spacer()
            }
            .padding(22)
        }
        .preferredColorScheme(.dark)
    }
}

private struct SocialIconButton: View {
    let systemName: String
    let color: Color
    let isPending: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.caption.weight(.black))
                .frame(width: 32, height: 30)
        }
        .buttonStyle(.borderedProminent)
        .tint(color)
        .disabled(isPending)
    }
}

private struct QRCodeView: View {
    let code: String

    var body: some View {
        Group {
            if let image = QRCodeGenerator.image(from: code) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .padding(6)
                    .background(.white)
            } else {
                Image(systemName: "qrcode")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(NightloopTheme.purple)
                    .background(.white)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private enum QRCodeGenerator {
    static func image(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else { return nil }
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private struct SocialProfileContext: Identifiable {
    let profile: FriendProfile
    let friendshipID: String?
    let isFriend: Bool

    var id: String { profile.id }
}

private extension FriendSearchItem {
    var profile: FriendProfile {
        FriendProfile(
            id: id,
            displayName: displayName,
            username: username,
            avatarKind: avatarKind,
            bio: bio
        )
    }
}

private extension SignalKind {
    var tint: Color {
        switch self {
        case .packed: return NightloopTheme.rose
        case .shortLine: return NightloopTheme.good
        case .longLine: return NightloopTheme.amber
        case .dead: return NightloopTheme.cool
        case .eventLive: return NightloopTheme.purple
        }
    }
}

private func activitySummary(_ activity: FriendActivityItem, includeActor: Bool) -> String {
    let actor = includeActor ? "\(activity.actor.displayName) " : ""
    let venue = activity.venue?.name

    switch activity.type {
    case .signal:
        let signal = activity.signalKind?.label.lowercased() ?? "signal"
        if let venue {
            return "\(actor)shared \(signal) at \(venue)"
        }
        return "\(actor)shared \(signal)"
    case .coming:
        if let venue {
            return "\(actor)is coming to \(venue)"
        }
        return "\(actor)is coming tonight"
    case .comment:
        return activity.text ?? "\(actor)replied"
    case .emojiSignal:
        let signal = activity.signalKind?.label.lowercased() ?? "a signal"
        if let venue {
            return "\(actor)tapped \(signal) for \(venue)"
        }
        return "\(actor)tapped \(signal)"
    }
}

private func initials(for name: String) -> String {
    let parts = name.split(separator: " ")
    let letters = parts.prefix(2).compactMap { $0.first }
    return letters.isEmpty ? "NL" : String(letters)
}

private func relativeTime(_ value: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    guard let date else { return "soon" }
    return date.formatted(.relative(presentation: .numeric))
}
