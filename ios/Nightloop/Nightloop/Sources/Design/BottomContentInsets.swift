import CoreGraphics

enum BottomContentInsets {
    static let defaultTabBarHeight: CGFloat = 82
    static let breathingRoom: CGFloat = 24
    static let compactBreathingRoom: CGFloat = 14

    static func scrollBottomPadding(
        tabBarHeight: CGFloat = defaultTabBarHeight,
        safeAreaBottom: CGFloat = 0
    ) -> CGFloat {
        tabBarHeight + safeAreaBottom + breathingRoom
    }

    static func floatingBottomPadding(
        above sheetHeight: CGFloat,
        spacing: CGFloat = compactBreathingRoom
    ) -> CGFloat {
        sheetHeight + spacing
    }
}
