import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home
    case map
    case decision
    case friends
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .map: return "Map"
        case .decision: return "Decision"
        case .friends: return "Friends"
        case .profile: return "Profile"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "flame.fill"
        case .map: return "map.fill"
        case .decision: return "point.3.connected.trianglepath.dotted"
        case .friends: return "person.2.fill"
        case .profile: return "person.crop.circle.fill"
        }
    }
}
