import Foundation

enum NightloopAPIError: LocalizedError, Equatable {
    case server(code: String, message: String, details: JSONValue?)
    case transport(statusCode: Int, message: String)
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .server(_, let message, _):
            return message
        case .transport(let statusCode, let message):
            return "Request failed with \(statusCode): \(message)"
        case .invalidURL:
            return "The Nightloop API URL is invalid."
        }
    }
}

struct NightloopAPIClient {
    let baseURL: URL
    var session: URLSession = .shared

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func makeRequest(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        bearerToken: String? = nil,
        body: Data? = nil
    ) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw NightloopAPIError.invalidURL
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let requestPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, requestPath].filter { !$0.isEmpty }.joined(separator: "/")
        components.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = components.url else {
            throw NightloopAPIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let bearerToken, !bearerToken.isEmpty {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        return request
    }

    func me(bearerToken: String) async throws -> MeResponse {
        try await send(path: "me", bearerToken: bearerToken)
    }

    func attestAge(is21OrOver: Bool, bearerToken: String) async throws -> MeResponse {
        let body = AgeAttestationBody(is21OrOver: is21OrOver)
        return try await send(path: "me/age-attestation", method: "POST", bearerToken: bearerToken, body: body)
    }

    func updateProfile(
        displayName: String?,
        username: String?,
        selectedMarketId: String?,
        bio: String? = nil,
        includeBio: Bool = false,
        bearerToken: String
    ) async throws -> MeResponse {
        let body = ProfilePatchBody(
            displayName: displayName,
            username: username,
            selectedMarketId: selectedMarketId,
            bio: bio,
            shouldEncodeBio: includeBio || bio != nil
        )
        return try await send(path: "me/profile", method: "PATCH", bearerToken: bearerToken, body: body)
    }

    func updateSettings(_ settings: UserSettings, bearerToken: String) async throws -> MeResponse {
        try await send(path: "me/settings", method: "PATCH", bearerToken: bearerToken, body: settings)
    }

    func preferences(bearerToken: String) async throws -> PreferencesResponse {
        try await send(path: "me/preferences", bearerToken: bearerToken)
    }

    func recentSignals(bearerToken: String, limit: Int = 5) async throws -> RecentSignalsResponse {
        try await send(
            path: "me/signals",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))],
            bearerToken: bearerToken
        )
    }

    func friends(bearerToken: String) async throws -> FriendsResponse {
        try await send(path: "friends", bearerToken: bearerToken)
    }

    func searchFriends(query: String, bearerToken: String, limit: Int = 20) async throws -> FriendSearchResponse {
        try await send(
            path: "friends/search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: String(limit))
            ],
            bearerToken: bearerToken
        )
    }

    func friendActivity(bearerToken: String, limit: Int = 30) async throws -> FriendActivityResponse {
        try await send(
            path: "friends/activity",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))],
            bearerToken: bearerToken
        )
    }

    func friendsTonight(bearerToken: String, limit: Int = 10) async throws -> FriendsTonightResponse {
        try await send(
            path: "friends/tonight",
            queryItems: [URLQueryItem(name: "limit", value: String(limit))],
            bearerToken: bearerToken
        )
    }

    func sendFriendRequest(userID: String, bearerToken: String) async throws -> FriendRequestResponse {
        try await send(path: "friends/requests", method: "POST", bearerToken: bearerToken, body: UserIDBody(userID: userID))
    }

    func acceptFriendRequest(friendshipID: String, bearerToken: String) async throws -> FriendshipResponse {
        try await send(path: "friends/requests/\(friendshipID)/accept", method: "POST", bearerToken: bearerToken, body: EmptyBody())
    }

    func declineFriendRequest(friendshipID: String, bearerToken: String) async throws -> FriendshipResponse {
        try await send(path: "friends/requests/\(friendshipID)/decline", method: "POST", bearerToken: bearerToken, body: EmptyBody())
    }

    func cancelFriendRequest(friendshipID: String, bearerToken: String) async throws -> SocialStatusResponse {
        try await send(path: "friends/requests/\(friendshipID)", method: "DELETE", bearerToken: bearerToken)
    }

    func unfriend(userID: String, bearerToken: String) async throws -> SocialStatusResponse {
        try await send(path: "friends/\(userID)", method: "DELETE", bearerToken: bearerToken)
    }

    func blockUser(userID: String, bearerToken: String) async throws -> FriendBlockResponse {
        try await send(path: "friends/blocks", method: "POST", bearerToken: bearerToken, body: UserIDBody(userID: userID))
    }

    func createFriendInvite(bearerToken: String) async throws -> FriendInviteResponse {
        try await send(path: "friends/invites", method: "POST", bearerToken: bearerToken, body: EmptyBody())
    }

    func acceptFriendInvite(code: String, bearerToken: String) async throws -> FriendshipResponse {
        try await send(path: "friends/invites/accept", method: "POST", bearerToken: bearerToken, body: InviteAcceptBody(code: code))
    }

    func revokeFriendInvite(inviteID: String, bearerToken: String) async throws -> FriendInviteResponse {
        try await send(path: "friends/invites/\(inviteID)", method: "DELETE", bearerToken: bearerToken)
    }

    func toggleComing(venueID: String, isComing: Bool, bearerToken: String) async throws -> FriendActivityMutationResponse {
        try await send(
            path: "friends/venues/\(venueID)/coming",
            method: "POST",
            bearerToken: bearerToken,
            body: ComingBody(isComing: isComing)
        )
    }

    func cancelComing(venueID: String, bearerToken: String) async throws -> SocialStatusResponse {
        try await send(
            path: "friends/venues/\(venueID)/coming",
            method: "POST",
            bearerToken: bearerToken,
            body: ComingBody(isComing: false)
        )
    }

    func replyToActivity(
        activityID: String,
        kind: FriendActivityType,
        text: String? = nil,
        signalKind: SignalKind? = nil,
        bearerToken: String
    ) async throws -> FriendReplyResponse {
        try await send(
            path: "friends/activity/\(activityID)/replies",
            method: "POST",
            bearerToken: bearerToken,
            body: ActivityReplyBody(kind: kind, text: text, signalKind: signalKind)
        )
    }

    func reportActivity(activityID: String, reason: String, bearerToken: String) async throws -> SocialReportResponse {
        try await send(
            path: "friends/activity/\(activityID)/report",
            method: "POST",
            bearerToken: bearerToken,
            body: SocialReportBody(reason: reason)
        )
    }

    func reportProfile(userID: String, reason: String, bearerToken: String) async throws -> SocialReportResponse {
        try await send(
            path: "friends/profiles/\(userID)/report",
            method: "POST",
            bearerToken: bearerToken,
            body: SocialReportBody(reason: reason)
        )
    }

    func decisionSessions(bearerToken: String) async throws -> DecisionSessionListResponse {
        try await send(path: "decision-sessions", bearerToken: bearerToken)
    }

    func createDecisionSession(
        marketID: String,
        invitedUserIDs: [String],
        filters: DecisionFilters?,
        bearerToken: String
    ) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionCreateBody(marketID: marketID, invitedUserIDs: invitedUserIDs, filters: filters)
        )
    }

    func decisionSession(id: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(path: "decision-sessions/\(id)", bearerToken: bearerToken)
    }

    func searchDecisionVenues(
        sessionID: String,
        query: String,
        bearerToken: String,
        limit: Int = 12
    ) async throws -> DecisionVenueSearchResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/venue-search",
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: "\(limit)")
            ],
            bearerToken: bearerToken
        )
    }

    func joinDecisionSession(id: String, code: String?, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/join",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionJoinBody(code: code)
        )
    }

    func joinDecisionSession(code: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/join",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionJoinBody(code: code)
        )
    }

    func voteDecisionSession(
        id: String,
        candidateID: String,
        vote: DecisionVoteValue,
        bearerToken: String
    ) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/votes",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionVoteBody(candidateID: candidateID, venueID: nil, vote: vote)
        )
    }

    func rewindDecisionSession(id: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/rewind",
            method: "POST",
            bearerToken: bearerToken,
            body: EmptyBody()
        )
    }

    func advanceDecisionShortlist(sessionID: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/advance-shortlist",
            method: "POST",
            bearerToken: bearerToken,
            body: EmptyBody()
        )
    }

    func voteDecisionShortlist(
        sessionID: String,
        candidateID: String,
        bearerToken: String
    ) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/shortlist-votes",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionShortlistVoteBody(candidateID: candidateID)
        )
    }

    func suggestDecisionCandidate(sessionID: String, venueID: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/candidates",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionCandidateBody(venueID: venueID)
        )
    }

    func removeDecisionCandidate(sessionID: String, candidateID: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/candidates/\(candidateID)",
            method: "DELETE",
            bearerToken: bearerToken
        )
    }

    func finalizeDecisionSession(
        id: String,
        candidateID: String,
        meetupAt: String?,
        note: String?,
        bearerToken: String
    ) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/finalize",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionFinalizeBody(candidateID: candidateID, finalMeetupAt: meetupAt, finalNote: note)
        )
    }

    func addDecisionMessage(
        sessionID: String,
        type: DecisionMessageType,
        text: String? = nil,
        emoji: DecisionEmoji? = nil,
        bearerToken: String
    ) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/messages",
            method: "POST",
            bearerToken: bearerToken,
            body: DecisionMessageBody(type: type, text: text, emoji: emoji)
        )
    }

    func reportDecisionMessage(
        sessionID: String,
        messageID: String,
        reason: String,
        bearerToken: String
    ) async throws -> SocialReportResponse {
        try await send(
            path: "decision-sessions/\(sessionID)/messages/\(messageID)/report",
            method: "POST",
            bearerToken: bearerToken,
            body: SocialReportBody(reason: reason)
        )
    }

    func revokeDecisionSessionCode(id: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/revoke-code",
            method: "POST",
            bearerToken: bearerToken,
            body: EmptyBody()
        )
    }

    func endDecisionSession(id: String, bearerToken: String) async throws -> DecisionSessionResponse {
        try await send(
            path: "decision-sessions/\(id)/end",
            method: "POST",
            bearerToken: bearerToken,
            body: EmptyBody()
        )
    }

    func replacePreferences(_ preferences: [String: [String]], bearerToken: String) async throws -> PreferencesResponse {
        try await send(path: "me/preferences", method: "PUT", bearerToken: bearerToken, body: preferences)
    }

    func registerDeviceToken(
        token: String,
        apnsEnvironment: String? = nil,
        appVersion: String? = nil,
        buildNumber: String? = nil,
        bearerToken: String
    ) async throws -> DeviceTokenResponse {
        try await send(
            path: "me/device-tokens",
            method: "POST",
            bearerToken: bearerToken,
            body: DeviceTokenBody(
                token: token,
                apnsEnvironment: apnsEnvironment,
                appVersion: appVersion,
                buildNumber: buildNumber
            )
        )
    }

    func revokeDeviceToken(token: String, bearerToken: String) async throws -> DeviceTokenRevokeResponse {
        try await send(
            path: "me/device-tokens",
            method: "DELETE",
            bearerToken: bearerToken,
            body: DeviceTokenDeleteBody(token: token)
        )
    }

    func notificationPreferences(bearerToken: String) async throws -> NotificationPreferencesResponse {
        try await send(path: "me/notification-preferences", bearerToken: bearerToken)
    }

    func updateNotificationPreferences(
        _ preferences: NotificationPreferences,
        bearerToken: String
    ) async throws -> NotificationPreferencesResponse {
        try await send(
            path: "me/notification-preferences",
            method: "PATCH",
            bearerToken: bearerToken,
            body: NotificationPreferencesPatchBody(preferences: preferences)
        )
    }

    func markets() async throws -> MarketsResponse {
        try await send(path: "markets", bearerToken: nil)
    }

    func marketConfig(id: String) async throws -> MarketConfigResponse {
        try await send(path: "markets/\(id)/config", bearerToken: nil)
    }

    func venues(
        marketID: String,
        bearerToken: String,
        limit: Int = 30,
        pulse: String? = nil,
        userCoordinate: Coordinate? = nil
    ) async throws -> VenueListResponse {
        var queryItems = [
            URLQueryItem(name: "market_id", value: marketID),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let pulse {
            queryItems.append(URLQueryItem(name: "pulse", value: pulse))
        }
        if let userCoordinate {
            queryItems.append(URLQueryItem(name: "lat", value: String(userCoordinate.latitude)))
            queryItems.append(URLQueryItem(name: "lng", value: String(userCoordinate.longitude)))
        }

        return try await send(
            path: "venues",
            queryItems: queryItems,
            bearerToken: bearerToken
        )
    }

    func recommendations(
        marketID: String,
        bearerToken: String,
        limit: Int = 30,
        pulse: String? = nil
    ) async throws -> RecommendationListResponse {
        var queryItems = [
            URLQueryItem(name: "market_id", value: marketID),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let pulse {
            queryItems.append(URLQueryItem(name: "pulse", value: pulse))
        }

        return try await send(
            path: "recommendations",
            queryItems: queryItems,
            bearerToken: bearerToken
        )
    }

    func venue(id: String, bearerToken: String) async throws -> VenueDetailResponse {
        try await send(path: "venues/\(id)", bearerToken: bearerToken)
    }

    func submitSignal(
        venueID: String,
        kind: SignalKind,
        bearerToken: String,
        userCoordinate: Coordinate,
        details: SignalDetails? = nil
    ) async throws -> SignalResponse {
        let body = SignalBody(venueID: venueID, kind: kind, location: userCoordinate, details: details)
        return try await send(path: "signals", method: "POST", bearerToken: bearerToken, body: body)
    }

    func deleteAccount(bearerToken: String) async throws -> AccountDeletionResponse {
        try await send(path: "me/account", method: "DELETE", bearerToken: bearerToken)
    }

    #if DEBUG
    func createConfirmedDevAuthUser(email: String, password: String) async throws -> DevConfirmedAuthUserResponse {
        try await send(
            path: "dev/confirmed-auth-user",
            method: "POST",
            bearerToken: nil,
            body: DevConfirmedAuthUserBody(email: email, password: password)
        )
    }

    func resetDevSocialCrew(market: String = "san-francisco") async throws -> DevSocialCrewResetResponse {
        try await send(
            path: "dev/social-crew/reset",
            method: "POST",
            bearerToken: nil,
            body: DevSocialCrewResetBody(market: market)
        )
    }

    func sendDevRoomNotification(
        sessionID: String,
        category: RoomNotificationCategory,
        bearerToken: String,
        actorDisplayName: String? = nil
    ) async throws -> DevRoomNotificationResponse {
        try await send(
            path: "dev/notifications/room-test",
            method: "POST",
            bearerToken: bearerToken,
            body: DevRoomNotificationBody(
                sessionID: sessionID,
                category: category,
                actorDisplayName: actorDisplayName
            )
        )
    }
    #endif

    private func send<Response: Decodable>(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        bearerToken: String?
    ) async throws -> Response {
        let request = try makeRequest(path: path, method: method, queryItems: queryItems, bearerToken: bearerToken)
        return try await perform(request)
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        bearerToken: String?,
        body: Body
    ) async throws -> Response {
        let bodyData = try encoder.encode(body)
        let request = try makeRequest(path: path, method: method, queryItems: queryItems, bearerToken: bearerToken, body: bodyData)
        return try await perform(request)
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NightloopAPIError.transport(statusCode: -1, message: "No HTTP response was returned.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw NightloopAPIError.server(
                    code: envelope.error.code,
                    message: envelope.error.message,
                    details: envelope.error.details
                )
            }

            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw NightloopAPIError.transport(statusCode: httpResponse.statusCode, message: body)
        }

        return try decoder.decode(Response.self, from: data)
    }
}

private struct AgeAttestationBody: Encodable {
    let is21OrOver: Bool

    enum CodingKeys: String, CodingKey {
        case is21OrOver = "is_21_or_over"
    }
}

private struct ProfilePatchBody: Encodable {
    let displayName: String?
    let username: String?
    let selectedMarketId: String?
    let bio: String?
    let shouldEncodeBio: Bool

    enum CodingKeys: String, CodingKey {
        case displayName
        case username
        case selectedMarketId
        case bio
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(displayName, forKey: .displayName)
        try container.encodeIfPresent(username, forKey: .username)
        try container.encodeIfPresent(selectedMarketId, forKey: .selectedMarketId)

        if shouldEncodeBio {
            if let bio {
                try container.encode(bio, forKey: .bio)
            } else {
                try container.encodeNil(forKey: .bio)
            }
        }
    }
}

private struct SignalBody: Encodable {
    let venueID: String
    let kind: SignalKind
    let location: Coordinate
    let details: SignalDetails?

    enum CodingKeys: String, CodingKey {
        case venueID = "venue_id"
        case kind
        case location
        case details
    }
}

private struct EmptyBody: Encodable {}

private struct UserIDBody: Encodable {
    let userID: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
    }
}

private struct InviteAcceptBody: Encodable {
    let code: String
}

private struct ComingBody: Encodable {
    let isComing: Bool

    enum CodingKeys: String, CodingKey {
        case isComing = "is_coming"
    }
}

private struct ActivityReplyBody: Encodable {
    let kind: FriendActivityType
    let text: String?
    let signalKind: SignalKind?

    enum CodingKeys: String, CodingKey {
        case kind
        case text
        case signalKind = "signal_kind"
    }
}

private struct SocialReportBody: Encodable {
    let reason: String
}

private struct DecisionCreateBody: Encodable {
    let marketID: String
    let invitedUserIDs: [String]
    let filters: DecisionFilters?

    enum CodingKeys: String, CodingKey {
        case marketID = "market_id"
        case invitedUserIDs = "invited_user_ids"
        case filters
    }
}

private struct DecisionJoinBody: Encodable {
    let code: String?
}

private struct DecisionVoteBody: Encodable {
    let candidateID: String?
    let venueID: String?
    let vote: DecisionVoteValue

    enum CodingKeys: String, CodingKey {
        case candidateID = "candidate_id"
        case venueID = "venue_id"
        case vote
    }
}

private struct DecisionShortlistVoteBody: Encodable {
    let candidateID: String

    enum CodingKeys: String, CodingKey {
        case candidateID = "candidate_id"
    }
}

private struct DecisionCandidateBody: Encodable {
    let venueID: String

    enum CodingKeys: String, CodingKey {
        case venueID = "venue_id"
    }
}

private struct DecisionFinalizeBody: Encodable {
    let candidateID: String
    let finalMeetupAt: String?
    let finalNote: String?

    enum CodingKeys: String, CodingKey {
        case candidateID = "candidate_id"
        case finalMeetupAt = "final_meetup_at"
        case finalNote = "final_note"
    }
}

private struct DecisionMessageBody: Encodable {
    let type: DecisionMessageType
    let text: String?
    let emoji: DecisionEmoji?
}

private struct DeviceTokenBody: Encodable {
    let token: String
    let apnsEnvironment: String?
    let appVersion: String?
    let buildNumber: String?

    enum CodingKeys: String, CodingKey {
        case token
        case apnsEnvironment = "apns_environment"
        case appVersion = "app_version"
        case buildNumber = "build_number"
    }
}

private struct DeviceTokenDeleteBody: Encodable {
    let token: String
}

private struct NotificationPreferencesPatchBody: Encodable {
    let roomInvitesEnabled: Bool
    let shortlistReadyEnabled: Bool
    let finalPlanLockedEnabled: Bool
    let roomMessagesEnabled: Bool

    init(preferences: NotificationPreferences) {
        roomInvitesEnabled = preferences.roomInvitesEnabled
        shortlistReadyEnabled = preferences.shortlistReadyEnabled
        finalPlanLockedEnabled = preferences.finalPlanLockedEnabled
        roomMessagesEnabled = preferences.roomMessagesEnabled
    }
}

#if DEBUG
private struct DevConfirmedAuthUserBody: Encodable {
    let email: String
    let password: String
}

private struct DevSocialCrewResetBody: Encodable {
    let market: String
}

private struct DevRoomNotificationBody: Encodable {
    let sessionID: String
    let category: RoomNotificationCategory
    let actorDisplayName: String?

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case category
        case actorDisplayName = "actor_display_name"
    }
}
#endif
