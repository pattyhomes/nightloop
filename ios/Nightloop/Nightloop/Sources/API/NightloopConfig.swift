import Foundation

struct NightloopConfig: Equatable {
    let apiBaseURL: URL
    let supabaseURL: URL?
    let supabasePublishableKey: String
    let appleAuthEnabled: Bool
    let phoneAuthEnabled: Bool
    let mapboxAccessToken: String?
    let mapboxStyleURI: String?
    let debugPhoneTestNumber: String?
    let debugPhoneTestCode: String?

    var isSupabaseConfigured: Bool {
        guard supabaseURL != nil else { return false }
        let trimmed = supabasePublishableKey.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && !trimmed.localizedCaseInsensitiveContains("paste_")
    }

    var isMapboxConfigured: Bool {
        mapboxAccessToken != nil && mapboxStyleURI != nil
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
        let appleAuthEnabled = Self.boolValue(info["NightloopAppleAuthEnabled"])
        let phoneAuthEnabled = Self.boolValue(info["NightloopPhoneAuthEnabled"])
        let mapboxAccessToken = Self.optionalConfigValue(info["NightloopMapboxAccessToken"])
        let mapboxStyleURI = Self.optionalConfigValue(info["NightloopMapboxStyleURI"])
        let debugPhoneTestNumber = Self.optionalDebugValue(info["NightloopDebugPhoneTestNumber"])
        let debugPhoneTestCode = Self.optionalDebugValue(info["NightloopDebugPhoneTestCode"])

        self.apiBaseURL = apiURL
        self.supabaseURL = supabaseURL
        self.supabasePublishableKey = publishableKey
        self.appleAuthEnabled = appleAuthEnabled
        self.phoneAuthEnabled = phoneAuthEnabled
        self.mapboxAccessToken = mapboxAccessToken
        self.mapboxStyleURI = mapboxStyleURI
        self.debugPhoneTestNumber = debugPhoneTestNumber
        self.debugPhoneTestCode = debugPhoneTestCode
    }

    init(
        apiBaseURL: URL,
        supabaseURL: URL?,
        supabasePublishableKey: String,
        appleAuthEnabled: Bool = false,
        phoneAuthEnabled: Bool = false,
        mapboxAccessToken: String? = nil,
        mapboxStyleURI: String? = nil,
        debugPhoneTestNumber: String? = nil,
        debugPhoneTestCode: String? = nil
    ) {
        self.apiBaseURL = apiBaseURL
        self.supabaseURL = supabaseURL
        self.supabasePublishableKey = supabasePublishableKey
        self.appleAuthEnabled = appleAuthEnabled
        self.phoneAuthEnabled = phoneAuthEnabled
        self.mapboxAccessToken = mapboxAccessToken
        self.mapboxStyleURI = mapboxStyleURI
        self.debugPhoneTestNumber = debugPhoneTestNumber
        self.debugPhoneTestCode = debugPhoneTestCode
    }

    private static func stringValue(_ value: Any?) -> String {
        (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private static func optionalDebugValue(_ value: Any?) -> String? {
        optionalConfigValue(value)
    }

    private static func optionalConfigValue(_ value: Any?) -> String? {
        let trimmed = stringValue(value)
        guard !trimmed.isEmpty else { return nil }
        guard !trimmed.contains("$("), !trimmed.localizedCaseInsensitiveContains("paste_") else {
            return nil
        }
        return trimmed
    }

    private static func boolValue(_ value: Any?) -> Bool {
        switch stringValue(value).lowercased() {
        case "yes", "true", "1", "enabled":
            return true
        default:
            return false
        }
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
