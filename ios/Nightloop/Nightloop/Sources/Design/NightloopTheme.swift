import SwiftUI

enum NightloopTheme {
    static let background = Color(hex: "#0b0616")
    static let surface = Color(hex: "#140b24")
    static let surfaceElevated = Color(hex: "#1c1030")
    static let hairline = Color.white.opacity(0.08)
    static let hairlineSoft = Color.white.opacity(0.04)
    static let ink = Color.white
    static let inkMuted = Color.white.opacity(0.60)
    static let inkDim = Color.white.opacity(0.38)

    static let purple = Color(hex: "#a855f7")
    static let purpleDeep = Color(hex: "#7c3aed")
    static let purpleSoft = Color(hex: "#a855f7").opacity(0.15)
    static let purpleEdge = Color(hex: "#a855f7").opacity(0.35)

    static let rose = Color(hex: "#f43f5e")
    static let roseSoft = Color(hex: "#f43f5e").opacity(0.15)
    static let amber = Color(hex: "#f59e0b")
    static let cool = Color(hex: "#3b5ff7")
    static let good = Color(hex: "#10b981")

    static let fab = Color(hex: "#ff6b2c")
    static let fabGlow = Color(hex: "#ff6b2c").opacity(0.45)

    static let cornerSmall: CGFloat = 8
    static let cornerMedium: CGFloat = 14
    static let cornerLarge: CGFloat = 22
}

enum PulseLevel: Int, CaseIterable, Codable {
    case chill = 1
    case active = 2
    case packed = 3

    var label: String {
        switch self {
        case .chill: return "Chill"
        case .active: return "Active"
        case .packed: return "Packed"
        }
    }

    var color: Color {
        switch self {
        case .chill: return NightloopTheme.cool
        case .active: return NightloopTheme.amber
        case .packed: return NightloopTheme.rose
        }
    }
}

struct EnergyTone: Equatable {
    let label: String
    let color: Color

    static func from(score: Int) -> EnergyTone {
        if score >= 75 {
            return EnergyTone(label: "Packed", color: NightloopTheme.rose)
        }

        if score >= 50 {
            return EnergyTone(label: "Active", color: NightloopTheme.amber)
        }

        return EnergyTone(label: "Chill", color: NightloopTheme.cool)
    }
}

extension Color {
    init(hex: String, alpha: Double = 1) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)

        let red: Double
        let green: Double
        let blue: Double

        switch cleaned.count {
        case 3:
            red = Double((value >> 8) * 17) / 255
            green = Double((value >> 4 & 0xF) * 17) / 255
            blue = Double((value & 0xF) * 17) / 255
        default:
            red = Double(value >> 16 & 0xFF) / 255
            green = Double(value >> 8 & 0xFF) / 255
            blue = Double(value & 0xFF) / 255
        }

        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}

extension LinearGradient {
    static var nightloopBrand: LinearGradient {
        LinearGradient(
            colors: [NightloopTheme.purple, NightloopTheme.purpleDeep],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
