# Nightloop iOS Phase 5

Phase 5 replaces the placeholder Map tab with a Google Maps powered venue map
while keeping Express `/api/v1` as the app data boundary. Google Maps is now the
production path because Nightloop uses Google Places as a venue verification
layer and Google Places content should be treated as Google Maps Platform
content when rendered on a map.

## Local Google Maps Setup

`ios/Nightloop/Config/NightloopConfig.xcconfig` remains ignored. Add:

```xcconfig
GOOGLE_MAPS_IOS_API_KEY = paste_google_maps_ios_key_here
GOOGLE_MAP_ID = paste_google_cloud_map_id_here
```

Use an iOS-restricted Google Maps SDK key for the native app. Do not put the
backend Google Places server key, Foursquare key, Supabase service-role key, DB
URL, or any provider/admin secret in the iOS project.

The Google Map ID should point to a Cloud-styled dark map that approximates
Midnight Orchid: subdued base geography, minimal road/POI noise, and enough
neighborhood readability for Nightloop markers to dominate. Nightloop-specific
energy, glow, signal, sheet, and filter visuals stay in SwiftUI/UIKit overlay
code, not in the Google base map.

## Behavior

- The map uses Google Maps SDK for iOS with the configured API key and optional
  Map ID.
- If Google Maps config is missing, the app shows a setup card instead of
  creating a broken map view.
- The map sheet has three snap points: peek for mostly full-screen map, half for
  the default selected-venue browse state, and full for list-focused browsing.
- Google owns geographic labels and legal attribution/logo treatment. iOS does
  not draw duplicate neighborhood capsules on top of the basemap.
- Google Maps legal UI must remain visible and must not be hidden, cropped, or
  obscured by Nightloop controls.
- Follow-up: review venue geographic coverage and marker distribution. Current
  SF nightlife venues naturally cluster in the northeastern/central nightlife
  corridors, but testing showed the map can feel too concentrated in one area.
  Before App Store polish, audit missing notable venues in the Richmond,
  Sunset, Haight, Marina, Bayview, Excelsior, and other outlying nightlife
  pockets, then decide whether this is a data coverage issue, a filter/ranking
  issue, or a marker decluttering/zoom-framing issue.
- The map header and pulse filters are SwiftUI chrome, not map SDK ornaments.
  They should sit just inside the app's safe area and must not double-add the
  status/Dynamic Island inset.
- Compact `+ / -` zoom controls are visible for simulator testing and
  accessibility. Reevaluate whether they stay visible, become accessibility-only,
  or move behind debug tooling before TestFlight/App Store hardening.
- Venue coordinates, counts, pulse state, images, and signal submission still
  come from the backend.
- Location is optional for browsing. The map asks contextually, sends `lat/lng`
  only on the venue list request after permission, and does not store precise
  coordinates.
- Location verification is required for live user signals. iOS sends precise
  coordinates only for the one `/api/v1/signals` verification request; the
  backend checks a 200m venue radius and stores only verification metadata, not
  raw user coordinates.
- The Friends filter stays hidden until Phase 6 provides real friend presence.
- The orange FAB reports a signal for the selected venue only after location
  verification succeeds.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -configuration Release -destination 'generic/platform=iOS Simulator' build
```

Security scan:

```bash
git ls-files | rg 'NightloopConfig.xcconfig$|\.env$|netrc'
rg -n 'MAPBOX_SECRET|DOWNLOADS:READ|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|sb_secret|postgresql://' ios frontend backend docs --glob '!backend/.env' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```

Provider provenance audit:

```bash
npm --prefix backend run audit:venue-provenance
```

## Deferred

PostGIS-in-public cleanup remains a database hardening follow-up. Do not relocate
PostGIS during this phase without a separately verified migration path.
