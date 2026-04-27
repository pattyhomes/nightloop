import CoreLocation
import MapboxMaps
import SwiftUI

struct MapShellView: View {
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let me: MeResponse
    let onAccountChanged: (MeResponse) -> Void

    @StateObject private var locationManager = NightloopLocationManager()
    @AppStorage("nightloop.map.locationPromptSeen") private var locationPromptSeen = false

    @State private var marketConfig: MarketConfigResponse?
    @State private var venues: [VenueItem] = []
    @State private var counts: VenueCounts?
    @State private var selectedPulse: MapPulseFilter = .all
    @State private var selectedVenueID: String?
    @State private var viewport: Viewport = .camera(center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194), zoom: 12.2)
    @State private var errorMessage: String?
    @State private var signalMessage: String?
    @State private var isLoading = true
    @State private var isSubmittingSignal = false
    @State private var isSignalMenuOpen = false
    @State private var sheetDetent: MapSheetDetent = .half
    @State private var sheetDragTranslation: CGFloat = 0
    @State private var currentMapCenter = CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
    @State private var currentMapZoom = 12.2
    @State private var didLoad = false

    private var selectedVenue: VenueItem? {
        venues.first { $0.id == selectedVenueID } ?? venues.first
    }

    private var markers: [VenueMapMarker] {
        VenueMapMarker.markers(from: venues)
    }

    private var rankedVenues: [VenueItem] {
        MapVenueFilter.rankedVenues(from: venues)
    }

    private var mapStyle: MapStyle {
        let configuredURI = MapStyleResolver.preferredURI(
            configured: authStore.config.mapboxStyleURI,
            market: marketConfig?.market.mapboxStyleUri
        )
        if let configuredURI, let uri = StyleURI(rawValue: configuredURI) {
            return MapStyle(uri: uri)
        }
        return .dark
    }

    var body: some View {
        ZStack {
            if authStore.config.isMapboxConfigured {
                mapContent
            } else {
                MissingMapboxConfigView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            guard !didLoad else { return }
            didLoad = true
            await load()
        }
        .onChange(of: selectedPulse) { _, _ in
            Task { await load() }
        }
        .onChange(of: locationManager.userCoordinate) { _, coordinate in
            guard coordinate != nil else { return }
            Task { await load() }
        }
    }

    private var mapContent: some View {
        GeometryReader { proxy in
            let sheetHeight = interactiveSheetHeight(for: proxy.size.height)
            let overlayLayout = MapOverlayLayout(sheetHeight: sheetHeight)

            ZStack(alignment: .bottom) {
                mapView(ornamentBottomMargin: overlayLayout.ornamentBottomMargin)
                    .ignoresSafeArea()

                VStack(spacing: 12) {
                    mapHeader
                    filterStrip
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, MapChromeLayout.headerTopPadding(safeAreaTop: proxy.safeAreaInsets.top))

                zoomControls
                    .padding(.top, MapChromeLayout.zoomTopPadding(safeAreaTop: proxy.safeAreaInsets.top))
                    .padding(.trailing, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)

                if shouldShowLocationPrompt {
                    LocationPromptCard(
                        isDenied: locationManager.isDenied,
                        errorMessage: locationManager.locationError,
                        share: {
                            locationPromptSeen = true
                            locationManager.requestLocationAccess()
                        },
                        dismiss: {
                            locationPromptSeen = true
                        }
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, overlayLayout.promptBottomPadding)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                if let errorMessage {
                    ErrorToast(message: errorMessage) {
                        Task { await load() }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, overlayLayout.toastBottomPadding)
                }

                if let signalMessage {
                    SignalToast(message: signalMessage)
                        .padding(.bottom, overlayLayout.toastBottomPadding)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                mapBottomSheet(height: sheetHeight, availableHeight: proxy.size.height)

                signalFAB
                    .padding(.trailing, 20)
                    .padding(.bottom, overlayLayout.fabBottomPadding)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                if isSignalMenuOpen {
                    signalMenu
                        .padding(.trailing, 20)
                        .padding(.bottom, overlayLayout.signalMenuBottomPadding)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .background(NightloopTheme.background)
        }
    }

    private func mapView(ornamentBottomMargin: CGFloat) -> some View {
        Map(viewport: $viewport) {
            ForEvery(markers) { marker in
                MapViewAnnotation(coordinate: marker.coordinate) {
                    MapPulseMarker(
                        marker: marker,
                        isSelected: marker.id == selectedVenueID
                    ) {
                        select(marker.venue)
                    }
                }
                .allowOverlap(true)
                .allowZElevate(true)
            }
        }
        .mapStyle(mapStyle)
        .ornamentOptions(NightloopMapOrnaments.options(bottomMargin: ornamentBottomMargin))
        .onStyleLoaded { _ in
            // Style loaded. Nonfatal tile/glyph/sprite events should not force
            // Nightloop away from the configured Studio style.
        }
        .onCameraChanged { event in
            rememberCameraState(event.cameraState)
        }
        .overlay {
            LinearGradient(
                colors: [NightloopTheme.background.opacity(0.22), .clear, NightloopTheme.background.opacity(0.56)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
        }
    }

    private var zoomControls: some View {
        VStack(spacing: 8) {
            Button {
                adjustZoom(by: 0.8)
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .black))
                    .frame(width: 34, height: 34)
            }
            .accessibilityLabel("Zoom in")

            Button {
                adjustZoom(by: -0.8)
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 13, weight: .black))
                    .frame(width: 34, height: 34)
            }
            .accessibilityLabel("Zoom out")
        }
        .foregroundStyle(NightloopTheme.ink)
        .background(NightloopTheme.surface.opacity(0.78))
        .clipShape(Capsule())
        .overlay {
            Capsule().stroke(NightloopTheme.hairline)
        }
        .shadow(color: .black.opacity(0.3), radius: 14, x: 0, y: 8)
    }

    private var mapHeader: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(NightloopTheme.good)
                .frame(width: 8, height: 8)
                .shadow(color: NightloopTheme.good.opacity(0.8), radius: 8)
            Text("Tonight · \(marketConfig?.market.displayName ?? me.profile?.selectedMarketId.map { _ in "San Francisco" } ?? "San Francisco")")
                .font(.footnote.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(NightloopTheme.surface.opacity(0.82))
        .clipShape(Capsule())
        .overlay { Capsule().stroke(NightloopTheme.hairline) }
    }

    private var filterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MapPulseFilter.allCases) { filter in
                    MapFilterPill(
                        title: filter.label,
                        count: filter.count(from: counts),
                        color: filter.color,
                        isSelected: selectedPulse == filter
                    ) {
                        selectedPulse = filter
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func mapBottomSheet(height: CGFloat, availableHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.white.opacity(0.22))
                .frame(width: 42, height: 4)
                .padding(.top, 9)
                .padding(.bottom, sheetDetent == .peek ? 8 : 12)

            if isLoading && venues.isEmpty {
                LoadingStateView(title: "Loading the map")
                    .frame(maxWidth: .infinity, minHeight: max(130, height - 42))
            } else if venues.isEmpty {
                EmptyMapState(retry: { Task { await load() } })
                    .frame(maxWidth: .infinity, minHeight: max(130, height - 42))
            } else {
                if let selectedVenue {
                    SelectedVenueMapCard(
                        venue: selectedVenue,
                        apiClient: apiClient,
                        authStore: authStore,
                        onAccountChanged: onAccountChanged,
                        isSubmittingSignal: isSubmittingSignal,
                        isCompact: sheetDetent == .peek,
                        submitPacked: {
                            Task { await submitSignal(kind: .packed) }
                        }
                    )
                    .padding(.horizontal, 18)
                }

                HStack {
                    NightloopSectionHeader(title: "Ranked · Tonight", trailing: "\(rankedVenues.count) venues")
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)

                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(Array(rankedVenues.prefix(sheetVenueLimit))) { venue in
                            MapRankedVenueRow(
                                venue: venue,
                                isSelected: venue.id == selectedVenueID
                            ) {
                                select(venue)
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                }
                .frame(maxHeight: listMaxHeight(for: height))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(
            LinearGradient(
                colors: [NightloopTheme.surface.opacity(0.98), NightloopTheme.background],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
        .shadow(color: .black.opacity(0.38), radius: 24, x: 0, y: -8)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    sheetDragTranslation = value.translation.height
                }
                .onEnded { value in
                    let proposedHeight = height - value.predictedEndTranslation.height
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                        sheetDetent = MapSheetDetent.snap(to: proposedHeight, availableHeight: availableHeight)
                        sheetDragTranslation = 0
                    }
                }
        )
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: sheetDetent)
    }

    private var signalFAB: some View {
        Button {
            guard selectedVenue != nil else { return }
            guard canSignalSelectedVenue else {
                verifySelectedVenueForSignal()
                return
            }
            withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                isSignalMenuOpen.toggle()
            }
        } label: {
            Image(systemName: isSignalMenuOpen ? "xmark" : "plus")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(NightloopTheme.fab)
                .clipShape(Circle())
                .shadow(color: NightloopTheme.fabGlow, radius: 26, x: 0, y: 10)
                .overlay {
                    Circle()
                        .stroke(NightloopTheme.fab.opacity(0.28), lineWidth: 8)
                }
        }
        .buttonStyle(.plain)
        .disabled(selectedVenue == nil)
        .opacity(selectedVenue == nil ? 0.5 : 1)
        .accessibilityLabel("Report a signal for the selected venue")
    }

    private var signalMenu: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Report selected venue")
                .font(.caption2.weight(.black))
                .tracking(1.2)
                .foregroundStyle(NightloopTheme.inkMuted)
                .padding(.horizontal, 10)
                .padding(.top, 8)

            ForEach(SignalKind.allCases) { kind in
                Button {
                    Task { await submitSignal(kind: kind) }
                } label: {
                    HStack {
                        Image(systemName: kind.symbol)
                            .frame(width: 22)
                        Text(kind.label)
                            .font(.footnote.weight(.bold))
                        Spacer()
                        Text("+\(points(for: kind))")
                            .font(.caption.weight(.black))
                            .foregroundStyle(NightloopTheme.good)
                    }
                    .foregroundStyle(NightloopTheme.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 9)
                    .background(Color.white.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isSubmittingSignal || !canSignalSelectedVenue)
            }
        }
        .padding(8)
        .frame(width: 230)
        .background(NightloopTheme.surface.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
        .shadow(color: .black.opacity(0.34), radius: 20, x: 0, y: 10)
    }

    private var shouldShowLocationPrompt: Bool {
        !locationPromptSeen && locationManager.userCoordinate == nil && !locationManager.isDenied && !isLoading
    }

    private var sheetVenueLimit: Int {
        switch sheetDetent {
        case .peek: return 2
        case .half: return 20
        case .full: return 60
        }
    }

    private func interactiveSheetHeight(for availableHeight: CGFloat) -> CGFloat {
        let baseHeight = sheetDetent.height(for: availableHeight)
        let draggedHeight = baseHeight - sheetDragTranslation
        let minHeight = MapSheetDetent.peek.height(for: availableHeight)
        let maxHeight = MapSheetDetent.full.height(for: availableHeight)
        return min(maxHeight, max(minHeight, draggedHeight))
    }

    private func listMaxHeight(for sheetHeight: CGFloat) -> CGFloat {
        switch sheetDetent {
        case .peek:
            return max(64, sheetHeight - 164)
        case .half:
            return max(150, sheetHeight - 202)
        case .full:
            return max(280, sheetHeight - 218)
        }
    }

    private func load() async {
        guard authStore.config.isMapboxConfigured else {
            isLoading = false
            return
        }
        guard let token = authStore.accessToken else {
            errorMessage = "Your session is missing."
            isLoading = false
            return
        }
        guard let marketID = me.profile?.selectedMarketId else {
            errorMessage = "No selected market found."
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            async let configTask = apiClient.marketConfig(id: marketID)
            async let venuesTask = apiClient.venues(
                marketID: marketID,
                bearerToken: token,
                limit: 100,
                pulse: selectedPulse.apiValue,
                userCoordinate: locationManager.userCoordinate
            )

            let (config, response) = try await (configTask, venuesTask)
            marketConfig = config
            counts = response.counts
            venues = response.items
            selectedVenueID = MapVenueFilter.selectedVenueID(current: selectedVenueID, venues: response.items)
            updateViewport(for: selectedVenue ?? response.items.first, market: config.market)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func select(_ venue: VenueItem) {
        selectedVenueID = venue.id
        updateViewport(for: venue, market: marketConfig?.market)
    }

    private func updateViewport(for venue: VenueItem?, market: Market?) {
        let center: CLLocationCoordinate2D
        let zoom: Double
        if let venue {
            center = CLLocationCoordinate2D(
                latitude: venue.coordinate.latitude,
                longitude: venue.coordinate.longitude
            )
            zoom = max(market?.defaultZoom ?? 12.8, 13.4)
        } else if let market {
            center = CLLocationCoordinate2D(
                latitude: market.center.latitude,
                longitude: market.center.longitude
            )
            zoom = market.defaultZoom ?? 12.2
        } else {
            return
        }

        withAnimation(.easeInOut(duration: 0.25)) {
            currentMapCenter = center
            currentMapZoom = zoom
            viewport = .camera(center: center, zoom: zoom)
        }
    }

    private func rememberCameraState(_ cameraState: CameraState) {
        let center = cameraState.center
        let zoom = cameraState.zoom
        guard abs(zoom - currentMapZoom) > 0.05 ||
            abs(center.latitude - currentMapCenter.latitude) > 0.0005 ||
            abs(center.longitude - currentMapCenter.longitude) > 0.0005 else {
            return
        }

        currentMapCenter = center
        currentMapZoom = zoom
    }

    private func adjustZoom(by delta: Double) {
        let nextZoom = MapZoomControl.nextZoom(current: currentMapZoom, delta: delta)
        currentMapZoom = nextZoom
        withAnimation(.easeInOut(duration: 0.2)) {
            viewport = .camera(center: currentMapCenter, zoom: nextZoom)
        }
    }

    private func submitSignal(kind: SignalKind) async {
        guard let selectedVenue, let token = authStore.accessToken else { return }
        guard !isSubmittingSignal else { return }
        guard let userCoordinate = locationManager.userCoordinate else {
            verifySelectedVenueForSignal()
            return
        }
        guard SignalProximity.status(
            userCoordinate: userCoordinate,
            venueCoordinate: selectedVenue.coordinate
        ) == .verified else {
            signalMessage = "Signals unlock when you're at the venue."
            isSignalMenuOpen = false
            return
        }

        isSubmittingSignal = true
        do {
            let result = try await apiClient.submitSignal(
                venueID: selectedVenue.id,
                kind: kind,
                bearerToken: token,
                userCoordinate: userCoordinate
            )
            signalMessage = "Signal sent · +\(result.pointsAwarded) pts"
            isSignalMenuOpen = false
            await load()
            if let updatedMe = try? await apiClient.me(bearerToken: token) {
                onAccountChanged(updatedMe)
            }
        } catch {
            signalMessage = error.localizedDescription
        }
        isSubmittingSignal = false

        Task {
            try? await Task.sleep(nanoseconds: 1_900_000_000)
            await MainActor.run {
                signalMessage = nil
            }
        }
    }

    private func points(for kind: SignalKind) -> Int {
        switch kind {
        case .packed: return 3
        case .shortLine, .longLine: return 2
        case .dead: return 1
        case .eventLive: return 4
        }
    }

    private var canSignalSelectedVenue: Bool {
        guard let selectedVenue else { return false }
        return SignalProximity.status(
            userCoordinate: locationManager.userCoordinate,
            venueCoordinate: selectedVenue.coordinate
        ) == .verified
    }

    private func verifySelectedVenueForSignal() {
        guard let selectedVenue else { return }
        switch SignalProximity.status(userCoordinate: locationManager.userCoordinate, venueCoordinate: selectedVenue.coordinate) {
        case .needsLocation:
            signalMessage = "Share location to verify you're at \(selectedVenue.name)."
            locationPromptSeen = true
            locationManager.requestLocationAccess()
        case .tooFar:
            signalMessage = "Signals unlock when you're at the venue."
            isSignalMenuOpen = false
        case .verified:
            break
        }
    }
}

private struct MapPulseMarker: View {
    let marker: VenueMapMarker
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            let visuals = MapMarkerVisuals.style(score: marker.score, isSelected: isSelected)
            ZStack {
                Circle()
                    .fill(marker.tone.color.opacity(visuals.haloOpacity))
                    .frame(width: visuals.haloSize, height: visuals.haloSize)
                    .blur(radius: 1)
                Circle()
                    .fill(marker.tone.color.opacity(visuals.middleOpacity))
                    .frame(width: visuals.middleSize, height: visuals.middleSize)
                Circle()
                    .fill(marker.tone.color)
                    .frame(width: visuals.dotSize, height: visuals.dotSize)
                    .overlay {
                        Circle().stroke(.white.opacity(0.85), lineWidth: isSelected ? 2 : 1.2)
                    }
                    .shadow(color: marker.tone.color.opacity(0.85), radius: visuals.glowRadius)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(marker.venue.name), \(marker.venue.pulse.label)")
    }
}

private struct MapFilterPill: View {
    let title: String
    let count: Int
    let color: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if title != "All" {
                    Circle()
                        .fill(color)
                        .frame(width: 7, height: 7)
                }
                Text(title)
                Text("\(count)")
                    .opacity(0.55)
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(isSelected ? Color(hex: "#1a1611") : NightloopTheme.ink)
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(isSelected ? .white : NightloopTheme.surface.opacity(0.82))
            .clipShape(Capsule())
            .overlay {
                Capsule().stroke(isSelected ? .white.opacity(0.8) : NightloopTheme.hairline)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct SelectedVenueMapCard: View {
    let venue: VenueItem
    let apiClient: NightloopAPIClient
    @ObservedObject var authStore: AuthStore
    let onAccountChanged: (MeResponse) -> Void
    let isSubmittingSignal: Bool
    let isCompact: Bool
    let submitPacked: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: isCompact ? 7 : 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(EnergyTone.from(score: venue.pulse.score).color)
                    .frame(width: 7, height: 7)
                    .shadow(color: EnergyTone.from(score: venue.pulse.score).color.opacity(0.8), radius: 8)
                Text("\(venue.pulse.label) · \(venue.trend)")
                    .font(.caption2.weight(.black))
                    .tracking(1.4)
                    .foregroundStyle(EnergyTone.from(score: venue.pulse.score).color)
                Text("·")
                    .foregroundStyle(NightloopTheme.inkDim)
                Text("\(venue.signalCount) signals tonight")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(NightloopTheme.inkMuted)
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(venue.name)
                        .font(.system(size: isCompact ? 22 : 26, weight: .black))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                    Text("\(venue.neighborhood) · \(venue.category.replacingOccurrences(of: "_", with: " "))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                }
                Spacer()
                EnergyScorePill(score: venue.pulse.score)
            }

            if !isCompact {
                HStack(spacing: 7) {
                    MapFactPill(systemName: "clock.fill", text: venue.waitMinutes.map { "\($0)m wait" } ?? "line unknown")
                    if let distance = venue.distanceMiles {
                        MapFactPill(systemName: "location.fill", text: String(format: "%.1f mi", distance))
                    }
                    if venue.event != nil {
                        MapFactPill(systemName: "music.note", text: "event")
                    }
                }

                HStack(spacing: 10) {
                    NavigationLink {
                        VenueDetailView(
                            apiClient: apiClient,
                            authStore: authStore,
                            venueID: venue.id,
                            initialVenue: venue,
                            onAccountChanged: onAccountChanged
                        )
                    } label: {
                        Text("Details")
                            .font(.subheadline.weight(.black))
                            .foregroundStyle(NightloopTheme.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    Button(action: submitPacked) {
                        Label("Packed", systemImage: "flame.fill")
                            .font(.subheadline.weight(.black))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(NightloopTheme.fab)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSubmittingSignal)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

private struct MapFactPill: View {
    let systemName: String
    let text: String

    var body: some View {
        Label(text, systemImage: systemName)
            .font(.caption.weight(.bold))
            .foregroundStyle(NightloopTheme.inkMuted)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Color.white.opacity(0.055))
            .clipShape(Capsule())
    }
}

private struct MapRankedVenueRow: View {
    let venue: VenueItem
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Circle()
                    .fill(EnergyTone.from(score: venue.pulse.score).color)
                    .frame(width: 8, height: 8)
                    .shadow(color: EnergyTone.from(score: venue.pulse.score).color.opacity(0.75), radius: 8)

                VStack(alignment: .leading, spacing: 2) {
                    Text(venue.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NightloopTheme.ink)
                        .lineLimit(1)
                    Text("\(venue.neighborhood) · \(venue.waitMinutes.map { "\($0)m wait" } ?? "line unknown")")
                        .font(.caption)
                        .foregroundStyle(NightloopTheme.inkMuted)
                        .lineLimit(1)
                }

                Spacer()
                SparklinePlaceholder(color: EnergyTone.from(score: venue.pulse.score).color)
                    .frame(width: 56, height: 20)
                Text("\(venue.signalCount)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.ink)
                    .frame(minWidth: 26, alignment: .trailing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(isSelected ? NightloopTheme.purple.opacity(0.15) : Color.white.opacity(0.035))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isSelected ? NightloopTheme.purpleEdge : .clear)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct MissingMapboxConfigView: View {
    var body: some View {
        ZStack {
            OrchidBackground(animated: true, gridOpacity: 0.045)
            NightloopCard {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Mapbox setup needed", systemImage: "map.fill")
                        .font(.title3.weight(.black))
                        .foregroundStyle(NightloopTheme.ink)
                    Text("Add `MAPBOX_ACCESS_TOKEN` and `MAPBOX_STYLE_URI` to the ignored iOS config file to turn on the live map.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkMuted)
                    Text("No backend, Google, Foursquare, or Supabase service secrets belong in the iOS app.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NightloopTheme.inkDim)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
        }
    }
}

private struct LocationPromptCard: View {
    let isDenied: Bool
    let errorMessage: String?
    let share: () -> Void
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "location.fill")
                    .font(.caption.weight(.black))
                    .foregroundStyle(NightloopTheme.good)
                    .frame(width: 22, height: 22)
                    .background(NightloopTheme.good.opacity(0.12))
                    .clipShape(Circle())
                Text("Sort by nearby")
                    .font(.caption.weight(.black))
                    .tracking(0.4)
                    .foregroundStyle(NightloopTheme.ink)
                Spacer()
            }

            Text(errorMessage ?? "Use location while the app is open. Precise location is only sent for this venue search and is not stored.")
                .font(.caption2.weight(.semibold))
                .lineSpacing(2)
                .foregroundStyle(NightloopTheme.inkMuted)

            HStack(spacing: 8) {
                Button("Not now", action: dismiss)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NightloopTheme.inkMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                Button(isDenied ? "Unavailable" : "Share") {
                    share()
                }
                .font(.caption.weight(.black))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(isDenied ? Color.white.opacity(0.08) : NightloopTheme.purple)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                .disabled(isDenied)
            }
        }
        .padding(12)
        .background(NightloopTheme.surface.opacity(0.94))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
        .shadow(color: .black.opacity(0.28), radius: 18, x: 0, y: 8)
    }
}

private struct EmptyMapState: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "map")
                .font(.title2.weight(.black))
                .foregroundStyle(NightloopTheme.inkMuted)
            Text("No venues for this filter yet.")
                .font(.headline.weight(.bold))
                .foregroundStyle(NightloopTheme.ink)
            Button("Try again", action: retry)
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
        }
    }
}

private struct ErrorToast: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(NightloopTheme.amber)
            Text(message)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NightloopTheme.ink)
                .lineLimit(2)
            Spacer()
            Button("Retry", action: retry)
                .font(.caption.weight(.black))
                .foregroundStyle(NightloopTheme.purple)
        }
        .padding(12)
        .background(NightloopTheme.surface.opacity(0.96))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(NightloopTheme.hairline)
        }
    }
}
