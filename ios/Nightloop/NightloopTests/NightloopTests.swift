import XCTest
@testable import Nightloop

final class NightloopTests: XCTestCase {
    func testConfigValidationAcceptsClientSafeValues() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test"
        ])

        XCTAssertEqual(config.apiBaseURL.absoluteString, "http://127.0.0.1:4000/api/v1")
        XCTAssertTrue(config.isSupabaseConfigured)
        XCTAssertFalse(config.isMapboxConfigured)
    }

    func testConfigTreatsMissingSupabaseKeyAsUnconfigured() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": ""
        ])

        XCTAssertFalse(config.isSupabaseConfigured)
    }

    func testConfigLoadsOptionalDebugPhoneHelperValues() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test",
            "NightloopAppleAuthEnabled": "YES",
            "NightloopPhoneAuthEnabled": "true",
            "NightloopMapboxAccessToken": " pk.test-token ",
            "NightloopMapboxStyleURI": " mapbox://styles/nightloop/midnight-orchid ",
            "NightloopDebugPhoneTestNumber": " (415) 555-0134 ",
            "NightloopDebugPhoneTestCode": " 123456 "
        ])

        XCTAssertTrue(config.appleAuthEnabled)
        XCTAssertTrue(config.phoneAuthEnabled)
        XCTAssertTrue(config.isMapboxConfigured)
        XCTAssertEqual(config.mapboxAccessToken, "pk.test-token")
        XCTAssertEqual(config.mapboxStyleURI, "mapbox://styles/nightloop/midnight-orchid")
        XCTAssertEqual(config.debugPhoneTestNumber, "(415) 555-0134")
        XCTAssertEqual(config.debugPhoneTestCode, "123456")
    }

    func testConfigDefaultsLiveAuthProvidersOff() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test"
        ])

        XCTAssertFalse(config.appleAuthEnabled)
        XCTAssertFalse(config.phoneAuthEnabled)
    }

    func testConfigIgnoresUnresolvedMapboxBuildSettings() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test",
            "NightloopMapboxAccessToken": "$(MAPBOX_ACCESS_TOKEN)",
            "NightloopMapboxStyleURI": "paste_style_here"
        ])

        XCTAssertNil(config.mapboxAccessToken)
        XCTAssertNil(config.mapboxStyleURI)
        XCTAssertFalse(config.isMapboxConfigured)
    }

    func testConfigNormalizesEscapedMapboxStyleURI() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test",
            "NightloopMapboxAccessToken": "pk.test-token",
            "NightloopMapboxStyleURI": "mapbox:/$()/styles/chuck18/cmofbpqpc004501qp2igmbha1"
        ])

        XCTAssertEqual(config.mapboxStyleURI, "mapbox://styles/chuck18/cmofbpqpc004501qp2igmbha1")
    }

    func testConfigIgnoresUnresolvedDebugPhoneBuildSettings() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test",
            "NightloopDebugPhoneTestNumber": "$(DEBUG_PHONE_TEST_NUMBER)",
            "NightloopDebugPhoneTestCode": "paste_code_here"
        ])

        XCTAssertNil(config.debugPhoneTestNumber)
        XCTAssertNil(config.debugPhoneTestCode)
    }

    func testRequestBuildsURLAndBearerHeader() throws {
        let client = NightloopAPIClient(baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!)
        let request = try client.makeRequest(
            path: "/venues",
            queryItems: [URLQueryItem(name: "market_id", value: "sf")],
            bearerToken: "test-token"
        )

        XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/venues?market_id=sf")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
    }

    func testVenueRequestIncludesLocationOnlyWhenProvided() async throws {
        var requestIndex = 0
        URLProtocolMock.requestHandler = { request in
            let queryItems = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
            if requestIndex == 0 {
                XCTAssertNil(queryItems.first { $0.name == "lat" })
                XCTAssertNil(queryItems.first { $0.name == "lng" })
            } else {
                XCTAssertEqual(queryItems.first { $0.name == "lat" }?.value, "37.77")
                XCTAssertEqual(queryItems.first { $0.name == "lng" }?.value, "-122.41")
            }
            requestIndex += 1

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Self.venueListFixtureData())
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.venues(marketID: "sf", bearerToken: "test-token")
        _ = try await client.venues(
            marketID: "sf",
            bearerToken: "test-token",
            userCoordinate: Coordinate(latitude: 37.77, longitude: -122.41)
        )
        XCTAssertEqual(requestIndex, 2)
    }

    func testBackendErrorEnvelopeDecodes() throws {
        let data = Data("""
        {
          "error": {
            "code": "ELIGIBILITY_REQUIRED",
            "message": "You must complete 21+ eligibility attestation before using this feature.",
            "details": { "step": "age_attestation" }
          }
        }
        """.utf8)

        let envelope = try JSONDecoder().decode(APIErrorEnvelope.self, from: data)
        XCTAssertEqual(envelope.error.code, "ELIGIBILITY_REQUIRED")
        XCTAssertEqual(envelope.error.message, "You must complete 21+ eligibility attestation before using this feature.")
    }

    func testVenueListFixtureDecodesEnergyAsNumberAndLabel() throws {
        let data = Self.venueListFixtureData()

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let response = try decoder.decode(VenueListResponse.self, from: data)
        XCTAssertEqual(response.items.first?.pulse.score, 82)
        XCTAssertEqual(response.items.first?.pulse.label, "Packed")
    }

    func testMarketConfigFixtureDecodesNeighborhoodLabels() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/markets/market-1/config")
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "market": {
                "id": "market-1",
                "slug": "sf",
                "display_name": "San Francisco",
                "short_label": "SF",
                "timezone": "America/Los_Angeles",
                "country_code": "US",
                "launch_status": "active",
                "center": { "latitude": 37.7749, "longitude": -122.4194 },
                "default_zoom": 12.2,
                "bounds": {},
                "mapbox_style_uri": "mapbox://styles/nightloop/midnight-orchid"
              },
              "neighborhoods": [
                {
                  "id": "hood-1",
                  "slug": "soma",
                  "display_name": "SoMa",
                  "label_coordinate": { "latitude": 37.778, "longitude": -122.405 },
                  "polygon": {}
                }
              ],
              "provider_config": {}
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        let response = try await client.marketConfig(id: "market-1")

        XCTAssertEqual(response.market.mapboxStyleUri, "mapbox://styles/nightloop/midnight-orchid")
        XCTAssertEqual(response.neighborhoods.first?.displayName, "SoMa")
        XCTAssertEqual(response.neighborhoods.first?.labelCoordinate?.latitude, 37.778)
    }

    func testMapMarkersSkipZeroCoordinatesAndPreservePulse() {
        let markers = VenueMapMarker.markers(from: [
            Self.venueFixture(id: "venue-1", name: "Halcyon", latitude: 37.775, longitude: -122.41, score: 82, level: 3),
            Self.venueFixture(id: "venue-2", name: "Missing", latitude: 0, longitude: 0, score: 28, level: 1)
        ])

        XCTAssertEqual(markers.map(\.id), ["venue-1"])
        XCTAssertEqual(markers.first?.coordinate.latitude, 37.775)
        XCTAssertEqual(markers.first?.pulseLevel, 3)
        XCTAssertEqual(markers.first?.score, 82)
    }

    func testMapFilterSelectedVenueFallsBackToFirstVisibleVenue() {
        let venues = [
            Self.venueFixture(id: "venue-1", name: "A", latitude: 37.1, longitude: -122.1, score: 30, level: 1),
            Self.venueFixture(id: "venue-2", name: "B", latitude: 37.2, longitude: -122.2, score: 80, level: 3)
        ]

        XCTAssertEqual(MapVenueFilter.selectedVenueID(current: "venue-2", venues: venues), "venue-2")
        XCTAssertEqual(MapVenueFilter.selectedVenueID(current: "missing", venues: venues), "venue-1")
        XCTAssertEqual(MapVenueFilter.rankedVenues(from: venues).map(\.id), ["venue-2", "venue-1"])
    }

    func testMapSheetDetentsSnapToNearestHeight() {
        let availableHeight: CGFloat = 760

        XCTAssertEqual(MapSheetDetent.snap(to: 205, availableHeight: availableHeight), .peek)
        XCTAssertEqual(MapSheetDetent.snap(to: 390, availableHeight: availableHeight), .half)
        XCTAssertEqual(MapSheetDetent.snap(to: 690, availableHeight: availableHeight), .full)
        XCTAssertLessThan(MapSheetDetent.peek.height(for: availableHeight), MapSheetDetent.half.height(for: availableHeight))
        XCTAssertLessThan(MapSheetDetent.half.height(for: availableHeight), MapSheetDetent.full.height(for: availableHeight))
    }

    func testMapOverlayLayoutFollowsSheetHeight() {
        let layout = MapOverlayLayout(sheetHeight: 392)

        XCTAssertEqual(layout.promptBottomPadding, 406)
        XCTAssertEqual(layout.toastBottomPadding, 410)
        XCTAssertEqual(layout.fabBottomPadding, 358)
        XCTAssertEqual(layout.signalMenuBottomPadding, 426)
    }

    func testMapZoomControlClampsZoom() {
        XCTAssertEqual(MapZoomControl.nextZoom(current: 12, delta: 0.8), 12.8)
        XCTAssertEqual(MapZoomControl.nextZoom(current: 16.3, delta: 0.8), MapZoomControl.maximumZoom)
        XCTAssertEqual(MapZoomControl.nextZoom(current: 9.7, delta: -0.8), MapZoomControl.minimumZoom)
    }

    func testMapStyleResolverTrustsConfiguredStudioStyle() {
        XCTAssertEqual(
            MapStyleResolver.preferredURI(
                configured: "mapbox://styles/chuck18/cmofbpqpc004501qp2igmbha1",
                market: "mapbox://styles/other/style"
            ),
            "mapbox://styles/chuck18/cmofbpqpc004501qp2igmbha1"
        )
        XCTAssertFalse(MapStyleResolver.shouldFallbackToDark(
            configured: "mapbox://styles/chuck18/cmofbpqpc004501qp2igmbha1",
            market: nil
        ))
        XCTAssertTrue(MapStyleResolver.shouldFallbackToDark(configured: "paste_style_here", market: nil))
    }

    func testSignalKindRawValuesMatchBackend() {
        XCTAssertEqual(SignalKind.packed.rawValue, "packed")
        XCTAssertEqual(SignalKind.shortLine.rawValue, "short_line")
        XCTAssertEqual(SignalKind.longLine.rawValue, "long_line")
        XCTAssertEqual(SignalKind.dead.rawValue, "dead")
        XCTAssertEqual(SignalKind.eventLive.rawValue, "event_live")
    }

    func testUSPhoneNumberNormalization() {
        XCTAssertEqual(USPhoneNumber.normalize("(415) 555-0134"), "+14155550134")
        XCTAssertEqual(USPhoneNumber.normalize("1 415 555 0134"), "+14155550134")
        XCTAssertNil(USPhoneNumber.normalize("555-0134"))
        XCTAssertNil(USPhoneNumber.normalize("011 44 20 7946 0958"))
    }

    func testOnboardingMapsHoodToBackendNeighborhoods() {
        let selections = [
            "vibe": ["dance", "wild", "queer"],
            "music": ["house", "techno", "dj"],
            "crowd": ["locals", "queer", "twenties"],
            "hood": ["soma", "mission", "castro"]
        ]

        let payload = OnboardingPreferences.backendPayload(from: selections)

        XCTAssertEqual(payload["vibe"], ["dance", "wild", "queer"])
        XCTAssertEqual(payload["music"], ["house", "techno", "dj"])
        XCTAssertEqual(payload["crowd"], ["locals", "queer", "twenties"])
        XCTAssertEqual(payload["neighborhoods"], ["soma", "mission", "castro"])
        XCTAssertNil(payload["hood"])
    }

    func testAppleNonceHashIsDeterministic() {
        XCTAssertEqual(
            AppleNonce.sha256("nightloop"),
            "fda40c27c2762f9edc10d8ff8ec0510ddc3b1c7e071f343a8afe1c0b00ee276e"
        )
    }

    func testDeleteAccountRequestUsesProtectedEndpoint() throws {
        let client = NightloopAPIClient(baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!)
        let request = try client.makeRequest(
            path: "me/account",
            method: "DELETE",
            bearerToken: "test-token"
        )

        XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/me/account")
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    }

    func testRecentSignalsRequestUsesProtectedEndpointAndDecodes() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/me/signals?limit=5")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "items": [
                {
                  "id": "signal-1",
                  "venue_id": "venue-1",
                  "venue_name": "Halcyon",
                  "venue_neighborhood": "SoMa",
                  "kind": "packed",
                  "points_awarded": 3,
                  "observed_at": "2026-04-25T00:00:00.000Z"
                }
              ]
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        let response = try await client.recentSignals(bearerToken: "test-token")

        XCTAssertEqual(response.items.first?.venueName, "Halcyon")
        XCTAssertEqual(response.items.first?.kind, .packed)
        XCTAssertEqual(response.items.first?.pointsAwarded, 3)
    }

    func testProfileUpdateCanEncodeNullBioForClearing() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/me/profile")
            XCTAssertEqual(request.httpMethod, "PATCH")

            let body = try XCTUnwrap(Self.bodyData(from: request))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertTrue(object.keys.contains("bio"))
            XCTAssertTrue(object["bio"] is NSNull)

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Self.meFixtureData())
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.updateProfile(
            displayName: "Alex",
            username: "alexsf",
            selectedMarketId: nil,
            bio: nil,
            includeBio: true,
            bearerToken: "test-token"
        )
    }

    #if DEBUG
    func testDevConfirmedAuthUserRequestUsesLocalDevEndpoint() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/dev/confirmed-auth-user")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))

            let body = try XCTUnwrap(Self.bodyData(from: request))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(object["email"] as? String, "dev+fresh@example.com")
            XCTAssertEqual(object["password"] as? String, "password123")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "user": { "id": "auth-user-1" },
              "message": "Confirmed local development auth user is ready."
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        let response = try await client.createConfirmedDevAuthUser(
            email: "dev+fresh@example.com",
            password: "password123"
        )

        XCTAssertEqual(response.message, "Confirmed local development auth user is ready.")
    }
    #endif

    func testPreferenceTunerBoostsPreferredNeighborhoods() {
        let venue = VenueItem(
            id: "venue-1",
            slug: "halcyon",
            name: "Halcyon",
            marketId: "market-1",
            neighborhood: "SoMa",
            category: "club",
            coordinate: Coordinate(latitude: 37.775, longitude: -122.41),
            distanceMiles: nil,
            pulse: VenuePulse(level: 2, label: "Active", score: 55),
            trend: "steady",
            waitMinutes: nil,
            signalCount: 0,
            recentSignalCount: 0,
            confidence: "high",
            event: nil,
            friendSummary: FriendSummary(friendsHereCount: 0, firstFriendName: nil),
            image: nil,
            assets: [],
            whyShort: "Active energy in SoMa.",
            lastSignalAt: nil,
            computedAt: nil,
            sourceSummary: nil
        )

        let reason = VenuePreferenceTuner.reason(
            for: venue,
            preferences: ["neighborhoods": ["soma"], "vibe": ["dance"], "music": []]
        )

        XCTAssertEqual(reason, "Tuned to your SoMa picks.")
    }

    private static func meFixtureData() -> Data {
        Data("""
        {
          "user": {
            "id": "user-1",
            "auth_user_id": "auth-1",
            "eligibility_status": "eligible",
            "age_attested_at": "2026-04-24T00:00:00.000Z",
            "signal_scout_points": 0,
            "created_at": "2026-04-24T00:00:00.000Z"
          },
          "profile": {
            "display_name": "Alex",
            "username": "alexsf",
            "avatar_kind": "initials",
            "bio": null,
            "selected_market_id": null
          },
          "settings": {
            "ghost_mode": false,
            "map_show_neighborhood_labels": true,
            "map_show_street_grid": true,
            "push_social_enabled": true,
            "push_decision_enabled": true,
            "push_favorite_venue_alerts_enabled": false
          },
          "onboarding": {
            "status": "complete",
            "missing_steps": []
          }
        }
        """.utf8)
    }

    private static func venueListFixtureData() -> Data {
        Data("""
        {
          "generated_at": "2026-04-24T00:00:00.000Z",
          "market": { "id": "market-1", "short_label": "SF" },
          "counts": { "all": 1, "packed": 1, "active": 0, "chill": 0, "friends": 0 },
          "next_cursor": null,
          "items": [
            {
              "id": "venue-1",
              "slug": "halcyon",
              "name": "Halcyon",
              "market_id": "market-1",
              "neighborhood": "SoMa",
              "category": "club",
              "coordinate": { "latitude": 37.7751, "longitude": -122.4105 },
              "distance_miles": null,
              "pulse": { "level": 3, "label": "Packed", "score": 82 },
              "trend": "rising",
              "wait_minutes": 15,
              "signal_count": 12,
              "recent_signal_count": 4,
              "confidence": "high",
              "event": null,
              "friend_summary": { "friends_here_count": 0, "first_friend_name": null },
              "image": null,
              "assets": [],
              "why_short": "Packed energy in SoMa.",
              "last_signal_at": null,
              "computed_at": null,
              "source_summary": {}
            }
          ]
        }
        """.utf8)
    }

    private static func venueFixture(
        id: String,
        name: String,
        latitude: Double,
        longitude: Double,
        score: Int,
        level: Int
    ) -> VenueItem {
        VenueItem(
            id: id,
            slug: name.lowercased(),
            name: name,
            marketId: "market-1",
            neighborhood: "SoMa",
            category: "club",
            coordinate: Coordinate(latitude: latitude, longitude: longitude),
            distanceMiles: nil,
            pulse: VenuePulse(level: level, label: level >= 3 ? "Packed" : "Chill", score: score),
            trend: "steady",
            waitMinutes: nil,
            signalCount: 0,
            recentSignalCount: 0,
            confidence: "high",
            event: nil,
            friendSummary: FriendSummary(friendsHereCount: 0, firstFriendName: nil),
            image: nil,
            assets: [],
            whyShort: "Nightloop fixture.",
            lastSignalAt: nil,
            computedAt: nil,
            sourceSummary: nil
        )
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let httpBody = request.httpBody {
            return httpBody
        }

        guard let stream = request.httpBodyStream else {
            return nil
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 {
                return nil
            }
            if count == 0 {
                break
            }
            data.append(buffer, count: count)
        }
        return data
    }
}

final class URLProtocolMock: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private extension URLSession {
    static var mocked: URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [URLProtocolMock.self]
        return URLSession(configuration: configuration)
    }
}
