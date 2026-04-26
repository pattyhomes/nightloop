import CoreLocation
import Foundation
import SwiftUI

enum MapPulseFilter: String, CaseIterable, Equatable, Identifiable {
    case all
    case packed
    case active
    case chill

    var id: String { rawValue }

    var apiValue: String? {
        self == .all ? nil : rawValue
    }

    var label: String {
        switch self {
        case .all: return "All"
        case .packed: return "Packed"
        case .active: return "Active"
        case .chill: return "Chill"
        }
    }

    func count(from counts: VenueCounts?) -> Int {
        guard let counts else { return 0 }
        switch self {
        case .all: return counts.all
        case .packed: return counts.packed
        case .active: return counts.active
        case .chill: return counts.chill
        }
    }

    var color: Color {
        switch self {
        case .all: return NightloopTheme.inkMuted
        case .packed: return NightloopTheme.rose
        case .active: return NightloopTheme.amber
        case .chill: return NightloopTheme.cool
        }
    }
}

struct VenueMapMarker: Identifiable, Equatable {
    let id: String
    let venue: VenueItem
    let coordinate: CLLocationCoordinate2D
    let pulseLevel: Int
    let score: Int

    var tone: EnergyTone {
        EnergyTone.from(score: score)
    }

    static func markers(from venues: [VenueItem]) -> [VenueMapMarker] {
        venues.compactMap { venue in
            guard venue.coordinate.latitude != 0 || venue.coordinate.longitude != 0 else {
                return nil
            }

            return VenueMapMarker(
                id: venue.id,
                venue: venue,
                coordinate: CLLocationCoordinate2D(
                    latitude: venue.coordinate.latitude,
                    longitude: venue.coordinate.longitude
                ),
                pulseLevel: venue.pulse.level,
                score: venue.pulse.score
            )
        }
    }

    static func == (lhs: VenueMapMarker, rhs: VenueMapMarker) -> Bool {
        lhs.id == rhs.id &&
            lhs.venue == rhs.venue &&
            lhs.coordinate.latitude == rhs.coordinate.latitude &&
            lhs.coordinate.longitude == rhs.coordinate.longitude &&
            lhs.pulseLevel == rhs.pulseLevel &&
            lhs.score == rhs.score
    }
}

struct MapVenueFilter {
    static func selectedVenueID(current: String?, venues: [VenueItem]) -> String? {
        if let current, venues.contains(where: { $0.id == current }) {
            return current
        }
        return venues.first?.id
    }

    static func rankedVenues(from venues: [VenueItem]) -> [VenueItem] {
        venues.sorted {
            if $0.pulse.score == $1.pulse.score {
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
            return $0.pulse.score > $1.pulse.score
        }
    }
}
