import Foundation
import GoogleMaps

enum NightloopGoogleMapStyle {
    static let resourceName = "nightloop-google-map-style"
    static let resourceExtension = "json"

    static func isBundled(bundle: Bundle = .main) -> Bool {
        bundle.url(forResource: resourceName, withExtension: resourceExtension) != nil
    }

    static func jsonString(bundle: Bundle = .main) throws -> String {
        guard let url = bundle.url(forResource: resourceName, withExtension: resourceExtension) else {
            throw GoogleMapStyleError.missingResource
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    static func makeStyle(bundle: Bundle = .main) throws -> GMSMapStyle {
        try GMSMapStyle(jsonString: jsonString(bundle: bundle))
    }
}

enum GoogleMapStyleSource {
    static func shouldUseCloudMapID(localStyleIsBundled: Bool, configuredMapID: String?) -> Bool {
        guard !localStyleIsBundled else { return false }
        return configuredMapID?.isEmpty == false
    }
}

enum GoogleMapStyleError: LocalizedError, Equatable {
    case missingResource

    var errorDescription: String? {
        switch self {
        case .missingResource:
            return "Nightloop Google map style resource is missing."
        }
    }
}
