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

struct LandingMetricsResponse: Decodable, Equatable {
    let market: LandingMetricsMarket
    let metrics: LandingMetrics
    let copy: LandingMetricsCopy
}

struct LandingMetricsMarket: Decodable, Equatable {
    let id: String
    let shortLabel: String
}

struct LandingMetrics: Decodable, Equatable {
    let approvedPublicVenues: Int
    let approvedFutureVenueOwnedEvents: Int
    let usableHoursEvidence: Int
    let venueDatapoints: Int
}

struct LandingMetricsCopy: Decodable, Equatable {
    let venueDatapointsLabel: String
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
    let source: String?
    let isExpected: Bool?
    let copy: String?
    let basis: [String]?
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

struct FriendsTonightCTA: Decodable, Equatable {
    let primary: String
    let canCome: Bool
    let secondary: String?
}

struct FriendsTonightGroup: Decodable, Identifiable, Equatable {
    let venue: FriendActivityVenue
    let friends: [FriendProfile]
    let latestActivity: FriendActivityItem
    let viewerHasComing: Bool
    let comingCount: Int
    let cta: FriendsTonightCTA

    var id: String { venue.id }
}

struct FriendsTonightCounts: Decodable, Equatable {
    let groups: Int
    let timeline: Int
}

struct FriendsTonightEmptyState: Decodable, Equatable {
    let title: String
    let message: String
}

struct FriendsTonightResponse: Decodable, Equatable {
    let generatedAt: String
    let groups: [FriendsTonightGroup]
    let timeline: [FriendActivityItem]
    let counts: FriendsTonightCounts
    let emptyState: FriendsTonightEmptyState?
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

struct DecisionFilters: Codable, Equatable {
    let neighborhood: String?
    let category: String?
    let pulse: String?
}

struct DecisionSessionMarket: Decodable, Equatable {
    let id: String
    let slug: String
    let shortLabel: String
}

struct DecisionMemberCounts: Decodable, Equatable {
    let joined: Int
    let invited: Int
}

struct DecisionUserSummary: Decodable, Equatable {
    let id: String?
    let displayName: String
    let username: String
    let avatarKind: String
}

struct DecisionCapabilities: Decodable, Equatable {
    let canVote: Bool
    let canVoteShortlist: Bool?
    let canForceShortlist: Bool?
    let canSuggestCandidates: Bool
    let canMessage: Bool
    let canFinalize: Bool
}

enum DecisionStage: String, Codable, Equatable {
    case swiping
    case shortlistVoting = "shortlist_voting"
    case finalized
}

struct DecisionMemberProgress: Decodable, Equatable {
    let user: DecisionUserSummary
    let role: String
    let swipedCount: Int
    let requiredSwipes: Int
    let isComplete: Bool
}

struct DecisionProgress: Decodable, Equatable {
    let readyForShortlist: Bool
    let confidence: Int
    let requiredSwipesPerMember: Int
    let members: [DecisionMemberProgress]
}

struct DecisionDeckState: Decodable, Equatable {
    let deckSize: Int
    let cardsTotal: Int
    let cardsRemaining: Int
    let nextCandidateID: String?
    let lastSwipedCandidateID: String?
    let canRewind: Bool

    enum CodingKeys: String, CodingKey {
        case deckSize
        case cardsTotal
        case cardsRemaining
        case nextCandidateID = "nextCandidateId"
        case lastSwipedCandidateID = "lastSwipedCandidateId"
        case canRewind
    }
}

struct DecisionFinalPlan: Decodable, Equatable {
    let candidateId: String?
    let venueId: String?
    let finalizedAt: String
    let meetupAt: String?
    let note: String?
    let lockedBy: DecisionUserSummary
    let venue: VenueItem?
}

struct DecisionSession: Decodable, Identifiable, Equatable {
    let id: String
    let status: String
    let stage: DecisionStage?
    let roomTitle: String?
    let market: DecisionSessionMarket
    let filters: DecisionFilters?
    let finalPlan: DecisionFinalPlan?
    let expiresAt: String
    let endedAt: String?
    let codeHint: String?
    let codeRevokedAt: String?
    let code: String?
    let memberCounts: DecisionMemberCounts
    let viewerRole: String
    let viewerStatus: String
    let capabilities: DecisionCapabilities?
    let progress: DecisionProgress?
    let deckState: DecisionDeckState?
    let createdAt: String?
    let updatedAt: String?
}

struct DecisionCandidateRecommendation: Decodable, Equatable {
    let rank: Int
    let score: Double
    let reason: String
    let confidence: RecommendationConfidence?
    let liveness: VenueLiveness?
    let expectedPulseBasis: [String]?
    let factors: RecommendationFactors?
}

enum DecisionVoteValue: String, Codable, Equatable {
    case voteIn = "in"
    case skip
}

struct DecisionCandidate: Decodable, Identifiable, Equatable {
    let id: String
    let venueId: String
    let originalRank: Int
    let baseScore: Double
    let source: String?
    let suggestedBy: DecisionUserSummary?
    let suggestedAt: String?
    let canRemove: Bool?
    let venue: VenueItem
    let recommendation: DecisionCandidateRecommendation
    let inCount: Int
    let skipCount: Int
    let viewerVote: DecisionVoteValue?
    let shortlistVoteCount: Int?
    let viewerShortlistVote: Bool?
    let groupFitScore: Double
    let groupFitMemberCount: Int
    let groupFitReason: String
}

enum DecisionMessageType: String, Codable, Equatable {
    case text
    case emoji
}

enum DecisionEmoji: String, Codable, Equatable {
    case fire
    case eyes
    case thumbsUp = "thumbs_up"
    case thinking
    case down

    var emoji: String {
        switch self {
        case .fire: return "🔥"
        case .eyes: return "👀"
        case .thumbsUp: return "👍"
        case .thinking: return "🤔"
        case .down: return "👎"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .fire: return "Fire"
        case .eyes: return "Eyes"
        case .thumbsUp: return "Thumbs up"
        case .thinking: return "Thinking"
        case .down: return "Thumbs down"
        }
    }
}

struct DecisionMessage: Decodable, Identifiable, Equatable {
    let id: String
    let sessionId: String
    let type: DecisionMessageType
    let text: String?
    let emoji: DecisionEmoji?
    let actor: DecisionUserSummary
    let expiresAt: String
    let createdAt: String
    let updatedAt: String
}

enum DecisionRoomEventType: String, Codable, Equatable {
    case roomJoined = "room_joined"
    case voteChanged = "vote_changed"
    case progressChanged = "progress_changed"
    case shortlistReady = "shortlist_ready"
    case shortlistVoteChanged = "shortlist_vote_changed"
    case messageCreated = "message_created"
    case candidateSuggested = "candidate_suggested"
    case candidateRemoved = "candidate_removed"
    case finalPlanLocked = "final_plan_locked"
    case roomEnded = "room_ended"
    case roomSnapshotInvalidated = "room_snapshot_invalidated"
}

struct DecisionRoomEvent: Decodable, Identifiable, Equatable {
    let id: String
    let sessionID: String
    let type: DecisionRoomEventType
    let actor: DecisionUserSummary?
    let candidateID: String?
    let messageID: String?
    let stage: DecisionStage?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case sessionID = "sessionId"
        case type
        case actor
        case candidateID = "candidateId"
        case messageID = "messageId"
        case stage
        case createdAt
    }
}

struct DecisionSessionResponse: Decodable, Equatable {
    let session: DecisionSession
    let candidates: [DecisionCandidate]
    let deckCandidates: [DecisionCandidate]?
    let shortlist: [DecisionCandidate]?
    let recommendedFinalCandidate: DecisionCandidate?
    let leader: DecisionCandidate?
    let messages: [DecisionMessage]
}

struct DecisionSessionSummaryLeader: Decodable, Equatable {
    let id: String
    let venueId: String
    let venueName: String
    let inCount: Int
    let groupFitScore: Double
}

struct DecisionSessionSummary: Decodable, Identifiable, Equatable {
    let id: String
    let status: String
    let stage: DecisionStage?
    let roomTitle: String?
    let market: DecisionSessionMarket
    let expiresAt: String
    let codeHint: String?
    let codeRevokedAt: String?
    let memberCounts: DecisionMemberCounts
    let viewerRole: String
    let viewerStatus: String
    let progress: DecisionProgress?
    let leader: DecisionSessionSummaryLeader?
}

struct DecisionSessionListResponse: Decodable, Equatable {
    let items: [DecisionSessionSummary]
}

struct DecisionVenueSearchResponse: Decodable, Equatable {
    let items: [VenueItem]
}

struct DeviceToken: Decodable, Identifiable, Equatable {
    let id: String
    let userID: String
    let platform: String
    let apnsEnvironment: String
    let appVersion: String?
    let buildNumber: String?
    let lastSeenAt: String
    let revokedAt: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userID = "userId"
        case platform
        case apnsEnvironment
        case appVersion
        case buildNumber
        case lastSeenAt
        case revokedAt
        case createdAt
        case updatedAt
    }
}

struct DeviceTokenResponse: Decodable, Equatable {
    let deviceToken: DeviceToken
}

struct DeviceTokenRevokeResponse: Decodable, Equatable {
    let revokedCount: Int
}

struct NotificationPreferences: Codable, Equatable {
    let roomInvitesEnabled: Bool
    let shortlistReadyEnabled: Bool
    let finalPlanLockedEnabled: Bool
    let roomMessagesEnabled: Bool
    let userID: String?
    let createdAt: String?
    let updatedAt: String?

    init(
        roomInvitesEnabled: Bool,
        shortlistReadyEnabled: Bool,
        finalPlanLockedEnabled: Bool,
        roomMessagesEnabled: Bool,
        userID: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil
    ) {
        self.roomInvitesEnabled = roomInvitesEnabled
        self.shortlistReadyEnabled = shortlistReadyEnabled
        self.finalPlanLockedEnabled = finalPlanLockedEnabled
        self.roomMessagesEnabled = roomMessagesEnabled
        self.userID = userID
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case roomInvitesEnabled
        case shortlistReadyEnabled
        case finalPlanLockedEnabled
        case roomMessagesEnabled
        case userID = "userId"
        case createdAt
        case updatedAt
    }
}

struct NotificationPreferencesResponse: Decodable, Equatable {
    let preferences: NotificationPreferences
}

enum NotificationPreferenceField: String, Equatable, Hashable {
    case roomInvitesEnabled = "room_invites_enabled"
    case shortlistReadyEnabled = "shortlist_ready_enabled"
    case finalPlanLockedEnabled = "final_plan_locked_enabled"
    case roomMessagesEnabled = "room_messages_enabled"
}

enum RoomNotificationCategory: String, Codable, Equatable {
    case roomInvite = "room_invite"
    case shortlistReady = "shortlist_ready"
    case finalPlanLocked = "final_plan_locked"
    case roomMessage = "room_message"
}

#if DEBUG
struct DevRoomNotificationRoute: Decodable, Equatable {
    let type: String
    let sessionID: String

    enum CodingKeys: String, CodingKey {
        case type
        case sessionID = "sessionId"
    }
}

struct DevRoomNotification: Decodable, Equatable {
    let category: RoomNotificationCategory
    let copy: String
    let route: DevRoomNotificationRoute
    let queuedCount: Int
    let deliveryMode: String
}

struct DevRoomNotificationResponse: Decodable, Equatable {
    let notification: DevRoomNotification
}
#endif

#if DEBUG
struct DevConfirmedAuthUserResponse: Decodable, Equatable {
    let message: String
}

struct DevSocialCrewUser: Decodable, Equatable, Identifiable {
    let key: String
    let id: String
    let authUserId: String
    let email: String
    let username: String
    let displayName: String
    let role: String
}

struct DevSocialCrewAudit: Decodable, Equatable {
    let ok: Bool
    let failures: [String]?
}

struct DevSocialCrewResetResponse: Decodable, Equatable {
    let market: String
    let marketId: String
    let venue: String
    let authUsersCreated: Bool
    let users: [DevSocialCrewUser]
    let audit: DevSocialCrewAudit
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
