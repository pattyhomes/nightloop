import SwiftUI

struct OrchidBackground: View {
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
    }
}

struct NightloopCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(NightloopTheme.surface.opacity(0.86))
            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
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
