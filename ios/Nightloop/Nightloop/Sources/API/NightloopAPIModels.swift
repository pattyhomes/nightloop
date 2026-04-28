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

struct MarketConfigResponse: Decodable, Equatable {
    let market: Market
    let neighborhoods: [MarketNeighborhood]
    let providerConfig: JSONValue?
}

struct MarketNeighborhood: Decodable, Identifiable, Equatable {
    let id: String
    let slug: String
    let displayName: String
    let labelCoordinate: Coordinate?
    let polygon: JSONValue?
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

struct VenueHours: Codable, Equatable {
    let status: String
    let source: String
    let hoursState: HoursState?
    let confidence: String
    let verifiedAt: String?
    let fetchedAt: String?
    let opensAt: String?
    let closesAt: String?
    let label: String
    let claimsOpenNow: Bool
    let weeklyHours: JSONValue?
    let metadata: JSONValue?
}

enum VenueLivenessState: String, Codable, Equatable {
    case live
    case opensLater = "opens_later"
    case closedToday = "closed_today"
    case unknown
}

enum HoursState: String, Codable, Equatable {
    case sourceVerified = "source_verified"
    case unknown
    case temporaryClosed = "temporary_closed"
    case manualHold = "manual_hold"
}

enum RecommendationConfidence: String, Codable, Equatable {
    case high
    case medium
    case low
}

struct VenueLivenessCopy: Codable, Equatable {
    let label: String
    let supportingText: String
    let provenance: String
}

struct VenueLivenessProvenance: Codable, Equatable {
    let source: String
    let verifiedAt: String?
    let fetchedAt: String?
}

struct VenueLiveness: Codable, Equatable {
    let state: VenueLivenessState
    let hoursState: HoursState
    let confidence: RecommendationConfidence
    let opensAt: String?
    let closesAt: String?
    let expectedPulseLevel: Int
    let liveSignalCount: Int
    let liveUniqueUserCount: Int
    let copy: VenueLivenessCopy?
    let provenance: VenueLivenessProvenance?
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
    let liveness: VenueLiveness?
    let event: VenueEvent?
    let hours: VenueHours?
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

struct RecommendationListResponse: Decodable, Equatable {
    let generatedAt: String
    let mode: String
    let market: VenueListMarket
    let items: [RecommendationItem]
    let counts: VenueCounts
    let nextCursor: String?
}

struct RecommendationItem: Decodable, Identifiable, Equatable {
    let rank: Int
    let score: Double
    let mode: String
    let reason: String
    let confidence: RecommendationConfidence?
    let liveness: VenueLiveness?
    let expectedPulseBasis: [String]?
    let venue: VenueItem
    let factors: RecommendationFactors?

    var id: String { venue.id }
}

struct RecommendationFactors: Decodable, Equatable {
    let venueQuality: Int
    let preferenceMatch: Int
    let liveSignals: Int
    let eventRelevance: Int
    let sourceConfidence: Int
    let hoursConfidence: Int
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

struct RecentSignalsResponse: Decodable, Equatable {
    let items: [RecentSignalItem]
}

struct RecentSignalItem: Decodable, Identifiable, Equatable {
    let id: String
    let venueId: String
    let venueName: String
    let venueNeighborhood: String
    let kind: SignalKind
    let pointsAwarded: Int
    let observedAt: String
}

struct FriendProfile: Codable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let username: String
    let avatarKind: String
    let bio: String?
}

struct Friendship: Codable, Identifiable, Equatable {
    let id: String
    let status: String
    let direction: String
    let requesterUserId: String
    let addresseeUserId: String
    let respondedAt: String?
    let createdAt: String
    let updatedAt: String
}

struct FriendConnection: Codable, Identifiable, Equatable {
    let user: FriendProfile
    let friendship: Friendship

    var id: String { friendship.id }
}

struct FriendsResponse: Decodable, Equatable {
    let friends: [FriendConnection]
    let incomingRequests: [FriendConnection]
    let outgoingRequests: [FriendConnection]
}

struct FriendSearchItem: Decodable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let username: String
    let avatarKind: String
    let bio: String?
    let friendshipStatus: String
    let friendshipId: String?
    let direction: String
}

struct FriendSearchResponse: Decodable, Equatable {
    let items: [FriendSearchItem]
}

struct FriendshipResponse: Decodable, Equatable {
    let friendship: Friendship
}

struct FriendRequestResponse: Decodable, Equatable {
    let created: Bool?
    let user: FriendProfile?
    let friendship: Friendship
}

struct FriendBlockResponse: Decodable, Equatable {
    let blocked: FriendProfile
}

struct FriendInvite: Decodable, Identifiable, Equatable {
    let id: String
    let code: String?
    let codeHint: String
    let expiresAt: String
    let revokedAt: String?
    let createdAt: String
}

struct FriendInviteResponse: Decodable, Equatable {
    let invite: FriendInvite
}

enum FriendActivityType: String, Codable, Equatable {
    case signal
    case coming
    case comment
    case emojiSignal = "emoji_signal"
}

struct FriendActivityVenue: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let neighborhood: String?
    let category: String?
}

struct FriendActivityReply: Codable, Identifiable, Equatable {
    let id: String
    let type: FriendActivityType
    let text: String?
    let signalKind: SignalKind?
    let createdAt: String
    let actor: FriendProfile
}

struct FriendActivityItem: Codable, Identifiable, Equatable {
    let id: String
    let type: FriendActivityType
    let signalKind: SignalKind?
    let text: String?
    let actor: FriendProfile
    let venue: FriendActivityVenue?
    let viewerHasComing: Bool
    let comingCount: Int
    let replies: [FriendActivityReply]
    let expiresAt: String
    let createdAt: String
}

struct FriendActivityResponse: Decodable, Equatable {
    let items: [FriendActivityItem]
}

struct FriendActivityMutationResponse: Decodable, Equatable {
    let activity: FriendActivityItem
}

struct FriendReplyResponse: Decodable, Equatable {
    let reply: FriendActivityItem
}

struct SocialReportResponse: Decodable, Equatable {
    let reportId: String?
}

struct SocialStatusResponse: Decodable, Equatable {
    let status: String
    let message: String?
}

#if DEBUG
struct DevConfirmedAuthUserResponse: Decodable, Equatable {
    let message: String
}
#endif

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

struct SignalDetails: Codable, Equatable {
    var waitMinutes: Int?
    var coverAmountDollars: Int?
    var crowdLevel: String?
    var vibeTags: [String]?
    var musicTags: [String]?
    var eventLive: Bool?
}

struct SignalResponse: Decodable, Equatable {
    let signalId: String
    let venueId: String
    let pointsAwarded: Int
    let newSignalScoutPoints: Int
}
