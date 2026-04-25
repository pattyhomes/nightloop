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
    }

    func testConfigTreatsMissingSupabaseKeyAsUnconfigured() throws {
        let config = try NightloopConfig(info: [
            "NightloopAPIBaseURL": "http://127.0.0.1:4000/api/v1",
            "NightloopSupabaseURL": "https://example.supabase.co",
            "NightloopSupabasePublishableKey": ""
        ])

        XCTAssertFalse(config.isSupabaseConfigured)
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
        let data = Data("""
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

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let response = try decoder.decode(VenueListResponse.self, from: data)
        XCTAssertEqual(response.items.first?.pulse.score, 82)
        XCTAssertEqual(response.items.first?.pulse.label, "Packed")
    }

    func testSignalKindRawValuesMatchBackend() {
        XCTAssertEqual(SignalKind.packed.rawValue, "packed")
        XCTAssertEqual(SignalKind.shortLine.rawValue, "short_line")
        XCTAssertEqual(SignalKind.longLine.rawValue, "long_line")
        XCTAssertEqual(SignalKind.dead.rawValue, "dead")
        XCTAssertEqual(SignalKind.eventLive.rawValue, "event_live")
    }
}
