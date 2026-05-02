import Foundation

enum VenuePrimaryAction: Equatable {
    case signal(title: String)
    case going(title: String)
    case unavailable(message: String)
}

enum VenueActionPolicy {
    static let offHoursSignalCopy = "Live signals open when the venue opens tonight."

    static func primaryAction(for venue: VenueItem, isTonightPreview: Bool) -> VenuePrimaryAction {
        if venue.liveness?.state == .live {
            return .signal(title: "Report live signal")
        }

        if isTonightPreview {
            return .going(title: "I'm going")
        }

        return .unavailable(message: offHoursSignalCopy)
    }

    static func allowsLiveSignal(for venue: VenueItem) -> Bool {
        venue.liveness?.state == .live
    }
}
