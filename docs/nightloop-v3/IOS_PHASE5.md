# Nightloop iOS Phase 5

Phase 5 replaces the placeholder Map tab with a Mapbox-powered venue map while
keeping Express `/api/v1` as the app data boundary.

## Local Mapbox Setup

`ios/Nightloop/Config/NightloopConfig.xcconfig` remains ignored. Add:

```xcconfig
MAPBOX_ACCESS_TOKEN = pk_your_public_runtime_token
MAPBOX_STYLE_URI = mapbox:/$()/styles/chuck18/cmofbpqpc004501qp2igmbha1
```

Use only a public runtime token in the iOS config. If Swift Package Manager needs
a Mapbox Downloads token, store that secret only in `~/.netrc`; never commit it
or paste it into `NightloopConfig.xcconfig`.

The `mapbox:/$()/styles/...` form is intentional for `.xcconfig` files. A raw
`mapbox://styles/...` value is parsed as `mapbox:` because `//` starts a comment.

The current Studio style is named `Nightloop Midnight Orchid`. It should stay a
subdued dark base map: muted streets, minimal road/POI labels, and enough
neighborhood readability for Nightloop markers to dominate.

## Behavior

- The map uses the configured Midnight Orchid Mapbox Studio style.
- The app falls back to Mapbox Dark only when no valid configured Studio URI is
  available. Nonfatal tile, glyph, sprite, or transient load errors must not
  silently replace the configured style.
- The map sheet has three snap points: peek for mostly full-screen map, half for
  the default selected-venue browse state, and full for list-focused browsing.
- The Studio style owns neighborhood/place labels; iOS does not draw duplicate
  neighborhood capsules on top of the basemap.
- The Mapbox scale bar is hidden. Logo and attribution remain visible for
  Mapbox compliance, but should sit in the least intrusive positions and never
  be mistaken for Nightloop branding.
- Location controls should not cover Mapbox legal ornaments. In Phase 5, the
  top-right location shortcut was removed because the prompt and verified-signal
  flows already request location; add a real recenter control later only if it
  has a clear camera behavior and non-overlapping placement.
- Follow-up: review venue geographic coverage and marker distribution. Current
  SF nightlife venues naturally cluster in the northeastern/central nightlife
  corridors, but testing showed the map can feel too concentrated in one area.
  Before App Store polish, audit missing notable venues in the Richmond,
  Sunset, Haight, Marina, Bayview, Excelsior, and other outlying nightlife
  pockets, then decide whether this is a data coverage issue, a filter/ranking
  issue, or a marker decluttering/zoom-framing issue.
- The map header and pulse filters are SwiftUI chrome, not Mapbox ornaments.
  They should sit just inside the app's safe area and must not double-add the
  status/Dynamic Island inset.
- Provider choice remains Mapbox for Phase 5 unless the venue provenance audit
  shows Google-derived canonical fields that make a non-Google map risky. See
  `MAP_PROVIDER_DECISION.md`.
- Compact `+ / -` zoom controls are visible for simulator testing and
  accessibility. Reevaluate whether they stay visible, become accessibility-only,
  or move behind debug tooling before TestFlight/App Store hardening.
- Venue coordinates, counts, pulse state, images, and signal submission still
  come from the backend.
- If Mapbox config is missing, the app shows a setup card instead of creating a
  broken map view.
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
rg -n 'MAPBOX_SECRET|sk\\.|DOWNLOADS:READ|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|sb_secret|postgresql://' ios frontend backend docs --glob '!backend/.env' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```

Provider provenance audit:

```bash
npm --prefix backend run audit:venue-provenance
```

## Deferred

PostGIS-in-public cleanup remains a database hardening follow-up. Do not relocate
PostGIS during this phase without a separately verified migration path.
