import SwiftUI

struct OnboardingFlowView: View {
    let displayName: String
    let initialSelections: [String: [String]]
    let isSaving: Bool
    let errorMessage: String?
    let onComplete: ([String: [String]]) -> Void

    @State private var step = 0
    @State private var selections: [String: [String]]

    init(
        displayName: String,
        initialSelections: [String: [String]],
        isSaving: Bool,
        errorMessage: String?,
        onComplete: @escaping ([String: [String]]) -> Void
    ) {
        self.displayName = displayName
        self.initialSelections = initialSelections
        self.isSaving = isSaving
        self.errorMessage = errorMessage
        self.onComplete = onComplete
        _selections = State(initialValue: initialSelections.isEmpty ? OnboardingPreferences.emptySelections() : initialSelections)
    }

    private var categories: [PreferenceCategory] {
        OnboardingPreferences.categories
    }

    private var totalPicks: Int {
        selections.values.reduce(0) { $0 + $1.count }
    }

    var body: some View {
        VStack(spacing: 0) {
            if step == 0 {
                welcome
            } else if step <= categories.count {
                preferenceScreen(categories[step - 1])
            } else {
                summary
            }
        }
        .background(OrchidBackground(animated: true, gridOpacity: 0.055))
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer()

            Text("· · · CALIBRATING")
                .font(.caption.weight(.black))
                .tracking(2)
                .foregroundStyle(NightloopTheme.purple)

            Text("Welcome,\n\(firstName).")
                .font(.system(size: 50, weight: .black, design: .rounded))
                .foregroundStyle(
                    LinearGradient(
                        colors: [NightloopTheme.ink, NightloopTheme.purple, NightloopTheme.rose],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .lineSpacing(-8)

            Text("Four questions. Sixty seconds. We tune Nightloop toward rooms you would actually stay at.")
                .font(.system(size: 16, weight: .semibold))
                .lineSpacing(5)
                .foregroundStyle(NightloopTheme.inkMuted)

            VStack(spacing: 8) {
                setupPreview("01", "Your vibe", "sparkles")
                setupPreview("02", "Your soundtrack", "headphones")
                setupPreview("03", "Your crowd", "person.2.fill")
                setupPreview("04", "Your turf", "building.2.fill")
            }

            Spacer()

            primaryButton("Tune me in", systemImage: "arrow.right") {
                step = 1
            }
        }
        .padding(24)
    }

    private func preferenceScreen(_ category: PreferenceCategory) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 12) {
                HStack {
                    Button {
                        step -= 1
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.headline)
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(NightloopTheme.ink)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())

                    Spacer()

                    Text("\(category.stepLabel) / 04")
                        .font(.caption.monospaced().weight(.black))
                        .foregroundStyle(category.tone)

                    Spacer()

                    Color.clear.frame(width: 38, height: 38)
                }

                heatBar(activeStep: step - 1, tone: category.tone)
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(category.prompt.uppercased())
                        .font(.caption.weight(.black))
                        .foregroundStyle(category.tone)

                    Text(category.title)
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundStyle(NightloopTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8)], alignment: .leading, spacing: 8) {
                        ForEach(category.options) { option in
                            GlowPreferenceButton(
                                option: option,
                                isSelected: selectedIDs(for: category).contains(option.id),
                                tone: category.tone
                            ) {
                                toggle(option.id, in: category)
                            }
                        }
                    }

                    HStack(spacing: 8) {
                        Circle()
                            .fill(canContinue(category) ? NightloopTheme.good : NightloopTheme.inkDim)
                            .frame(width: 6, height: 6)
                            .shadow(color: canContinue(category) ? NightloopTheme.good.opacity(0.7) : .clear, radius: 7)
                        Text(canContinue(category)
                            ? "LOCKED IN · \(selectedIDs(for: category).count) PICKS REGISTERED"
                            : "PICK \(OnboardingPreferences.minimumPicks - selectedIDs(for: category).count) MORE TO CONTINUE · \(selectedIDs(for: category).count)/\(OnboardingPreferences.minimumPicks)"
                        )
                        .font(.caption.monospaced().weight(.bold))
                        .foregroundStyle(canContinue(category) ? NightloopTheme.good : NightloopTheme.inkMuted)
                    }
                }
                .padding(22)
            }

            bottomBar {
                step += 1
            } disabled: {
                !canContinue(category)
            }
        }
    }

    private var summary: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    PulsePill(level: 3, label: "Calibration complete")

                    Text("Your\nNightloop\nis tuned.")
                        .font(.system(size: 42, weight: .black, design: .rounded))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineSpacing(-5)

                    HStack(spacing: 8) {
                        StatBlock(value: "\(totalPicks)", label: "Total picks")
                        StatBlock(value: "\(matchedTonightCount)", label: "Matches tonight", color: NightloopTheme.rose)
                    }

                    ForEach(categories) { category in
                        SummaryPreferenceCard(
                            category: category,
                            selectedIDs: selectedIDs(for: category)
                        ) {
                            step = categories.firstIndex { $0.id == category.id }.map { $0 + 1 } ?? 1
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        NightloopSectionHeader(title: "Tonight's fit · live")
                        Text("\(matchedTonightCount) rooms going off that match your taste. Home will rank them first.")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(NightloopTheme.ink)
                            .lineSpacing(4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(
                        LinearGradient(
                            colors: [NightloopTheme.purple.opacity(0.28), NightloopTheme.rose.opacity(0.18)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                            .stroke(NightloopTheme.purpleEdge)
                    }

                    if let errorMessage {
                        ErrorStateView(title: "Onboarding save failed", message: errorMessage)
                    }
                }
                .padding(24)
                .padding(.bottom, 112)
            }

            bottomBar {
                onComplete(OnboardingPreferences.backendPayload(from: selections))
            } disabled: {
                isSaving || !allCategoriesComplete
            }
        }
    }

    private var firstName: String {
        displayName.split(separator: " ").first.map(String.init) ?? displayName
    }

    private var allCategoriesComplete: Bool {
        categories.allSatisfy { canContinue($0) }
    }

    private var matchedTonightCount: Int {
        min(9, max(3, totalPicks / 4))
    }

    private func selectedIDs(for category: PreferenceCategory) -> [String] {
        selections[category.id] ?? []
    }

    private func canContinue(_ category: PreferenceCategory) -> Bool {
        selectedIDs(for: category).count >= OnboardingPreferences.minimumPicks
    }

    private func toggle(_ id: String, in category: PreferenceCategory) {
        var selected = selectedIDs(for: category)
        if selected.contains(id) {
            selected.removeAll { $0 == id }
        } else {
            selected.append(id)
        }
        selections[category.id] = selected
    }

    private func setupPreview(_ number: String, _ title: String, _ symbol: String) -> some View {
        HStack(spacing: 14) {
            Text(number)
                .font(.caption.monospaced().weight(.black))
                .foregroundStyle(NightloopTheme.purple)
                .frame(width: 26, alignment: .leading)
            Image(systemName: symbol)
                .foregroundStyle(NightloopTheme.ink)
                .frame(width: 24)
            Text(title)
                .font(.headline)
                .foregroundStyle(NightloopTheme.ink)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(NightloopTheme.inkDim)
        }
        .padding(14)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }

    private func heatBar(activeStep: Int, tone: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("HEAT INDEX")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(NightloopTheme.inkMuted)
                Spacer()
                Text("\(totalPicks) PICKS")
                    .font(.caption2.monospaced().weight(.black))
                    .foregroundStyle(tone)
            }

            HStack(spacing: 6) {
                ForEach(0..<categories.count, id: \.self) { index in
                    Capsule()
                        .fill(index <= activeStep ? tone : NightloopTheme.hairline)
                        .frame(height: 5)
                        .shadow(color: index <= activeStep ? tone.opacity(0.45) : .clear, radius: 8)
                }
            }
        }
    }

    private func bottomBar(_ action: @escaping () -> Void, disabled: () -> Bool) -> some View {
        VStack {
            primaryButton(step > categories.count ? "Drop me in" : "Continue", systemImage: "arrow.right", action: action)
                .disabled(disabled())
                .opacity(disabled() ? 0.5 : 1)
        }
        .padding(22)
        .background(
            LinearGradient(
                colors: [NightloopTheme.background.opacity(0), NightloopTheme.background],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private func primaryButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        NightloopPrimaryButton(
            title: title,
            systemImage: systemImage,
            isLoading: isSaving && step > categories.count,
            action: action
        )
    }
}

private struct GlowPreferenceButton: View {
    let option: PreferenceOption
    let isSelected: Bool
    let tone: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(option.emoji)
                Text(option.label)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Spacer(minLength: 0)
            }
            .font(.caption.weight(isSelected ? .bold : .semibold))
            .foregroundStyle(NightloopTheme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(isSelected ? tone.opacity(0.20) : Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                    .stroke(isSelected ? tone.opacity(0.72) : NightloopTheme.hairline)
            }
            .shadow(color: isSelected ? tone.opacity(0.35) : .clear, radius: 12)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct SummaryPreferenceCard: View {
    let category: PreferenceCategory
    let selectedIDs: [String]
    let edit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(category.prompt.uppercased())
                        .font(.caption2.weight(.black))
                        .foregroundStyle(category.tone)
                    Text(category.summaryTitle)
                        .font(.title3.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                }
                Spacer()
                Button("Edit", action: edit)
                    .font(.caption.weight(.black))
                    .foregroundStyle(category.tone)
                    .buttonStyle(.plain)
            }

            FlowLayout(spacing: 6) {
                ForEach(selectedOptions) { option in
                    HStack(spacing: 5) {
                        Text(option.emoji)
                        Text(option.label)
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(category.tone.opacity(0.18))
                    .clipShape(Capsule())
                    .overlay {
                        Capsule().stroke(category.tone.opacity(0.42))
                    }
                }
            }
        }
        .padding(16)
        .background(category.tone.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(category.tone.opacity(0.35))
        }
    }

    private var selectedOptions: [PreferenceOption] {
        selectedIDs.compactMap { id in
            category.options.first { $0.id == id }
        }
    }
}

private struct StatBlock: View {
    let value: String
    let label: String
    var color: Color = NightloopTheme.ink

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title2.monospacedDigit().weight(.black))
                .foregroundStyle(color)
            Text(label.uppercased())
                .font(.caption2.weight(.black))
                .foregroundStyle(NightloopTheme.inkMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: NightloopTheme.cornerMedium, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 320
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX > 0, currentX + size.width > maxWidth {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX > bounds.minX, currentX + size.width > bounds.maxX {
                currentX = bounds.minX
                currentY += lineHeight + spacing
                lineHeight = 0
            }

            subview.place(
                at: CGPoint(x: currentX, y: currentY),
                proposal: ProposedViewSize(width: size.width, height: size.height)
            )
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
