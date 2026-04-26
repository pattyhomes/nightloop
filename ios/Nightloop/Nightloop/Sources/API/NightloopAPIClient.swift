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

    func replacePreferences(_ preferences: [String: [String]], bearerToken: String) async throws -> PreferencesResponse {
        try await send(path: "me/preferences", method: "PUT", bearerToken: bearerToken, body: preferences)
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

    func venue(id: String, bearerToken: String) async throws -> VenueDetailResponse {
        try await send(path: "venues/\(id)", bearerToken: bearerToken)
    }

    func submitSignal(venueID: String, kind: SignalKind, bearerToken: String) async throws -> SignalResponse {
        let body = SignalBody(venueID: venueID, kind: kind)
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

    enum CodingKeys: String, CodingKey {
        case venueID = "venue_id"
        case kind
    }
}

#if DEBUG
private struct DevConfirmedAuthUserBody: Encodable {
    let email: String
    let password: String
}
#endif
