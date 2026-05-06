import SwiftUI

extension VenueLiveness {
    var badgeTitle: String {
        switch state {
        case .live:
            return "Live now"
        case .opensLater:
            return opensAt.map { "Opens \($0)" } ?? "Opens later"
        case .closedToday:
            return "Closed today"
        case .unknown:
            if sourceOpenNow == true && hoursState == .sourceVerified {
                return "Open now"
            }
            return hoursState == .sourceVerified ? "Tonight preview" : "Hours unknown"
        }
    }

    var supportingText: String {
        copy?.supportingText ?? {
            switch state {
            case .live:
                return "\(liveSignalCount) verified reports from \(liveUniqueUserCount) people."
            case .opensLater:
                return "Source-backed hours are available for tonight."
            case .closedToday:
                return "Source-backed hours say it is not available tonight."
            case .unknown:
                if sourceOpenNow == true && hoursState == .sourceVerified {
                    return "Source-backed hours say it is open, but live crowd claims need more verified reports."
                }
                return "Nightloop will not infer live status without verified hours and enough recent reports."
            }
        }()
    }

    var provenanceText: String {
        copy?.provenance ?? {
            switch hoursState {
            case .sourceVerified:
                return "Source-backed hours"
            case .manualHold:
                return "Hours under ops review"
            case .temporaryClosed:
                return "Temporary closure source-backed"
            case .unknown:
                return "Hours not verified"
            }
        }()
    }
}

enum LivenessTone {
    static func color(for state: VenueLivenessState?) -> Color {
        switch state {
        case .live:
            return NightloopTheme.rose
        case .opensLater:
            return NightloopTheme.purple
        case .closedToday:
            return NightloopTheme.inkDim
        case .unknown, nil:
            return NightloopTheme.amber
        }
    }
}

struct LivenessChip: View {
    let liveness: VenueLiveness?
    var compact = false

    var body: some View {
        let state = liveness?.state ?? .unknown
        let color = LivenessTone.color(for: state)
        HStack(spacing: 6) {
            marker(state: state, color: color)
            Text(liveness?.badgeTitle ?? "Hours unknown")
                .font(.caption2.weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundStyle(state == .closedToday ? NightloopTheme.inkMuted : NightloopTheme.ink)
        .padding(.horizontal, compact ? 8 : 10)
        .padding(.vertical, compact ? 5 : 6)
        .background(color.opacity(state == .closedToday ? 0.08 : 0.16))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(color.opacity(state == .closedToday ? 0.28 : 0.55))
        }
    }

    @ViewBuilder
    private func marker(state: VenueLivenessState, color: Color) -> some View {
        switch state {
        case .live:
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
                .shadow(color: color.opacity(0.85), radius: 7)
        case .opensLater:
            Circle()
                .stroke(color, lineWidth: 1.8)
                .frame(width: 8, height: 8)
        case .closedToday:
            Circle()
                .stroke(color.opacity(0.75), lineWidth: 1.4)
                .frame(width: 8, height: 8)
        case .unknown:
            Circle()
                .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                .foregroundStyle(color)
                .frame(width: 8, height: 8)
        }
    }
}

struct ConfidencePips: View {
    let confidence: RecommendationConfidence?

    private var filledCount: Int {
        switch confidence {
        case .high:
            return 3
        case .medium:
            return 2
        case .low, nil:
            return 1
        }
    }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { index in
                Capsule()
                    .fill(index < filledCount ? NightloopTheme.good : Color.white.opacity(0.12))
                    .frame(width: 11, height: 4)
            }
        }
        .accessibilityLabel("\(confidence?.rawValue ?? "low") confidence")
    }
}

struct HoursStatusBlock: View {
    let venue: VenueItem

    private var liveness: VenueLiveness {
        venue.liveness ?? VenueLiveness(
            state: .unknown,
            hoursState: venue.hours?.hoursState ?? .unknown,
            confidence: .low,
            opensAt: venue.hours?.opensAt,
            closesAt: venue.hours?.closesAt,
            sourceOpenNow: false,
            expectedPulseLevel: venue.pulse.level,
            liveSignalCount: venue.recentSignalCount,
            liveUniqueUserCount: 0,
            copy: nil,
            provenance: nil
        )
    }

    var body: some View {
        NightloopCard(fill: Color.white.opacity(0.04)) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 8) {
                    LivenessChip(liveness: liveness)
                    ConfidencePips(confidence: liveness.confidence)
                    Spacer()
                }

                Text(liveness.supportingText)
                    .font(.caption.weight(.semibold))
                    .lineSpacing(2)
                    .foregroundStyle(NightloopTheme.inkMuted)

                if liveness.state != .unknown || liveness.hoursState == .sourceVerified {
                    HStack(spacing: 8) {
                        if let opensAt = liveness.opensAt {
                            Label(opensAt, systemImage: "door.left.hand.open")
                        }
                        if let closesAt = liveness.closesAt {
                            Label(closesAt, systemImage: "moon.fill")
                        }
                    }
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                }

                Text(liveness.provenanceText)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(NightloopTheme.inkDim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
