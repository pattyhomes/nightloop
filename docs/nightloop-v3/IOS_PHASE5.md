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
neighborhood readability for Nightloop's own labels and markers to dominate.

## Behavior

- The map uses the configured Midnight Orchid Mapbox Studio style.
- The app falls back to Mapbox Dark only when no valid configured Studio URI is
  available. Nonfatal tile, glyph, sprite, or transient load errors must not
  silently replace the configured style.
- The map sheet has three snap points: peek for mostly full-screen map, half for
  the default selected-venue browse state, and full for list-focused browsing.
- Compact `+ / -` zoom controls are visible for simulator testing and
  accessibility. Reevaluate whether they stay visible, become accessibility-only,
  or move behind debug tooling before TestFlight/App Store hardening.
- Venue coordinates, counts, pulse state, images, and signal submission still
  come from the backend.
- If Mapbox config is missing, the app shows a setup card instead of creating a
  broken map view.
- Location is optional. The map asks contextually, sends `lat/lng` only on the
  venue list request after permission, and does not store precise coordinates.
- The Friends filter stays hidden until Phase 6 provides real friend presence.
- The orange FAB reports a signal for the selected venue only.

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

## Deferred

PostGIS-in-public cleanup remains a database hardening follow-up. Do not relocate
PostGIS during this phase without a separately verified migration path.
