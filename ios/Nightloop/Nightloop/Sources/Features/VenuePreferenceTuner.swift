import Foundation

enum VenuePreferenceTuner {
    static func boostedItems(_ items: [VenueItem], preferences: [String: [String]]) -> [VenueItem] {
        items.sorted { first, second in
            let firstScore = first.pulse.score + boost(for: first, preferences: preferences)
            let secondScore = second.pulse.score + boost(for: second, preferences: preferences)
            if firstScore == secondScore {
                return first.name < second.name
            }
            return firstScore > secondScore
        }
    }

    static func reason(for venue: VenueItem, preferences: [String: [String]]) -> String {
        if matchesNeighborhood(venue, preferences: preferences) {
            return "Tuned to your \(venue.neighborhood) picks."
        }

        let category = normalized(venue.category)
        let vibes = Set(preferences["vibe"] ?? [])
        let music = Set(preferences["music"] ?? [])

        if category.contains("live") && (vibes.contains("live") || music.contains("indie") || music.contains("jazz")) {
            return "Tuned to your live-music picks."
        }

        if category.contains("club") && (vibes.contains("dance") || vibes.contains("wild") || music.contains("house") || music.contains("dj")) {
            return "Tuned to your dance-floor picks."
        }

        if category.contains("lounge") && (vibes.contains("speak") || vibes.contains("cozy") || music.contains("jazz")) {
            return "Tuned to your lounge-night picks."
        }

        return venue.whyShort
    }

    private static func boost(for venue: VenueItem, preferences: [String: [String]]) -> Int {
        var value = 0
        if matchesNeighborhood(venue, preferences: preferences) {
            value += 8
        }

        let category = normalized(venue.category)
        let vibes = Set(preferences["vibe"] ?? [])
        let music = Set(preferences["music"] ?? [])

        if category.contains("club") && (vibes.contains("dance") || vibes.contains("wild") || music.contains("house") || music.contains("techno") || music.contains("dj")) {
            value += 5
        }
        if category.contains("live") && (vibes.contains("live") || music.contains("indie") || music.contains("jazz")) {
            value += 5
        }
        if category.contains("lounge") && (vibes.contains("speak") || vibes.contains("cozy") || music.contains("jazz")) {
            value += 4
        }

        return value
    }

    private static func matchesNeighborhood(_ venue: VenueItem, preferences: [String: [String]]) -> Bool {
        let preferred = Set((preferences["neighborhoods"] ?? []).map(normalized))
        return preferred.contains(normalized(venue.neighborhood))
    }

    private static func normalized(_ value: String) -> String {
        value
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
    }
}
