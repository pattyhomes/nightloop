import Foundation

struct NightloopConfig: Equatable {
    let apiBaseURL: URL
    let supabaseURL: URL?
    let supabasePublishableKey: String

    var isSupabaseConfigured: Bool {
        guard supabaseURL != nil else { return false }
        let trimmed = supabasePublishableKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && !trimmed.localizedCaseInsensitiveContains("paste_")
    }

    static func current(bundle: Bundle = .main) throws -> NightloopConfig {
        try NightloopConfig(info: bundle.infoDictionary ?? [:])
    }

    init(info: [String: Any]) throws {
        let apiValue = Self.stringValue(info["NightloopAPIBaseURL"])
        guard let apiURL = URL(string: apiValue), apiURL.scheme != nil, apiURL.host != nil else {
            throw ConfigError.missingAPIBaseURL
        }

        let supabaseURLValue = Self.stringValue(info["NightloopSupabaseURL"])
        let supabaseURL = URL(string: supabaseURLValue)
        let publishableKey = Self.stringValue(info["NightloopSupabasePublishableKey"])

        self.apiBaseURL = apiURL
        self.supabaseURL = supabaseURL
        self.supabasePublishableKey = publishableKey
    }

    init(apiBaseURL: URL, supabaseURL: URL?, supabasePublishableKey: String) {
        self.apiBaseURL = apiBaseURL
        self.supabaseURL = supabaseURL
        self.supabasePublishableKey = supabasePublishableKey
    }

    private static func stringValue(_ value: Any?) -> String {
        (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}

enum ConfigError: LocalizedError, Equatable {
    case missingAPIBaseURL

    var errorDescription: String? {
        switch self {
        case .missingAPIBaseURL:
            return "API_BASE_URL is missing or invalid in NightloopConfig.xcconfig."
        }
    }
}
