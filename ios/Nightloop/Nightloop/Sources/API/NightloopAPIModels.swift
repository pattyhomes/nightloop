import Foundation

enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            self = .array(try container.decode([JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

struct APIErrorEnvelope: Decodable, Equatable {
    let error: APIErrorBody
}

struct APIErrorBody: Decodable, Equatable {
    let code: String
    let message: String
    let details: JSONValue?
}

struct AppUser: Decodable, Equatable {
    let id: String
    let authUserId: String
    let eligibilityStatus: String
    let ageAttestedAt: String?
    let signalScoutPoints: Int
    let createdAt: String
}

struct UserProfile: Codable, Equatable {
    let displayName: String?
    let username: String?
    let avatarKind: String?
    let bio: String?
    let selectedMarketId: String?
}

struct UserSettings: Codable, Equatable {
    let ghostMode: Bool
    let mapShowNeighborhoodLabels: Bool
    let mapShowStreetGrid: Bool
    let pushSocialEnabled: Bool
    let pushDecisionEnabled: Bool
    let pushFavoriteVenueAlertsEnabled: Bool

    static let fallback = UserSettings(
        ghostMode: false,
        mapShowNeighborhoodLabels: true,
        mapShowStreetGrid: true,
        pushSocialEnabled: true,
        pushDecisionEnabled: true,
        pushFavoriteVenueAlertsEnabled: false
    )
}

struct OnboardingState: Decodable, Equatable {
    let status: String
    let missingSteps: [String]
}

struct MeResponse: Decodable, Equatable {
    let user: AppUser
    let profile: UserProfile?
    let settings: UserSettings?
    let onboarding: OnboardingState
}

struct Coordinate: Codable, Equatable {
    let latitude: Double
    let longitude: Double
}

struct Market: Decodable, Identifiable, Equatable {
    let id: String
    let slug: String
    let displayName: String
    let shortLabel: String
    let timezone: String
    let countryCode: String
    let launchStatus: String
    let center: Coordinate
    let defaultZoom: Double?
    let bounds: JSONValue?
    let mapboxStyleUri: String?
}

struct MarketsResponse: Decodable, Equatable {
    let items: [Market]
}

struct VenuePulse: Codable, Equatable {
    let level: Int
    let label: String
    let score: Int
}

struct VenueEvent: Codable, Equatable {
    let id: String?
    let title: String?
    let startsAt: String?
    let endsAt: String?
    let source: String?
    let url: String?
}

struct VenueAsset: Codable, Equatable, Identifiable {
    let id: String?
    let assetType: String?
    let url: String?
    let altText: String?
    let creditText: String?
    let creditUrl: String?
    let licenseName: String?
    let licenseUrl: String?
    let rightsStatus: String?
    let source: String?
}

struct FriendSummary: Codable, Equatable {
    let friendsHereCount: Int
    let firstFriendName: String?
}

struct VenueItem: Codable, Identifiable, Equatable {
    let id: String
    let slug: String?
    let name: String
    let marketId: String
    let neighborhood: String
    let category: String
    let coordinate: Coordinate
    let distanceMiles: Double?
    let pulse: VenuePulse
    let trend: String
    let waitMinutes: Int?
    let signalCount: Int
    let recentSignalCount: Int
    let confidence: String
    let event: VenueEvent?
    let friendSummary: FriendSummary
    let image: VenueAsset?
    let assets: [VenueAsset]
    let whyShort: String
    let lastSignalAt: String?
    let computedAt: String?
    let sourceSummary: JSONValue?
}

struct VenueCounts: Decodable, Equatable {
    let all: Int
    let packed: Int
    let active: Int
    let chill: Int
    let friends: Int
}

struct VenueListResponse: Decodable, Equatable {
    let generatedAt: String
    let market: VenueListMarket
    let items: [VenueItem]
    let counts: VenueCounts
    let nextCursor: String?
}

struct VenueListMarket: Decodable, Equatable {
    let id: String
    let shortLabel: String
}

struct VenueDetailResponse: Decodable, Equatable {
    let venue: VenueItem
    let trendBuckets: [TrendBucket]
}

struct TrendBucket: Decodable, Equatable {
    let bucketStart: String?
    let energyScore: Int?
    let pulseLevel: Int?
    let signalCount: Int?
}

struct PreferencesResponse: Decodable, Equatable {
    let preferences: [String: [String]]
}

struct AccountDeletionResponse: Decodable, Equatable {
    let status: String
    let message: String
}

enum SignalKind: String, Codable, CaseIterable, Identifiable {
    case packed
    case shortLine = "short_line"
    case longLine = "long_line"
    case dead
    case eventLive = "event_live"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .packed: return "Packed"
        case .shortLine: return "Short line"
        case .longLine: return "Long line"
        case .dead: return "Dead"
        case .eventLive: return "Event live"
        }
    }

    var symbol: String {
        switch self {
        case .packed: return "flame.fill"
        case .shortLine: return "figure.walk"
        case .longLine: return "hourglass"
        case .dead: return "moon.zzz.fill"
        case .eventLive: return "music.note"
        }
    }
}

struct SignalResponse: Decodable, Equatable {
    let signalId: String
    let venueId: String
    let pointsAwarded: Int
    let newSignalScoutPoints: Int
}
