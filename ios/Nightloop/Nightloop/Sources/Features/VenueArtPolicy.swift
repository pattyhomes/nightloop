import Foundation

enum VenueArtPlacement: Equatable {
    case row
    case card
    case hero
    case detail
    case decision
    case friends
}

struct VenueArtPresentation: Equatable {
    let shouldShowCredit: Bool
    let shouldPreferFallback: Bool
}

enum VenueArtPolicy {
    static func presentation(
        placement: VenueArtPlacement,
        asset: VenueAsset?
    ) -> VenueArtPresentation {
        let hasURL = asset?.url?.isEmpty == false
        let hasCredit = asset?.creditText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        let showCredit: Bool

        switch placement {
        case .hero, .detail:
            showCredit = hasCredit
        case .row, .card, .decision, .friends:
            showCredit = false
        }

        return VenueArtPresentation(
            shouldShowCredit: showCredit,
            shouldPreferFallback: !hasURL
        )
    }
}
