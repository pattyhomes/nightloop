import CoreLocation
import Foundation
import SwiftUI
import UIKit

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

    static func visibleMarkers(from venues: [VenueItem], selectedVenueID: String?, limit: Int = 72) -> [VenueMapMarker] {
        let sorted = venues.sorted { lhs, rhs in
            if lhs.id == selectedVenueID { return true }
            if rhs.id == selectedVenueID { return false }
            if lhs.pulse.score == rhs.pulse.score {
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            return lhs.pulse.score > rhs.pulse.score
        }
        return markers(from: Array(sorted.prefix(limit)))
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

enum MapMarkerShape: Equatable {
    case filledBloom
    case hollowRing
    case dashedRing
    case outline
}

enum MapMarkerColorRole: Equatable {
    case energy
    case purple
    case amber
    case gray
}

struct MapMarkerVisuals: Equatable {
    let haloSize: CGFloat
    let middleSize: CGFloat
    let dotSize: CGFloat
    let haloOpacity: Double
    let middleOpacity: Double
    let glowRadius: CGFloat
    let shape: MapMarkerShape
    let colorRole: MapMarkerColorRole

    static func style(score: Int, isSelected: Bool) -> MapMarkerVisuals {
        if isSelected {
            return MapMarkerVisuals(
                haloSize: 54,
                middleSize: 34,
                dotSize: 16,
                haloOpacity: 0.24,
                middleOpacity: 0.24,
                glowRadius: 18,
                shape: .filledBloom,
                colorRole: .energy
            )
        }

        if score >= 67 {
            return MapMarkerVisuals(
                haloSize: 40,
                middleSize: 25,
                dotSize: 12,
                haloOpacity: 0.18,
                middleOpacity: 0.22,
                glowRadius: 13,
                shape: .filledBloom,
                colorRole: .energy
            )
        }

        if score >= 34 {
            return MapMarkerVisuals(
                haloSize: 30,
                middleSize: 20,
                dotSize: 9,
                haloOpacity: 0.1,
                middleOpacity: 0.15,
                glowRadius: 8,
                shape: .filledBloom,
                colorRole: .energy
            )
        }

        return MapMarkerVisuals(
            haloSize: 24,
            middleSize: 16,
            dotSize: 7,
            haloOpacity: 0.07,
            middleOpacity: 0.12,
            glowRadius: 6,
            shape: .filledBloom,
            colorRole: .energy
        )
    }

    static func style(liveness: VenueLiveness?, score: Int, isSelected: Bool) -> MapMarkerVisuals {
        guard let liveness else {
            return MapMarkerVisuals(
                haloSize: isSelected ? 44 : 30,
                middleSize: 22,
                dotSize: 0,
                haloOpacity: 0,
                middleOpacity: 0,
                glowRadius: 0,
                shape: .dashedRing,
                colorRole: .amber
            )
        }

        switch liveness.state {
        case .live:
            return style(score: score, isSelected: isSelected)
        case .opensLater:
            return MapMarkerVisuals(
                haloSize: isSelected ? 48 : 34,
                middleSize: isSelected ? 30 : 22,
                dotSize: 0,
                haloOpacity: isSelected ? 0.24 : 0.18,
                middleOpacity: 0,
                glowRadius: isSelected ? 18 : 11,
                shape: .hollowRing,
                colorRole: .purple
            )
        case .closedToday:
            return MapMarkerVisuals(
                haloSize: isSelected ? 42 : 28,
                middleSize: isSelected ? 28 : 18,
                dotSize: 0,
                haloOpacity: 0,
                middleOpacity: 0,
                glowRadius: 0,
                shape: .outline,
                colorRole: .gray
            )
        case .unknown:
            return MapMarkerVisuals(
                haloSize: isSelected ? 44 : 30,
                middleSize: isSelected ? 28 : 20,
                dotSize: 0,
                haloOpacity: 0,
                middleOpacity: 0,
                glowRadius: 0,
                shape: .dashedRing,
                colorRole: .amber
            )
        }
    }
}

struct GoogleMapCamera: Equatable {
    var center: CLLocationCoordinate2D
    var zoom: Double

    static let sanFrancisco = GoogleMapCamera(
        center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
        zoom: 12.2
    )

    static func == (lhs: GoogleMapCamera, rhs: GoogleMapCamera) -> Bool {
        abs(lhs.center.latitude - rhs.center.latitude) < 0.000001 &&
            abs(lhs.center.longitude - rhs.center.longitude) < 0.000001 &&
            abs(lhs.zoom - rhs.zoom) < 0.001
    }
}

enum GoogleMapConfigState {
    static func isConfigured(apiKey: String?) -> Bool {
        guard let apiKey else { return false }
        return !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum MapChromeLayout {
    static func headerTopPadding(safeAreaTop: CGFloat) -> CGFloat {
        8
    }

    static func zoomTopPadding(safeAreaTop: CGFloat) -> CGFloat {
        max(112, safeAreaTop + 48)
    }
}

enum GoogleMapPadding {
    static func edgeInsets(bottomSheetHeight: CGFloat) -> UIEdgeInsets {
        UIEdgeInsets(top: 94, left: 10, bottom: bottomSheetHeight + 18, right: 12)
    }
}

enum SignalProximityStatus: Equatable {
    case needsLocation
    case verified
    case tooFar
}

enum SignalProximity {
    static let radiusMeters = 200.0

    static func status(userCoordinate: Coordinate?, venueCoordinate: Coordinate) -> SignalProximityStatus {
        guard let userCoordinate else {
            return .needsLocation
        }

        return distanceMeters(from: userCoordinate, to: venueCoordinate) <= radiusMeters ? .verified : .tooFar
    }

    static func distanceMeters(from origin: Coordinate, to destination: Coordinate) -> Double {
        let earthMeters = 6_371_000.0
        let dLat = radians(destination.latitude - origin.latitude)
        let dLng = radians(destination.longitude - origin.longitude)
        let a = sin(dLat / 2) * sin(dLat / 2) +
            cos(radians(origin.latitude)) * cos(radians(destination.latitude)) *
            sin(dLng / 2) * sin(dLng / 2)
        return earthMeters * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private static func radians(_ value: Double) -> Double {
        value * .pi / 180
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
            let leftAvailability = availabilityRank(for: $0)
            let rightAvailability = availabilityRank(for: $1)
            if leftAvailability != rightAvailability {
                return leftAvailability < rightAvailability
            }
            if $0.pulse.score == $1.pulse.score {
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
            return $0.pulse.score > $1.pulse.score
        }
    }

    private static func availabilityRank(for venue: VenueItem) -> Int {
        switch venue.liveness?.state {
        case .live:
            return 0
        case .opensLater:
            return 1
        case .unknown, nil:
            return 2
        case .closedToday:
            return 3
        }
    }
}

enum MapSheetDetent: String, CaseIterable, Equatable {
    case peek
    case half
    case full

    func height(for availableHeight: CGFloat) -> CGFloat {
        let safeHeight = max(availableHeight, 480)
        switch self {
        case .peek:
            return min(230, max(188, safeHeight * 0.28))
        case .half:
            return min(430, max(360, safeHeight * 0.48))
        case .full:
            return min(safeHeight - 68, max(560, safeHeight * 0.84))
        }
    }

    static func snap(to height: CGFloat, availableHeight: CGFloat) -> MapSheetDetent {
        allCases.min {
            abs($0.height(for: availableHeight) - height) < abs($1.height(for: availableHeight) - height)
        } ?? .half
    }
}

struct MapOverlayLayout {
    let sheetHeight: CGFloat

    var promptBottomPadding: CGFloat {
        sheetHeight + 14
    }

    var toastBottomPadding: CGFloat {
        sheetHeight + 18
    }

    var fabBottomPadding: CGFloat {
        max(42, sheetHeight - 34)
    }

    var signalMenuBottomPadding: CGFloat {
        sheetHeight + 34
    }
}

enum MapZoomControl {
    static let minimumZoom = 9.5
    static let maximumZoom = 16.5

    static func nextZoom(current: Double, delta: Double) -> Double {
        min(maximumZoom, max(minimumZoom, current + delta))
    }
}
