import CoreLocation
import GoogleMaps
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
        XCTAssertFalse(config.isGoogleMapsConfigured)
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
            "NightloopGoogleMapsIOSAPIKey": " AIza-test-key ",
            "NightloopGoogleMapID": " map-id-123 ",
            "NightloopDebugPhoneTestNumber": " (415) 555-0134 ",
            "NightloopDebugPhoneTestCode": " 123456 "
        ])

        XCTAssertTrue(config.appleAuthEnabled)
        XCTAssertTrue(config.phoneAuthEnabled)
        XCTAssertTrue(config.isGoogleMapsConfigured)
        XCTAssertEqual(config.googleMapsIOSAPIKey, "AIza-test-key")
        XCTAssertEqual(config.googleMapID, "map-id-123")
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

    func testConfigIgnoresUnresolvedGoogleMapsBuildSettings() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": "sb_publishable_test",
            "NightloopGoogleMapsIOSAPIKey": "$(GOOGLE_MAPS_IOS_API_KEY)",
            "NightloopGoogleMapID": "paste_map_id_here"
        ])

        XCTAssertNil(config.googleMapsIOSAPIKey)
        XCTAssertNil(config.googleMapID)
        XCTAssertFalse(config.isGoogleMapsConfigured)
    }

    func testGoogleMapConfigStateRequiresAPIKeyOnly() {
        XCTAssertTrue(GoogleMapConfigState.isConfigured(apiKey: "AIza-test"))
        XCTAssertFalse(GoogleMapConfigState.isConfigured(apiKey: nil))
        XCTAssertFalse(GoogleMapConfigState.isConfigured(apiKey: " "))
    }

    func testGoogleMapPaddingAccountsForSheetHeight() {
        let padding = GoogleMapPadding.edgeInsets(bottomSheetHeight: 392)

        XCTAssertEqual(padding.top, 94)
        XCTAssertEqual(padding.left, 10)
        XCTAssertEqual(padding.bottom, 410)
        XCTAssertEqual(padding.right, 12)
    }

    func testGoogleMapCameraEquatableUsesSmallTolerance() {
        let left = GoogleMapCamera.sanFrancisco
        let right = GoogleMapCamera(
            center: CLLocationCoordinate2D(latitude: 37.7749001, longitude: -122.4194001),
            zoom: 12.2004
        )

        XCTAssertEqual(left, right)
        XCTAssertEqual(GoogleMapCamera.sanFrancisco.zoom, 12.2)
    }

    func testNightloopGoogleMapStyleJSONIsValidAndParsableByGoogleMaps() throws {
        let jsonString = try NightloopGoogleMapStyle.jsonString()
        let data = Data(jsonString.utf8)
        let object = try JSONSerialization.jsonObject(with: data)
        let styleRules = try XCTUnwrap(object as? [[String: Any]])

        XCTAssertGreaterThan(styleRules.count, 10)
        XCTAssertTrue(styleRules.contains { ($0["featureType"] as? String) == "poi" })
        XCTAssertTrue(styleRules.contains { ($0["featureType"] as? String) == "transit" })
        XCTAssertNoThrow(try GMSMapStyle(jsonString: jsonString))
    }

    func testGoogleMapStyleSourcePrefersBundledNightloopJSONOverCloudMapID() {
        XCTAssertFalse(
            GoogleMapStyleSource.shouldUseCloudMapID(
                localStyleIsBundled: true,
                configuredMapID: "google-cloud-map-id"
            )
        )
        XCTAssertTrue(
            GoogleMapStyleSource.shouldUseCloudMapID(
                localStyleIsBundled: false,
                configuredMapID: "google-cloud-map-id"
            )
        )
        XCTAssertFalse(
            GoogleMapStyleSource.shouldUseCloudMapID(
                localStyleIsBundled: false,
                configuredMapID: nil
            )
        )
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

    func testRecommendationsRequestUsesProtectedEndpointAndDecodesTonightPreview() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/recommendations?market_id=sf&limit=30&pulse=packed")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "generated_at": "2026-04-27T00:00:00.000Z",
              "mode": "tonight_preview",
              "market": { "id": "market-1", "short_label": "SF" },
              "counts": { "all": 1, "packed": 1, "active": 0, "chill": 0, "friends": 0 },
              "next_cursor": null,
              "items": [
                {
                  "rank": 1,
                  "score": 84.5,
                  "mode": "tonight_preview",
                  "reason": "Expected tonight with a source-backed event, based on venue type and current timing.",
                  "expected_pulse_basis": ["time_curve:saturday_late", "archetype:club", "event:tonight"],
                  "factors": {
                    "venue_quality": 85,
                    "preference_match": 40,
                    "live_signals": 8,
                    "event_relevance": 0,
                    "source_confidence": 75,
                    "hours_confidence": 35
                  },
                  "venue": \(String(data: Self.venueFixtureJSON(), encoding: .utf8)!)
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

        let response = try await client.recommendations(
            marketID: "sf",
            bearerToken: "test-token",
            pulse: "packed"
        )

        XCTAssertEqual(response.mode, "tonight_preview")
        XCTAssertEqual(response.items.first?.venue.name, "Halcyon")
        XCTAssertEqual(response.items.first?.venue.hours?.claimsOpenNow, false)
        XCTAssertEqual(response.items.first?.venue.liveness?.state, .opensLater)
        XCTAssertEqual(response.items.first?.venue.liveness?.badgeTitle, "Opens 10:00 PM")
        XCTAssertEqual(response.items.first?.reason, "Expected tonight with a source-backed event, based on venue type and current timing.")
        XCTAssertEqual(response.items.first?.expectedPulseBasis, ["time_curve:saturday_late", "archetype:club", "event:tonight"])
    }

    func testSignalRequestIncludesVerificationLocation() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/signals")
            XCTAssertEqual(request.httpMethod, "POST")

            let body = try XCTUnwrap(Self.bodyData(from: request))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(object["venue_id"] as? String, "venue-1")
            XCTAssertEqual(object["kind"] as? String, "packed")
            let location = try XCTUnwrap(object["location"] as? [String: Any])
            XCTAssertEqual(location["latitude"] as? Double, 37.7751)
            XCTAssertEqual(location["longitude"] as? Double, -122.4105)

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 201,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "signal_id": "signal-1",
              "venue_id": "venue-1",
              "points_awarded": 3,
              "new_signal_scout_points": 12
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.submitSignal(
            venueID: "venue-1",
            kind: .packed,
            bearerToken: "test-token",
            userCoordinate: Coordinate(latitude: 37.7751, longitude: -122.4105)
        )
    }

    func testDetailedSignalRequestIncludesStructuredDetailsOnly() async throws {
        URLProtocolMock.requestHandler = { request in
            let body = try XCTUnwrap(Self.bodyData(from: request))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let details = try XCTUnwrap(object["details"] as? [String: Any])
            XCTAssertEqual(details["wait_minutes"] as? Int, 25)
            XCTAssertEqual(details["cover_amount_dollars"] as? Int, 20)
            XCTAssertEqual(details["crowd_level"] as? String, "packed")
            XCTAssertEqual(details["vibe_tags"] as? [String], ["dance", "queer"])
            XCTAssertEqual(details["music_tags"] as? [String], ["house"])
            XCTAssertEqual(details["event_live"] as? Bool, true)
            XCTAssertNil(details["free_text"])
            XCTAssertNil(details["latitude"])
            XCTAssertNil(details["longitude"])

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 201,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "signal_id": "signal-1",
              "venue_id": "venue-1",
              "points_awarded": 2,
              "new_signal_scout_points": 12
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.submitSignal(
            venueID: "venue-1",
            kind: .longLine,
            bearerToken: "test-token",
            userCoordinate: Coordinate(latitude: 37.7751, longitude: -122.4105),
            details: SignalDetails(
                waitMinutes: 25,
                coverAmountDollars: 20,
                crowdLevel: "packed",
                vibeTags: ["dance", "queer"],
                musicTags: ["house"],
                eventLive: true
            )
        )
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
        XCTAssertEqual(response.items.first?.pulse.label, "Expected packed")
        XCTAssertEqual(response.items.first?.pulse.source, "expected")
        XCTAssertEqual(response.items.first?.pulse.isExpected, true)
        XCTAssertEqual(response.items.first?.pulse.copy, "Expected tonight with a source-backed event, based on venue type and current timing.")
        XCTAssertEqual(response.items.first?.liveness?.state, .opensLater)
        XCTAssertEqual(response.items.first?.liveness?.hoursState, .sourceVerified)
        XCTAssertEqual(response.items.first?.liveness?.confidence, .medium)
        XCTAssertEqual(response.items.first?.hours?.hoursState, .sourceVerified)
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

    func testMapRankingDemotesClosedTodayVenuesBelowEligibleTonightVenues() {
        let closed = Self.venueFixture(
            id: "venue-closed",
            name: "Closed Club",
            latitude: 37.1,
            longitude: -122.1,
            score: 95,
            level: 3,
            livenessState: .closedToday
        )
        let opensLater = Self.venueFixture(
            id: "venue-open",
            name: "Opens Later",
            latitude: 37.2,
            longitude: -122.2,
            score: 55,
            level: 2,
            livenessState: .opensLater
        )

        XCTAssertEqual(MapVenueFilter.rankedVenues(from: [closed, opensLater]).map(\.id), ["venue-open", "venue-closed"])
    }

    func testMapMarkerVisualsUseStateAwareNeon() {
        let live = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .live, hoursState: .sourceVerified, confidence: .high),
            score: 82,
            isSelected: false
        )
        let opensLater = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .opensLater, hoursState: .sourceVerified, confidence: .medium),
            score: 55,
            isSelected: false
        )
        let unknown = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .unknown, hoursState: .unknown, confidence: .low),
            score: 55,
            isSelected: false
        )
        let closed = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .closedToday, hoursState: .sourceVerified, confidence: .high),
            score: 95,
            isSelected: false
        )

        XCTAssertEqual(live.shape, .filledBloom)
        XCTAssertGreaterThan(live.glowRadius, 12)
        XCTAssertEqual(opensLater.shape, .hollowRing)
        XCTAssertGreaterThan(opensLater.haloOpacity, 0)
        XCTAssertGreaterThan(opensLater.glowRadius, 8)
        XCTAssertEqual(unknown.shape, .dashedRing)
        XCTAssertEqual(closed.shape, .outline)
        XCTAssertEqual(closed.glowRadius, 0)
    }

    func testHomeAllFilterLabelOmitsCount() {
        XCTAssertEqual(HomePulseFilterLabel.text(title: "All", count: 136), "All")
        XCTAssertEqual(HomePulseFilterLabel.text(title: "Packed", count: 2), "Packed · 2")
    }

    func testMapAllFilterLabelOmitsCount() {
        XCTAssertEqual(MapPulseFilterLabel.text(title: "All", count: 136), "All")
        XCTAssertEqual(MapPulseFilterLabel.text(title: "Active", count: 2), "Active 2")
    }

    func testSignalVerificationTrayWaitsForCoordinateWhenAlreadyAuthorized() {
        XCTAssertFalse(SignalVerificationTrayVisibility.shouldShow(
            status: .needsLocation,
            isAuthorized: true,
            isDenied: false
        ))
        XCTAssertTrue(SignalVerificationTrayVisibility.shouldShow(
            status: .needsLocation,
            isAuthorized: false,
            isDenied: false
        ))
        XCTAssertTrue(SignalVerificationTrayVisibility.shouldShow(
            status: .tooFar,
            isAuthorized: true,
            isDenied: false
        ))
        XCTAssertTrue(SignalVerificationTrayVisibility.shouldShow(
            status: .verified,
            isAuthorized: true,
            isDenied: false
        ))
    }

    func testVenueDetailSignalCardIsInlineNotFloatingOverlay() {
        XCTAssertFalse(VenueDetailSignalPlacement.usesFloatingOverlay)
        XCTAssertLessThan(VenueDetailSignalPlacement.scrollBottomPadding, 150)
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
        XCTAssertEqual(MapChromeLayout.headerTopPadding(safeAreaTop: 59), 8)
        XCTAssertEqual(MapChromeLayout.zoomTopPadding(safeAreaTop: 59), 112)
    }

    func testMapZoomControlClampsZoom() {
        XCTAssertEqual(MapZoomControl.nextZoom(current: 12, delta: 0.8), 12.8)
        XCTAssertEqual(MapZoomControl.nextZoom(current: 16.3, delta: 0.8), MapZoomControl.maximumZoom)
        XCTAssertEqual(MapZoomControl.nextZoom(current: 9.7, delta: -0.8), MapZoomControl.minimumZoom)
    }

    func testSignalProximityStatusUsesTwoHundredMeterRadius() {
        let venue = Coordinate(latitude: 37.7751, longitude: -122.4105)
        XCTAssertEqual(
            SignalProximity.status(userCoordinate: nil, venueCoordinate: venue),
            .needsLocation
        )
        XCTAssertEqual(
            SignalProximity.status(
                userCoordinate: Coordinate(latitude: 37.7752, longitude: -122.4105),
                venueCoordinate: venue
            ),
            .verified
        )
        XCTAssertEqual(
            SignalProximity.status(
                userCoordinate: Coordinate(latitude: 37.7951, longitude: -122.4105),
                venueCoordinate: venue
            ),
            .tooFar
        )
    }

    func testMapSettingsHideNeighborhoodLabelsControl() {
        XCTAssertFalse(MapSettingsOption.visible.contains(.neighborhoodLabels))
        XCTAssertEqual(MapSettingsOption.visible, [.streetGrid])
    }

    func testMarkerVisualsDeclutterNonSelectedLowEnergyMarkers() {
        let chill = MapMarkerVisuals.style(score: 28, isSelected: false)
        let packed = MapMarkerVisuals.style(score: 92, isSelected: false)
        let selected = MapMarkerVisuals.style(score: 28, isSelected: true)

        XCTAssertLessThan(chill.haloSize, packed.haloSize)
        XCTAssertLessThan(chill.haloOpacity, packed.haloOpacity)
        XCTAssertGreaterThan(selected.haloSize, packed.haloSize)
        XCTAssertGreaterThan(selected.glowRadius, packed.glowRadius)
    }

    func testMarkerVisualsFollowLivenessContract() {
        let live = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .live, hoursState: .sourceVerified, confidence: .high),
            score: 90,
            isSelected: false
        )
        let opensLater = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .opensLater, hoursState: .sourceVerified, confidence: .medium),
            score: 90,
            isSelected: false
        )
        let unknown = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .unknown, hoursState: .unknown, confidence: .low),
            score: 90,
            isSelected: false
        )
        let closed = MapMarkerVisuals.style(
            liveness: Self.livenessFixture(state: .closedToday, hoursState: .sourceVerified, confidence: .high),
            score: 90,
            isSelected: false
        )

        XCTAssertEqual(live.shape, .filledBloom)
        XCTAssertEqual(opensLater.shape, .hollowRing)
        XCTAssertEqual(unknown.shape, .dashedRing)
        XCTAssertEqual(closed.shape, .outline)
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

    func testSocialPayloadsDecodeFriendsAndActivity() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let friends = try decoder.decode(FriendsResponse.self, from: Self.friendsFixtureData())
        XCTAssertEqual(friends.friends.first?.user.displayName, "Maya")
        XCTAssertEqual(friends.friends.first?.friendship.status, "accepted")
        XCTAssertEqual(friends.incomingRequests.first?.friendship.direction, "incoming")

        let activity = try decoder.decode(FriendActivityResponse.self, from: Self.friendActivityFixtureData())
        XCTAssertEqual(activity.items.first?.type, .signal)
        XCTAssertEqual(activity.items.first?.signalKind, .packed)
        XCTAssertEqual(activity.items.first?.actor.displayName, "Maya")
        XCTAssertEqual(activity.items.first?.venue?.name, "Halcyon")
        XCTAssertEqual(activity.items.first?.replies.first?.type, .comment)
        XCTAssertEqual(activity.items.first?.replies.first?.text, "got a booth")

        let tonight = try decoder.decode(FriendsTonightResponse.self, from: Self.friendsTonightFixtureData())
        XCTAssertEqual(tonight.groups.first?.venue.name, "Halcyon")
        XCTAssertEqual(tonight.groups.first?.friends.first?.displayName, "Maya")
        XCTAssertEqual(tonight.groups.first?.cta.primary, "I'm Coming")
        XCTAssertEqual(tonight.groups.first?.latestActivity.replies.first?.text, "got a booth")
        XCTAssertEqual(tonight.emptyState?.title, "Quiet so far")
    }

    func testDecisionPayloadsDecodeSessionAndCandidates() throws {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let response = try decoder.decode(DecisionSessionResponse.self, from: Self.decisionSessionFixtureData())

        XCTAssertEqual(response.session.status, "active")
        XCTAssertEqual(response.session.stage, .swiping)
        XCTAssertEqual(response.session.roomTitle, "Alex + 1 tonight")
        XCTAssertEqual(response.session.code, "ND-ABCD-2345")
        XCTAssertEqual(response.session.memberCounts.joined, 2)
        XCTAssertEqual(response.session.capabilities?.canVote, true)
        XCTAssertEqual(response.session.capabilities?.canForceShortlist, true)
        XCTAssertEqual(response.session.progress?.confidence, 50)
        XCTAssertEqual(response.session.progress?.members.first?.swipedCount, 2)
        XCTAssertEqual(response.session.finalPlan?.note, "Meet by the entrance.")
        XCTAssertEqual(response.candidates.first?.venue.name, "Halcyon")
        XCTAssertEqual(response.deckCandidates?.first?.id, "candidate-1")
        XCTAssertEqual(response.shortlist?.first?.id, "candidate-1")
        XCTAssertEqual(response.recommendedFinalCandidate?.id, "candidate-1")
        XCTAssertEqual(response.candidates.first?.source, "suggested")
        XCTAssertEqual(response.candidates.first?.suggestedBy?.displayName, "Maya")
        XCTAssertEqual(response.candidates.first?.canRemove, true)
        XCTAssertEqual(response.candidates.first?.viewerVote, .voteIn)
        XCTAssertEqual(response.candidates.first?.shortlistVoteCount, 1)
        XCTAssertEqual(response.candidates.first?.viewerShortlistVote, true)
        XCTAssertEqual(response.candidates.first?.recommendation.expectedPulseBasis?.first, "source-backed hours")
        XCTAssertEqual(response.messages.first?.text, "Meet by the side door?")
        XCTAssertEqual(response.messages.last?.emoji, .fire)
        XCTAssertEqual(response.leader?.id, "candidate-1")
    }

    func testSocialClientBuildsProtectedRequests() async throws {
        var seen: [String] = []
        URLProtocolMock.requestHandler = { request in
            let path = try XCTUnwrap(request.url?.path)
            seen.append(path)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: path.contains("invites") || path.contains("blocks") || path.contains("coming") || path.contains("replies") || path.contains("report") ? 201 : 200,
                httpVersion: nil,
                headerFields: nil
            )!

            switch path {
            case "/api/v1/friends/search":
                XCTAssertEqual(request.url?.query, "q=maya&limit=20")
                return (response, Data(#"{"items":[{"id":"user-2","display_name":"Maya","username":"maya","avatar_kind":"initials","bio":null,"friendship_status":"none","friendship_id":null,"direction":"none"}]}"#.utf8))
            case "/api/v1/friends/requests":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["user_id"] as? String, "user-2")
                return (response, Data(#"{"friendship":{"id":"friendship-1","status":"pending","direction":"outgoing","requester_user_id":"user-1","addressee_user_id":"user-2","responded_at":null,"created_at":"2026-04-28T00:00:00Z","updated_at":"2026-04-28T00:00:00Z"}}"#.utf8))
            case "/api/v1/friends/requests/friendship-1/accept":
                return (response, Data(#"{"friendship":{"id":"friendship-1","status":"accepted","direction":"incoming","requester_user_id":"user-1","addressee_user_id":"user-2","responded_at":"2026-04-28T00:00:00Z","created_at":"2026-04-28T00:00:00Z","updated_at":"2026-04-28T00:00:00Z"}}"#.utf8))
            case "/api/v1/friends/blocks":
                return (response, Data(#"{"blocked":{"id":"user-2","display_name":"Maya","username":"maya","avatar_kind":"initials","bio":null}}"#.utf8))
            case "/api/v1/friends/invites":
                return (response, Data(#"{"invite":{"id":"invite-1","code":"NL-ABCD-2345","code_hint":"2345","expires_at":"2026-05-05T00:00:00Z","revoked_at":null,"created_at":"2026-04-28T00:00:00Z"}}"#.utf8))
            case "/api/v1/friends/invites/accept":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["code"] as? String, "NL-ABCD-2345")
                return (response, Data(#"{"friendship":{"id":"friendship-1","status":"accepted","direction":"incoming","requester_user_id":"user-1","addressee_user_id":"user-2","responded_at":"2026-04-28T00:00:00Z","created_at":"2026-04-28T00:00:00Z","updated_at":"2026-04-28T00:00:00Z"}}"#.utf8))
            case "/api/v1/friends/activity":
                return (response, Self.friendActivityFixtureData())
            case "/api/v1/friends/tonight":
                return (response, Self.friendsTonightFixtureData())
            case "/api/v1/friends/venues/venue-1/coming":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                if object["is_coming"] as? Bool == true {
                    return (response, Data(#"{"activity":{"id":"activity-2","type":"coming","signal_kind":null,"text":null,"actor":{"id":"user-1","display_name":"Alex","username":"alex","avatar_kind":"initials","bio":null},"venue":{"id":"venue-1","name":"Halcyon","neighborhood":"SoMa","category":"club"},"viewer_has_coming":true,"coming_count":1,"replies":[],"expires_at":"2026-04-29T11:00:00Z","created_at":"2026-04-28T00:00:00Z"}}"#.utf8))
                }
                XCTAssertEqual(object["is_coming"] as? Bool, false)
                return (response, Data(#"{"status":"cancelled"}"#.utf8))
            case "/api/v1/friends/activity/activity-1/replies":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["kind"] as? String, "comment")
                XCTAssertEqual(object["text"] as? String, "got a booth")
                return (response, Data(#"{"reply":{"id":"reply-1","type":"comment","signal_kind":null,"text":"got a booth","actor":{"id":"user-1","display_name":"Alex","username":"alex","avatar_kind":"initials","bio":null},"venue":null,"viewer_has_coming":false,"coming_count":0,"replies":[],"expires_at":"2026-04-29T11:00:00Z","created_at":"2026-04-28T00:00:00Z"}}"#.utf8))
            case "/api/v1/friends/activity/activity-1/report":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["reason"] as? String, "spam")
                return (response, Data(#"{"report_id":"report-1"}"#.utf8))
            case "/api/v1/friends/profiles/user-2/report":
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["reason"] as? String, "inappropriate")
                return (response, Data(#"{"report_id":"report-2"}"#.utf8))
            default:
                XCTFail("Unexpected social path \(path)")
                return (response, Data("{}".utf8))
            }
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.searchFriends(query: "maya", bearerToken: "test-token")
        _ = try await client.sendFriendRequest(userID: "user-2", bearerToken: "test-token")
        _ = try await client.acceptFriendRequest(friendshipID: "friendship-1", bearerToken: "test-token")
        _ = try await client.blockUser(userID: "user-2", bearerToken: "test-token")
        _ = try await client.createFriendInvite(bearerToken: "test-token")
        _ = try await client.acceptFriendInvite(code: "NL-ABCD-2345", bearerToken: "test-token")
        _ = try await client.friendActivity(bearerToken: "test-token")
        _ = try await client.friendsTonight(bearerToken: "test-token")
        _ = try await client.toggleComing(venueID: "venue-1", isComing: true, bearerToken: "test-token")
        _ = try await client.cancelComing(venueID: "venue-1", bearerToken: "test-token")
        _ = try await client.replyToActivity(activityID: "activity-1", kind: .comment, text: "got a booth", bearerToken: "test-token")
        _ = try await client.reportActivity(activityID: "activity-1", reason: "spam", bearerToken: "test-token")
        _ = try await client.reportProfile(userID: "user-2", reason: "inappropriate", bearerToken: "test-token")

        XCTAssertEqual(seen.count, 13)
    }

    func testDecisionClientBuildsProtectedRequests() async throws {
        var seen: [String] = []
        URLProtocolMock.requestHandler = { request in
            let path = try XCTUnwrap(request.url?.path)
            seen.append(path)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")

            let statusCode = path == "/api/v1/decision-sessions" && request.httpMethod == "POST" ? 201 : 200
            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: statusCode,
                httpVersion: nil,
                headerFields: nil
            )!

            switch (request.httpMethod, path) {
            case ("GET", "/api/v1/decision-sessions"):
                return (response, Self.decisionSessionListFixtureData())
            case ("POST", "/api/v1/decision-sessions"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["market_id"] as? String, "market-1")
                XCTAssertEqual(object["invited_user_ids"] as? [String], ["user-2"])
                let filters = try XCTUnwrap(object["filters"] as? [String: Any])
                XCTAssertEqual(filters["pulse"] as? String, "active")
                return (response, Self.decisionSessionFixtureData())
            case ("GET", "/api/v1/decision-sessions/session-1"):
                return (response, Self.decisionSessionFixtureData())
            case ("GET", "/api/v1/decision-sessions/session-1/venue-search"):
                XCTAssertEqual(request.url?.query?.contains("q=audio"), true)
                return (response, Data(#"{"items":[\#(String(data: Self.venueFixtureJSON(), encoding: .utf8)!)]}"#.utf8))
            case ("POST", "/api/v1/decision-sessions/session-1/join"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["code"] as? String, "ND-ABCD-2345")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/join"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["code"] as? String, "ND-ABCD-2345")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/votes"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["candidate_id"] as? String, "candidate-1")
                XCTAssertEqual(object["vote"] as? String, "in")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/advance-shortlist"):
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/shortlist-votes"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["candidate_id"] as? String, "candidate-1")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/candidates"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["venue_id"] as? String, "venue-2")
                return (response, Self.decisionSessionFixtureData())
            case ("DELETE", "/api/v1/decision-sessions/session-1/candidates/candidate-2"):
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/finalize"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["candidate_id"] as? String, "candidate-1")
                XCTAssertEqual(object["final_note"] as? String, "Meet by the entrance.")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/messages"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["type"] as? String, "text")
                XCTAssertEqual(object["text"] as? String, "Meet by the side door?")
                return (response, Self.decisionSessionFixtureData())
            case ("POST", "/api/v1/decision-sessions/session-1/messages/message-1/report"):
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(object["reason"] as? String, "spam")
                return (response, Data(#"{"report_id":"report-1"}"#.utf8))
            case ("POST", "/api/v1/decision-sessions/session-1/revoke-code"),
                 ("POST", "/api/v1/decision-sessions/session-1/end"):
                return (response, Self.decisionSessionFixtureData())
            default:
                XCTFail("Unexpected decision path \(path)")
                return (response, Data("{}".utf8))
            }
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        _ = try await client.decisionSessions(bearerToken: "test-token")
        _ = try await client.createDecisionSession(
            marketID: "market-1",
            invitedUserIDs: ["user-2"],
            filters: DecisionFilters(neighborhood: nil, category: nil, pulse: "active"),
            bearerToken: "test-token"
        )
        _ = try await client.decisionSession(id: "session-1", bearerToken: "test-token")
        _ = try await client.searchDecisionVenues(sessionID: "session-1", query: "audio", bearerToken: "test-token")
        _ = try await client.joinDecisionSession(id: "session-1", code: "ND-ABCD-2345", bearerToken: "test-token")
        _ = try await client.joinDecisionSession(code: "ND-ABCD-2345", bearerToken: "test-token")
        _ = try await client.voteDecisionSession(id: "session-1", candidateID: "candidate-1", vote: .voteIn, bearerToken: "test-token")
        _ = try await client.advanceDecisionShortlist(sessionID: "session-1", bearerToken: "test-token")
        _ = try await client.voteDecisionShortlist(sessionID: "session-1", candidateID: "candidate-1", bearerToken: "test-token")
        _ = try await client.suggestDecisionCandidate(sessionID: "session-1", venueID: "venue-2", bearerToken: "test-token")
        _ = try await client.removeDecisionCandidate(sessionID: "session-1", candidateID: "candidate-2", bearerToken: "test-token")
        _ = try await client.finalizeDecisionSession(
            id: "session-1",
            candidateID: "candidate-1",
            meetupAt: "2026-04-29T06:00:00Z",
            note: "Meet by the entrance.",
            bearerToken: "test-token"
        )
        _ = try await client.addDecisionMessage(
            sessionID: "session-1",
            type: .text,
            text: "Meet by the side door?",
            bearerToken: "test-token"
        )
        _ = try await client.reportDecisionMessage(sessionID: "session-1", messageID: "message-1", reason: "spam", bearerToken: "test-token")
        _ = try await client.revokeDecisionSessionCode(id: "session-1", bearerToken: "test-token")
        _ = try await client.endDecisionSession(id: "session-1", bearerToken: "test-token")

        XCTAssertEqual(seen.count, 16)
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

    func testDevSocialCrewResetRequestUsesLocalDevEndpointAndDecodesSafeUsers() async throws {
        URLProtocolMock.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:4000/api/v1/dev/social-crew/reset")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))

            let body = try XCTUnwrap(Self.bodyData(from: request))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(object["market"] as? String, "san-francisco")

            let response = HTTPURLResponse(
                url: try XCTUnwrap(request.url),
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = Data("""
            {
              "market": "san-francisco",
              "market_id": "market-1",
              "venue": "1015 Folsom",
              "auth_users_created": true,
              "users": [
                {
                  "key": "chuck",
                  "id": "user-1",
                  "auth_user_id": "auth-user-1",
                  "email": "test@dev.com",
                  "username": "chuck",
                  "display_name": "Chuck",
                  "role": "primary"
                }
              ],
              "audit": { "ok": true, "failures": [] }
            }
            """.utf8)
            return (response, data)
        }
        defer { URLProtocolMock.requestHandler = nil }

        let client = NightloopAPIClient(
            baseURL: URL(string: "http://127.0.0.1:4000/api/v1")!,
            session: .mocked
        )

        let response = try await client.resetDevSocialCrew(market: "san-francisco")

        XCTAssertEqual(response.users.first?.email, "test@dev.com")
        XCTAssertEqual(response.users.first?.username, "chuck")
        XCTAssertEqual(response.users.first?.role, "primary")
        XCTAssertTrue(response.audit.ok)
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
            pulse: VenuePulse(level: 2, label: "Active", score: 55, source: "verified_signals", isExpected: false, copy: nil, basis: nil),
            trend: "steady",
            waitMinutes: nil,
            signalCount: 0,
            recentSignalCount: 0,
            confidence: "high",
            liveness: Self.livenessFixture(state: .unknown, hoursState: .unknown, confidence: .low),
            event: nil,
            hours: VenueHours(
                status: "unknown",
                source: "unknown",
                hoursState: .unknown,
                confidence: "low",
                verifiedAt: nil,
                fetchedAt: nil,
                opensAt: nil,
                closesAt: nil,
                label: "Hours unknown",
                claimsOpenNow: false,
                weeklyHours: nil,
                metadata: nil
            ),
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
            \(String(data: venueFixtureJSON(), encoding: .utf8)!)
          ]
        }
        """.utf8)
    }

    private static func friendsFixtureData() -> Data {
        Data("""
        {
          "friends": [
            {
              "user": { "id": "user-2", "display_name": "Maya", "username": "maya", "avatar_kind": "initials", "bio": null },
              "friendship": {
                "id": "friendship-1",
                "status": "accepted",
                "direction": "outgoing",
                "requester_user_id": "user-1",
                "addressee_user_id": "user-2",
                "responded_at": "2026-04-28T00:00:00Z",
                "created_at": "2026-04-28T00:00:00Z",
                "updated_at": "2026-04-28T00:00:00Z"
              }
            }
          ],
          "incoming_requests": [
            {
              "user": { "id": "user-3", "display_name": "Rosa", "username": "rosa", "avatar_kind": "initials", "bio": null },
              "friendship": {
                "id": "friendship-2",
                "status": "pending",
                "direction": "incoming",
                "requester_user_id": "user-3",
                "addressee_user_id": "user-1",
                "responded_at": null,
                "created_at": "2026-04-28T00:00:00Z",
                "updated_at": "2026-04-28T00:00:00Z"
              }
            }
          ],
          "outgoing_requests": []
        }
        """.utf8)
    }

    private static func friendActivityFixtureData() -> Data {
        Data("""
        {
          "items": [
            {
              "id": "activity-1",
              "type": "signal",
              "signal_kind": "packed",
              "text": null,
              "actor": { "id": "user-2", "display_name": "Maya", "username": "maya", "avatar_kind": "initials", "bio": null },
              "venue": { "id": "venue-1", "name": "Halcyon", "neighborhood": "SoMa", "category": "club" },
              "viewer_has_coming": false,
              "coming_count": 1,
              "replies": [
                {
                  "id": "reply-1",
                  "type": "comment",
                  "text": "got a booth",
                  "signal_kind": null,
                  "created_at": "2026-04-28T00:05:00Z",
                  "actor": { "id": "user-3", "display_name": "Rosa", "username": "rosa", "avatar_kind": "initials" }
                }
              ],
              "expires_at": "2026-04-29T11:00:00Z",
              "created_at": "2026-04-28T00:00:00Z"
            }
          ]
        }
        """.utf8)
    }

    private static func friendsTonightFixtureData() -> Data {
        Data("""
        {
          "generated_at": "2026-04-28T00:10:00Z",
          "groups": [
            {
              "venue": { "id": "venue-1", "name": "Halcyon", "neighborhood": "SoMa", "category": "club" },
              "friends": [
                { "id": "user-2", "display_name": "Maya", "username": "maya", "avatar_kind": "initials", "bio": null }
              ],
              "latest_activity": {
                "id": "activity-1",
                "type": "signal",
                "signal_kind": "packed",
                "text": null,
                "actor": { "id": "user-2", "display_name": "Maya", "username": "maya", "avatar_kind": "initials", "bio": null },
                "venue": { "id": "venue-1", "name": "Halcyon", "neighborhood": "SoMa", "category": "club" },
                "viewer_has_coming": false,
                "coming_count": 1,
                "replies": [
                  {
                    "id": "reply-1",
                    "type": "comment",
                    "text": "got a booth",
                    "signal_kind": null,
                    "created_at": "2026-04-28T00:05:00Z",
                    "actor": { "id": "user-3", "display_name": "Rosa", "username": "rosa", "avatar_kind": "initials" }
                  }
                ],
                "expires_at": "2026-04-29T11:00:00Z",
                "created_at": "2026-04-28T00:00:00Z"
              },
              "viewer_has_coming": false,
              "coming_count": 1,
              "cta": { "primary": "I'm Coming", "can_come": true, "secondary": "Pick a spot" }
            }
          ],
          "timeline": [],
          "counts": { "groups": 1, "timeline": 0 },
          "empty_state": {
            "title": "Quiet so far",
            "message": "Invite friends or start a room when the night takes shape."
          }
        }
        """.utf8)
    }

    private static func decisionSessionListFixtureData() -> Data {
        Data("""
        {
          "items": [
            {
              "id": "session-1",
              "status": "active",
              "stage": "swiping",
              "room_title": "Alex + 1 tonight",
              "market": { "id": "market-1", "slug": "san-francisco", "short_label": "SF" },
              "expires_at": "2026-04-29T11:00:00Z",
              "code_hint": "2345",
              "code_revoked_at": null,
              "member_counts": { "joined": 2, "invited": 1 },
              "viewer_role": "creator",
              "viewer_status": "joined",
              "leader": {
                "id": "candidate-1",
                "venue_id": "venue-1",
                "venue_name": "Halcyon",
                "in_count": 1,
                "group_fit_score": 76.5
              }
            }
          ]
        }
        """.utf8)
    }

    private static func decisionSessionFixtureData() -> Data {
        let candidate = String(data: decisionCandidateFixtureJSON(), encoding: .utf8)!
        return Data("""
        {
          "session": {
            "id": "session-1",
            "status": "active",
            "stage": "swiping",
            "room_title": "Alex + 1 tonight",
            "market": { "id": "market-1", "slug": "san-francisco", "short_label": "SF" },
              "filters": { "pulse": "active" },
              "final_plan": {
                "candidate_id": "candidate-1",
                "venue_id": "venue-1",
                "finalized_at": "2026-04-28T02:00:00Z",
                "meetup_at": "2026-04-29T06:00:00Z",
                "note": "Meet by the entrance.",
                "locked_by": {
                  "id": "user-1",
                  "display_name": "Alex",
                  "username": "alex",
                  "avatar_kind": "initials"
                },
                "venue": \(String(data: venueFixtureJSON(), encoding: .utf8)!)
              },
              "expires_at": "2026-04-29T11:00:00Z",
              "ended_at": null,
              "code_hint": "2345",
              "code_revoked_at": null,
              "code": "ND-ABCD-2345",
              "member_counts": { "joined": 2, "invited": 1 },
              "viewer_role": "creator",
              "viewer_status": "joined",
              "capabilities": {
                "can_vote": true,
                "can_vote_shortlist": false,
                "can_force_shortlist": true,
                "can_suggest_candidates": true,
                "can_message": true,
                "can_finalize": true
              },
              "progress": {
                "ready_for_shortlist": false,
                "confidence": 50,
                "required_swipes_per_member": 4,
                "members": [
                  {
                    "user": {
                      "id": null,
                      "display_name": "Alex",
                      "username": "alex",
                      "avatar_kind": "initials"
                    },
                    "role": "creator",
                    "swiped_count": 2,
                    "required_swipes": 4,
                    "is_complete": false
                  }
                ]
              },
              "created_at": "2026-04-28T00:00:00Z",
              "updated_at": "2026-04-28T00:05:00Z"
            },
          "candidates": [
            \(candidate)
          ],
          "deck_candidates": [
            \(candidate)
          ],
          "shortlist": [
            \(candidate)
          ],
          "recommended_final_candidate": \(candidate),
          "leader": \(candidate),
          "messages": [
            {
              "id": "message-1",
              "session_id": "session-1",
              "type": "text",
              "text": "Meet by the side door?",
              "emoji": null,
              "actor": {
                "id": "user-2",
                "display_name": "Maya",
                "username": "maya",
                "avatar_kind": "initials"
              },
              "expires_at": "2026-04-29T11:00:00Z",
              "created_at": "2026-04-28T01:00:00Z",
              "updated_at": "2026-04-28T01:00:00Z"
            },
            {
              "id": "message-2",
              "session_id": "session-1",
              "type": "emoji",
              "text": null,
              "emoji": "fire",
              "actor": {
                "id": "user-1",
                "display_name": "Alex",
                "username": "alex",
                "avatar_kind": "initials"
              },
              "expires_at": "2026-04-29T11:00:00Z",
              "created_at": "2026-04-28T01:01:00Z",
              "updated_at": "2026-04-28T01:01:00Z"
            }
          ]
        }
        """.utf8)
    }

    private static func decisionCandidateFixtureJSON() -> Data {
        Data("""
        {
          "id": "candidate-1",
          "venue_id": "venue-1",
          "original_rank": 1,
          "base_score": 88.4,
          "source": "suggested",
          "suggested_by": {
            "id": "user-2",
            "display_name": "Maya",
            "username": "maya",
            "avatar_kind": "initials"
          },
          "suggested_at": "2026-04-28T00:30:00Z",
          "can_remove": true,
          "venue": \(String(data: venueFixtureJSON(), encoding: .utf8)!),
          "recommendation": {
            "rank": 1,
            "score": 88.4,
            "reason": "Expected tonight from source-backed hours.",
            "confidence": "medium",
            "liveness": {
              "state": "opens_later",
              "hours_state": "source_verified",
              "confidence": "medium",
              "opens_at": "10:00 PM",
              "closes_at": null,
              "expected_pulse_level": 3,
              "live_signal_count": 0,
              "live_unique_user_count": 0,
              "copy": {
                "label": "Opens later",
                "supporting_text": "Source-backed hours say it opens at 10:00 PM.",
                "provenance": "Hours source: Google Places"
              },
              "provenance": {
                "source": "provider:google_places",
                "verified_at": "2026-04-27T00:00:00.000Z",
                "fetched_at": "2026-04-27T00:00:00.000Z"
              }
            },
            "expected_pulse_basis": ["source-backed hours"],
            "factors": {
              "venue_quality": 86,
              "preference_match": 74,
              "live_signals": 0,
              "event_relevance": 20,
              "source_confidence": 88,
              "hours_confidence": 90
            }
          },
          "in_count": 1,
          "skip_count": 0,
          "viewer_vote": "in",
          "shortlist_vote_count": 1,
          "viewer_shortlist_vote": true,
          "group_fit_score": 76.5,
          "group_fit_member_count": 2,
          "group_fit_reason": "Group fit blends 2 joined friends' saved picks."
        }
        """.utf8)
    }

    private static func venueFixtureJSON() -> Data {
        Data("""
        {
              "id": "venue-1",
              "slug": "halcyon",
              "name": "Halcyon",
              "market_id": "market-1",
              "neighborhood": "SoMa",
              "category": "club",
              "coordinate": { "latitude": 37.7751, "longitude": -122.4105 },
              "distance_miles": null,
              "pulse": {
                "level": 3,
                "label": "Expected packed",
                "score": 82,
                "source": "expected",
                "is_expected": true,
                "copy": "Expected tonight with a source-backed event, based on venue type and current timing."
              },
              "trend": "rising",
              "wait_minutes": 15,
              "signal_count": 12,
              "recent_signal_count": 4,
              "confidence": "high",
              "liveness": {
                "state": "opens_later",
                "hours_state": "source_verified",
                "confidence": "medium",
                "opens_at": "10:00 PM",
                "closes_at": null,
                "expected_pulse_level": 3,
                "live_signal_count": 0,
                "live_unique_user_count": 0,
                "copy": {
                  "label": "Opens later",
                  "supporting_text": "Source-backed hours say it opens at 10:00 PM.",
                  "provenance": "Hours source: Google Places"
                },
                "provenance": {
                  "source": "provider:google_places",
                  "verified_at": "2026-04-27T00:00:00.000Z",
                  "fetched_at": "2026-04-27T00:00:00.000Z"
                }
              },
              "event": null,
              "hours": {
                "status": "verified_hours",
                "source": "provider:google_places",
                "hours_state": "source_verified",
                "confidence": "high",
                "verified_at": "2026-04-27T00:00:00.000Z",
                "fetched_at": "2026-04-27T00:00:00.000Z",
                "opens_at": "10:00 PM",
                "closes_at": null,
                "label": "Hours verified",
                "claims_open_now": false,
                "weekly_hours": {},
                "metadata": { "is_open_now": true }
              },
              "friend_summary": { "friends_here_count": 0, "first_friend_name": null },
              "image": null,
              "assets": [],
              "why_short": "Packed energy in SoMa.",
              "last_signal_at": null,
              "computed_at": null,
              "source_summary": {}
        }
        """.utf8)
    }

    private static func venueFixture(
        id: String,
        name: String,
        latitude: Double,
        longitude: Double,
        score: Int,
        level: Int,
        livenessState: VenueLivenessState? = nil
    ) -> VenueItem {
        let state = livenessState ?? (level >= 3 ? .live : .opensLater)
        return VenueItem(
            id: id,
            slug: name.lowercased(),
            name: name,
            marketId: "market-1",
            neighborhood: "SoMa",
            category: "club",
            coordinate: Coordinate(latitude: latitude, longitude: longitude),
            distanceMiles: nil,
            pulse: VenuePulse(
                level: level,
                label: level >= 3 ? "Packed" : "Chill",
                score: score,
                source: level >= 3 ? "verified_signals" : "expected",
                isExpected: level < 3,
                copy: nil,
                basis: nil
            ),
            trend: "steady",
            waitMinutes: nil,
            signalCount: 0,
            recentSignalCount: 0,
            confidence: "high",
            liveness: Self.livenessFixture(
                state: state,
                hoursState: .sourceVerified,
                confidence: state == .live || state == .closedToday ? .high : .medium
            ),
            event: nil,
            hours: VenueHours(
                status: "unknown",
                source: "unknown",
                hoursState: .unknown,
                confidence: "low",
                verifiedAt: nil,
                fetchedAt: nil,
                opensAt: nil,
                closesAt: nil,
                label: "Hours unknown",
                claimsOpenNow: false,
                weeklyHours: nil,
                metadata: nil
            ),
            friendSummary: FriendSummary(friendsHereCount: 0, firstFriendName: nil),
            image: nil,
            assets: [],
            whyShort: "Nightloop fixture.",
            lastSignalAt: nil,
            computedAt: nil,
            sourceSummary: nil
        )
    }

    private static func livenessFixture(
        state: VenueLivenessState,
        hoursState: HoursState,
        confidence: RecommendationConfidence
    ) -> VenueLiveness {
        VenueLiveness(
            state: state,
            hoursState: hoursState,
            confidence: confidence,
            opensAt: state == .opensLater ? "10:00 PM" : nil,
            closesAt: state == .live ? "2:00 AM" : nil,
            expectedPulseLevel: 3,
            liveSignalCount: state == .live ? 3 : 0,
            liveUniqueUserCount: state == .live ? 2 : 0,
            copy: VenueLivenessCopy(
                label: state == .live ? "Live now" : "Tonight preview",
                supportingText: "Source-backed fixture.",
                provenance: "Hours source: Google Places"
            ),
            provenance: VenueLivenessProvenance(
                source: "provider:google_places",
                verifiedAt: "2026-04-27T00:00:00.000Z",
                fetchedAt: "2026-04-27T00:00:00.000Z"
            )
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
