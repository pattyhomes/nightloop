import Foundation

enum PreviewFilterPolicy: String, CaseIterable, Identifiable, Equatable {
    case all
    case expected
    case opensLater
    case sourceBacked

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .expected: return "expected"
        case .opensLater: return "opens later"
        case .sourceBacked: return "source-backed"
        }
    }

    func count(in recommendations: [RecommendationItem]) -> Int {
        recommendations.filter { matches($0) }.count
    }

    func count(in venues: [VenueItem]) -> Int {
        venues.filter { matches($0) }.count
    }

    func matches(_ item: RecommendationItem) -> Bool {
        matches(item.venue, expectedPulseBasis: item.expectedPulseBasis)
    }

    func matches(_ venue: VenueItem, expectedPulseBasis: [String]? = nil) -> Bool {
        switch self {
        case .all:
            return venue.liveness?.state != .closedToday
        case .expected:
            return venue.pulse.isExpected == true || venue.liveness?.state == .opensLater
        case .opensLater:
            return venue.liveness?.state == .opensLater
        case .sourceBacked:
            return isSourceBacked(venue, expectedPulseBasis: expectedPulseBasis)
        }
    }

    private func isSourceBacked(_ venue: VenueItem, expectedPulseBasis: [String]?) -> Bool {
        if venue.liveness?.hoursState == .sourceVerified { return true }
        if venue.event?.source?.isEmpty == false { return true }

        let basis = (expectedPulseBasis ?? []) + (venue.pulse.basis ?? [])
        return basis.contains { value in
            let normalized = value.lowercased()
            return normalized.contains("source")
                || normalized.contains("hours")
                || normalized.contains("event")
                || normalized.contains("provider")
        }
    }
}
