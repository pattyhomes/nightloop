import SwiftUI

struct DetailedSignalSheet: View {
    let venue: VenueItem
    let submit: (SignalKind, SignalDetails) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var kind: SignalKind = .packed
    @State private var waitMinutes = 10.0
    @State private var coverAmount = 0.0
    @State private var crowdLevel = "active"
    @State private var vibeTags: Set<String> = []
    @State private var musicTags: Set<String> = []
    @State private var eventLive = false

    private let crowdOptions = ["empty", "chill", "active", "packed"]
    private let vibeOptions = ["dance", "queer", "cocktails", "locals", "dressy", "casual"]
    private let musicOptions = ["house", "hiphop", "techno", "latin", "live", "mixed"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    signalKindPicker
                    numericControls
                    optionGroup(title: "Crowd", options: crowdOptions, selected: Set([crowdLevel])) { option in
                        crowdLevel = option
                    }
                    tagGroup(title: "Vibe", options: vibeOptions, selected: vibeTags) { option in
                        if vibeTags.contains(option) {
                            vibeTags.remove(option)
                        } else if vibeTags.count < 8 {
                            vibeTags.insert(option)
                        }
                    }
                    tagGroup(title: "Music", options: musicOptions, selected: musicTags) { option in
                        if musicTags.contains(option) {
                            musicTags.remove(option)
                        } else if musicTags.count < 8 {
                            musicTags.insert(option)
                        }
                    }
                    Toggle("Event is live", isOn: $eventLive)
                        .font(.subheadline.weight(.bold))
                        .tint(NightloopTheme.purple)
                        .padding(12)
                        .background(Color.white.opacity(0.045))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .padding(18)
            }
            .background(NightloopTheme.background)
            .navigationTitle("More details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Send") {
                        submit(kind, details)
                    }
                    .fontWeight(.black)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(venue.name)
                .font(.title3.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
            Text("Structured reports only. No comments are collected in this phase.")
                .font(.caption.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
        }
    }

    private var signalKindPicker: some View {
        Picker("Signal", selection: $kind) {
            ForEach(SignalKind.allCases) { signal in
                Label(signal.label, systemImage: signal.symbol).tag(signal)
            }
        }
        .pickerStyle(.menu)
        .font(.subheadline.weight(.bold))
        .tint(NightloopTheme.ink)
    }

    private var numericControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Wait: \(Int(waitMinutes)) min")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Slider(value: $waitMinutes, in: 0...90, step: 5)
                    .tint(NightloopTheme.amber)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Cover: $\(Int(coverAmount))")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                Slider(value: $coverAmount, in: 0...100, step: 5)
                    .tint(NightloopTheme.purple)
            }
        }
    }

    private func optionGroup(
        title: String,
        options: [String],
        selected: Set<String>,
        select: @escaping (String) -> Void
    ) -> some View {
        tagGroup(title: title, options: options, selected: selected, select: select)
    }

    private func tagGroup(
        title: String,
        options: [String],
        selected: Set<String>,
        select: @escaping (String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.inkMuted)
            SignalDetailFlowLayout(spacing: 6) {
                ForEach(options, id: \.self) { option in
                    Button {
                        select(option)
                    } label: {
                        Text(option.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(selected.contains(option) ? .white : NightloopTheme.ink)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(selected.contains(option) ? NightloopTheme.purple : Color.white.opacity(0.055))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var details: SignalDetails {
        SignalDetails(
            waitMinutes: Int(waitMinutes),
            coverAmountDollars: Int(coverAmount),
            crowdLevel: crowdLevel,
            vibeTags: Array(vibeTags).sorted(),
            musicTags: Array(musicTags).sorted(),
            eventLive: eventLive
        )
    }
}

private struct SignalDetailFlowLayout<Content: View>: View {
    var spacing: CGFloat = 8
    @ViewBuilder var content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: spacing) { content }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: spacing)], alignment: .leading, spacing: spacing) {
                content
            }
        }
    }
}
