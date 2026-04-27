import CoreLocation
import Foundation
import MapboxMaps
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

struct MapMarkerVisuals: Equatable {
    let haloSize: CGFloat
    let middleSize: CGFloat
    let dotSize: CGFloat
    let haloOpacity: Double
    let middleOpacity: Double
    let glowRadius: CGFloat

    static func style(score: Int, isSelected: Bool) -> MapMarkerVisuals {
        if isSelected {
            return MapMarkerVisuals(
                haloSize: 54,
                middleSize: 34,
                dotSize: 16,
                haloOpacity: 0.24,
                middleOpacity: 0.24,
                glowRadius: 18
            )
        }

        if score >= 67 {
            return MapMarkerVisuals(
                haloSize: 40,
                middleSize: 25,
                dotSize: 12,
                haloOpacity: 0.18,
                middleOpacity: 0.22,
                glowRadius: 13
            )
        }

        if score >= 34 {
            return MapMarkerVisuals(
                haloSize: 30,
                middleSize: 20,
                dotSize: 9,
                haloOpacity: 0.1,
                middleOpacity: 0.15,
                glowRadius: 8
            )
        }

        return MapMarkerVisuals(
            haloSize: 24,
            middleSize: 16,
            dotSize: 7,
            haloOpacity: 0.07,
            middleOpacity: 0.12,
            glowRadius: 6
        )
    }
}

enum NightloopMapOrnaments {
    static var options: OrnamentOptions {
        options(bottomMargin: 98)
    }

    static func options(bottomMargin: CGFloat) -> OrnamentOptions {
        OrnamentOptions(
            scaleBar: ScaleBarViewOptions(visibility: .hidden),
            compass: CompassViewOptions(visibility: .adaptive),
            logo: LogoViewOptions(position: .bottomLeading, margins: CGPoint(x: 10, y: bottomMargin)),
            attributionButton: AttributionButtonOptions(position: .bottomTrailing, margins: CGPoint(x: 10, y: bottomMargin))
        )
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

    var ornamentBottomMargin: CGFloat {
        sheetHeight + 12
    }
}

enum MapZoomControl {
    static let minimumZoom = 9.5
    static let maximumZoom = 16.5

    static func nextZoom(current: Double, delta: Double) -> Double {
        min(maximumZoom, max(minimumZoom, current + delta))
    }
}

enum MapStyleResolver {
    static func preferredURI(configured: String?, market: String?) -> String? {
        if let configured = usableStyleURI(configured) {
            return configured
        }
        return usableStyleURI(market)
    }

    static func shouldFallbackToDark(configured: String?, market: String?) -> Bool {
        preferredURI(configured: configured, market: market) == nil
    }

    private static func usableStyleURI(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        guard !trimmed.contains("$("), !trimmed.localizedCaseInsensitiveContains("paste_") else {
            return nil
        }
        guard trimmed.hasPrefix("mapbox://") else {
            return nil
        }
        return trimmed
    }
}
