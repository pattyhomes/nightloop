import SwiftUI

struct OrchidBackground: View {
    var animated: Bool = false
    var gridOpacity: Double = 0

    var body: some View {
        NightloopTheme.background
            .ignoresSafeArea()
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [
                        NightloopTheme.purple.opacity(0.28),
                        NightloopTheme.rose.opacity(0.08),
                        .clear
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 280)
                .allowsHitTesting(false)
            }
            .overlay {
                if gridOpacity > 0 {
                    NightloopGrid(opacity: gridOpacity)
                        .ignoresSafeArea()
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .topLeading) {
                if animated {
                    AuraWash()
                        .allowsHitTesting(false)
                }
            }
    }
}

struct AuraWash: View {
    var primary: Color = NightloopTheme.purple
    var secondary: Color = NightloopTheme.rose

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [primary.opacity(0.42), primary.opacity(0.12), .clear],
                center: .topLeading,
                startRadius: 20,
                endRadius: 360
            )
            .frame(width: 420, height: 420)
            .offset(x: -120, y: -120)

            RadialGradient(
                colors: [secondary.opacity(0.24), secondary.opacity(0.08), .clear],
                center: .bottomTrailing,
                startRadius: 20,
                endRadius: 340
            )
            .frame(width: 390, height: 390)
            .offset(x: 160, y: 220)
        }
        .blur(radius: 10)
    }
}

struct NightloopGrid: View {
    var opacity: Double = 0.08

    var body: some View {
        Canvas { context, size in
            let spacing: CGFloat = 40
            var path = Path()

            var x: CGFloat = 0
            while x <= size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += spacing
            }

            var y: CGFloat = 0
            while y <= size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += spacing
            }

            context.stroke(path, with: .color(.white.opacity(opacity)), lineWidth: 0.5)
        }
    }
}

struct NightloopCard<Content: View>: View {
    let content: Content
    var padding: CGFloat = 16
    var radius: CGFloat = NightloopTheme.cornerMedium
    var fill: Color = NightloopTheme.surface.opacity(0.86)

    init(
        padding: CGFloat = 16,
        radius: CGFloat = NightloopTheme.cornerMedium,
        fill: Color = NightloopTheme.surface.opacity(0.86),
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.radius = radius
        self.fill = fill
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(NightloopTheme.hairline)
            }
    }
}

struct NightloopSectionHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title.uppercased())
                .font(.caption2.weight(.black))
                .tracking(1.4)
                .foregroundStyle(NightloopTheme.inkMuted)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NightloopTheme.inkDim)
            }
        }
    }
}

struct GlassIconButton: View {
    let systemName: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)
                .frame(width: 40, height: 40)
                .background(Color.white.opacity(0.08))
                .clipShape(Circle())
                .overlay {
                    Circle().stroke(NightloopTheme.hairline)
                }
        }
        .buttonStyle(.plain)
    }
}

struct NightloopPrimaryButton: View {
    let title: String
    var systemImage: String?
    var isLoading = false
    var isEnabled = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else if let systemImage {
                    Label(title, systemImage: systemImage)
                } else {
                    Text(title)
                }
            }
            .font(.headline.weight(.black))
            .foregroundStyle(isEnabled ? .white : NightloopTheme.inkDim)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background {
                RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                    .fill(
                        isEnabled
                            ? LinearGradient(colors: [NightloopTheme.purple, NightloopTheme.rose], startPoint: .topLeading, endPoint: .bottomTrailing)
                            : LinearGradient(colors: [Color.white.opacity(0.06), Color.white.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .shadow(color: isEnabled ? NightloopTheme.purple.opacity(0.32) : .clear, radius: 22, x: 0, y: 10)
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
    }
}

struct NightloopSecondaryButton: View {
    let title: String
    var systemImage: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if let systemImage {
                    Label(title, systemImage: systemImage)
                } else {
                    Text(title)
                }
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(NightloopTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                    .stroke(NightloopTheme.hairline)
            }
        }
        .buttonStyle(.plain)
    }
}

struct StatMiniCard: View {
    let value: String
    let label: String
    var color: Color = NightloopTheme.ink

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 22, weight: .black, design: .monospaced))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .black))
                .tracking(1.1)
                .foregroundStyle(NightloopTheme.inkMuted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}

struct PulsePill: View {
    let level: Int
    let label: String
    var count: Int?

    private var pulse: PulseLevel {
        PulseLevel(rawValue: min(max(level, 1), 3)) ?? .chill
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(pulse.color)
                .frame(width: 8, height: 8)
                .shadow(color: pulse.color.opacity(0.8), radius: 8)

            Text(count.map { "\(label) · \($0)" } ?? label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(NightloopTheme.ink)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(pulse.color.opacity(0.16))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(pulse.color.opacity(0.32))
        }
    }
}

struct EnergyScorePill: View {
    let score: Int
    var showLabel = true

    private var tone: EnergyTone {
        EnergyTone.from(score: score)
    }

    var body: some View {
        HStack(spacing: 6) {
            Text("ENERGY")
                .font(.caption2.weight(.black))
                .foregroundStyle(tone.color)

            Text(showLabel ? "\(score) · \(tone.label)" : "\(score)")
                .font(.caption.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.06))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(NightloopTheme.hairline)
        }
    }
}

struct EnergyScoreBlock: View {
    let score: Int

    private var tone: EnergyTone {
        EnergyTone.from(score: score)
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("ENERGY")
                .font(.caption2.weight(.black))
                .tracking(1.5)
                .foregroundStyle(NightloopTheme.inkMuted)
            Text("\(score)")
                .font(.system(size: 46, weight: .black, design: .rounded))
                .foregroundStyle(tone.color)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(tone.label.uppercased())
                .font(.caption2.weight(.black))
                .tracking(1)
                .foregroundStyle(tone.color)
        }
    }
}

struct AvatarInitials: View {
    let initials: String
    var color: Color = NightloopTheme.purple

    var body: some View {
        Text(initials.uppercased())
            .font(.footnote.weight(.black))
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(color.gradient)
            .clipShape(Circle())
            .overlay {
                Circle().stroke(Color.white.opacity(0.14))
            }
    }
}

struct SparklinePlaceholder: View {
    var color: Color = NightloopTheme.purple

    var body: some View {
        GeometryReader { geometry in
            Path { path in
                let points: [CGFloat] = [0.68, 0.55, 0.62, 0.42, 0.46, 0.24, 0.34]
                for (index, yValue) in points.enumerated() {
                    let x = geometry.size.width * CGFloat(index) / CGFloat(points.count - 1)
                    let y = geometry.size.height * yValue
                    if index == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
        }
        .frame(height: 42)
    }
}

struct VenueFallbackArt: View {
    let title: String
    let subtitle: String
    let score: Int
    var height: CGFloat = 160
    var cornerRadius: CGFloat = NightloopTheme.cornerLarge
    var symbol: String = "sparkles"

    private var tone: EnergyTone {
        EnergyTone.from(score: score)
    }

    private var initials: String {
        let words = title
            .split(separator: " ")
            .filter { !$0.isEmpty }
        let letters = words.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "NL" : String(letters).uppercased()
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    tone.color.opacity(0.42),
                    NightloopTheme.purple.opacity(0.20),
                    Color(hex: "#12051d")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            diagonalStripes
                .opacity(0.12)

            Circle()
                .fill(tone.color.opacity(0.16))
                .frame(width: height * 0.72, height: height * 0.72)
                .blur(radius: 26)
                .offset(x: height * 0.32, y: -height * 0.28)

            Circle()
                .stroke(tone.color.opacity(0.22), lineWidth: 1)
                .frame(width: height * 0.58, height: height * 0.58)
                .offset(x: height * 0.42, y: -height * 0.35)

            HStack(alignment: .center, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.black.opacity(0.28))
                        .frame(width: min(height * 0.34, 68), height: min(height * 0.34, 68))
                    Circle()
                        .stroke(tone.color.opacity(0.6), lineWidth: 1)
                        .frame(width: min(height * 0.34, 68), height: min(height * 0.34, 68))
                    Text(initials)
                        .font(.system(size: min(height * 0.12, 24), weight: .black))
                        .foregroundStyle(NightloopTheme.ink)
                }

                Image(systemName: symbol)
                    .font(.system(size: min(height * 0.18, 34), weight: .black))
                    .foregroundStyle(tone.color.opacity(0.72))
                    .shadow(color: tone.color.opacity(0.55), radius: 18)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, height > 80 ? 18 : 6)
            .opacity(height > 80 ? 1 : 0.9)

            VStack(alignment: .leading, spacing: 5) {
                Text(subtitle.uppercased())
                    .font(.caption2.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(NightloopTheme.inkMuted)
                Text(title)
                    .font(.headline.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .padding(14)
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }

    private var diagonalStripes: some View {
        Canvas { context, size in
            var path = Path()
            let stripeWidth: CGFloat = 8
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += stripeWidth * 2
            }
            context.stroke(path, with: .color(.white), lineWidth: stripeWidth)
        }
    }
}

struct LoadingStateView: View {
    let title: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(NightloopTheme.purple)
            Text(title)
                .font(.callout.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

struct SignalToast: View {
    let message: String
    var isError = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(isError ? NightloopTheme.amber : NightloopTheme.good)
                .frame(width: 7, height: 7)
            Text(message)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color(hex: "#1a1611"))
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(.white)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.28), radius: 18, x: 0, y: 8)
    }
}

struct ErrorStateView: View {
    let title: String
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 12) {
                Label(title, systemImage: "exclamationmark.triangle.fill")
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.amber)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(NightloopTheme.inkMuted)

                if let retry {
                    Button("Try again", action: retry)
                        .buttonStyle(.borderedProminent)
                        .tint(NightloopTheme.purple)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct EmptyStateView: View {
    let title: String
    let message: String

    var body: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(NightloopTheme.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(NightloopTheme.inkMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct SignalButton: View {
    let title: String
    let systemImage: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(.borderedProminent)
        .tint(NightloopTheme.fab)
    }
}

struct NightloopBottomTabBar: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        HStack(alignment: .top) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    if tab == .decision {
                        DecisionHubButton(isSelected: selectedTab == tab)
                    } else {
                        VStack(spacing: 4) {
                            Image(systemName: tab.symbol)
                                .font(.system(size: 19, weight: .semibold))
                            Text(tab.title)
                                .font(.system(size: 10, weight: selectedTab == tab ? .bold : .medium))
                        }
                        .foregroundStyle(selectedTab == tab ? NightloopTheme.ink : NightloopTheme.inkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 3)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 16)
        .background(.ultraThinMaterial.opacity(0.86))
        .background(NightloopTheme.background.opacity(0.94))
        .overlay(alignment: .top) {
            Rectangle()
                .fill(NightloopTheme.hairline)
                .frame(height: 1)
        }
    }
}

private struct DecisionHubButton: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient.nightloopBrand)
                .frame(width: 54, height: 54)
                .shadow(color: NightloopTheme.purple.opacity(isSelected ? 0.62 : 0.38), radius: 18, x: 0, y: 8)
            Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity)
        .offset(y: -22)
    }
}
