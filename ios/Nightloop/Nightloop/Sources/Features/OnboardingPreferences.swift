import SwiftUI

struct PreferenceOption: Identifiable, Equatable {
    let id: String
    let emoji: String
    let label: String
}

struct PreferenceCategory: Identifiable {
    let id: String
    let backendKey: String
    let stepLabel: String
    let prompt: String
    let title: String
    let summaryTitle: String
    let tone: Color
    let options: [PreferenceOption]
}

enum OnboardingPreferences {
    static let minimumPicks = 3

    static let categories: [PreferenceCategory] = [
        PreferenceCategory(
            id: "vibe",
            backendKey: "vibe",
            stepLabel: "01",
            prompt: "The room itself",
            title: "Pick your poison.",
            summaryTitle: "Vibe",
            tone: NightloopTheme.purple,
            options: [
                PreferenceOption(id: "dance", emoji: "💃", label: "Pack the dance floor"),
                PreferenceOption(id: "speak", emoji: "🥃", label: "Speakeasy hush"),
                PreferenceOption(id: "divey", emoji: "🍺", label: "Divey & unpretentious"),
                PreferenceOption(id: "polish", emoji: "✨", label: "Polished & dressy"),
                PreferenceOption(id: "patio", emoji: "🌿", label: "Patio nights"),
                PreferenceOption(id: "afterhours", emoji: "🌙", label: "After-hours, late late"),
                PreferenceOption(id: "live", emoji: "🎸", label: "Live music energy"),
                PreferenceOption(id: "queer", emoji: "🌈", label: "Queer-forward"),
                PreferenceOption(id: "cozy", emoji: "🕯️", label: "Cozy corners"),
                PreferenceOption(id: "wild", emoji: "🔥", label: "A little unhinged"),
                PreferenceOption(id: "sceney", emoji: "📸", label: "See & be seen"),
                PreferenceOption(id: "chill", emoji: "☕", label: "Actually can hear you")
            ]
        ),
        PreferenceCategory(
            id: "music",
            backendKey: "music",
            stepLabel: "02",
            prompt: "On the speakers",
            title: "What should be playing when you walk in?",
            summaryTitle: "Soundtrack",
            tone: NightloopTheme.rose,
            options: [
                PreferenceOption(id: "house", emoji: "🏠", label: "House"),
                PreferenceOption(id: "techno", emoji: "⚙️", label: "Techno"),
                PreferenceOption(id: "hiphop", emoji: "🎤", label: "Hip hop"),
                PreferenceOption(id: "rnb", emoji: "💜", label: "R&B / soul"),
                PreferenceOption(id: "pop", emoji: "💖", label: "Pop / Top 40"),
                PreferenceOption(id: "indie", emoji: "🎸", label: "Indie / alt"),
                PreferenceOption(id: "latin", emoji: "🌶️", label: "Latin / reggaetón"),
                PreferenceOption(id: "afro", emoji: "🥁", label: "Afro-house"),
                PreferenceOption(id: "bass", emoji: "🔊", label: "Bass / DnB"),
                PreferenceOption(id: "80s", emoji: "📻", label: "80s / throwback"),
                PreferenceOption(id: "goth", emoji: "🖤", label: "Goth / industrial"),
                PreferenceOption(id: "jazz", emoji: "🎷", label: "Jazz / lounge"),
                PreferenceOption(id: "jukebox", emoji: "🎶", label: "Jukebox / whatever"),
                PreferenceOption(id: "dj", emoji: "🎧", label: "Live DJs")
            ]
        ),
        PreferenceCategory(
            id: "crowd",
            backendKey: "crowd",
            stepLabel: "03",
            prompt: "Who's in the room",
            title: "The crowd you want to be around.",
            summaryTitle: "Crowd",
            tone: NightloopTheme.amber,
            options: [
                PreferenceOption(id: "college", emoji: "🎓", label: "College crowd"),
                PreferenceOption(id: "twenties", emoji: "🕺", label: "Twenties"),
                PreferenceOption(id: "thirties", emoji: "🍸", label: "Thirties+"),
                PreferenceOption(id: "mixed", emoji: "🫂", label: "All ages mixed"),
                PreferenceOption(id: "queer", emoji: "🏳️‍🌈", label: "Queer"),
                PreferenceOption(id: "tourist", emoji: "🧳", label: "Tourist-heavy OK"),
                PreferenceOption(id: "locals", emoji: "🏠", label: "Locals-only feel"),
                PreferenceOption(id: "industry", emoji: "🎬", label: "Industry / artsy"),
                PreferenceOption(id: "tech", emoji: "💻", label: "Tech-ish"),
                PreferenceOption(id: "chill", emoji: "😌", label: "Low-ego"),
                PreferenceOption(id: "dressy", emoji: "👗", label: "Dressed up"),
                PreferenceOption(id: "casual", emoji: "👕", label: "T-shirts fine")
            ]
        ),
        PreferenceCategory(
            id: "hood",
            backendKey: "neighborhoods",
            stepLabel: "04",
            prompt: "Home turf",
            title: "Where are you willing to go tonight?",
            summaryTitle: "Turf",
            tone: NightloopTheme.cool,
            options: [
                PreferenceOption(id: "soma", emoji: "🏙️", label: "SoMa"),
                PreferenceOption(id: "mission", emoji: "🌮", label: "Mission"),
                PreferenceOption(id: "castro", emoji: "🏳️‍🌈", label: "Castro"),
                PreferenceOption(id: "marina", emoji: "⛵", label: "Marina"),
                PreferenceOption(id: "northbeach", emoji: "🍝", label: "North Beach"),
                PreferenceOption(id: "dogpatch", emoji: "🏭", label: "Dogpatch"),
                PreferenceOption(id: "haight", emoji: "🌻", label: "Haight"),
                PreferenceOption(id: "tenderloin", emoji: "🎭", label: "Tenderloin"),
                PreferenceOption(id: "fidi", emoji: "🏢", label: "FiDi"),
                PreferenceOption(id: "polk", emoji: "🎱", label: "Polk"),
                PreferenceOption(id: "inner-sun", emoji: "🌁", label: "Inner Sunset"),
                PreferenceOption(id: "hayes", emoji: "🥂", label: "Hayes Valley")
            ]
        )
    ]

    static func emptySelections() -> [String: [String]] {
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, []) })
    }

    static func backendPayload(from selections: [String: [String]]) -> [String: [String]] {
        Dictionary(
            uniqueKeysWithValues: categories.map { category in
                (category.backendKey, selections[category.id] ?? [])
            }
        )
    }

    static func uiSelections(from backendPreferences: [String: [String]]) -> [String: [String]] {
        Dictionary(
            uniqueKeysWithValues: categories.map { category in
                (category.id, backendPreferences[category.backendKey] ?? [])
            }
        )
    }
}
