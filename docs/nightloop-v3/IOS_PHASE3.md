# Nightloop iOS Phase 3

Phase 3 creates the native SwiftUI foundation in `ios/Nightloop`.

## Tooling

- Xcode: `26.4.1`
- XcodeGen: `2.45.4`
- Minimum iOS target: `17.0`
- Bundle ID: `com.nightloop.app`
- Project generator: XcodeGen

## Local Config

Copy the example config:

```bash
cp ios/Nightloop/Config/NightloopConfig.xcconfig.example ios/Nightloop/Config/NightloopConfig.xcconfig
```

Then set:

```xcconfig
API_BASE_URL = http:/$()/127.0.0.1:4000/api/v1
SUPABASE_URL = https:/$()/vvpfgxpxsxuhgbqeosqg.supabase.co
SUPABASE_PUBLISHABLE_KEY = paste_publishable_or_anon_key_here
```

`NightloopConfig.xcconfig` is ignored by git. It may contain only public/client-safe values.

Never place these in iOS:
- Supabase service-role keys;
- database URLs;
- Google Places keys;
- Foursquare keys;
- provider/admin secrets.

## Generate And Build

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'generic/platform=iOS Simulator' build
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 16' test
```

If the exact simulator name is unavailable, use an installed iPhone simulator from:

```bash
xcrun simctl list devices available
```

## Runtime Shape

The app starts with debug email sign-in for local smoke testing. Production Apple and phone auth are Phase 4.

After sign-in:
- `/api/v1/me` creates/loads the app user;
- users must complete 21+ attestation before venue screens;
- Home loads `/api/v1/markets` then `/api/v1/venues`;
- Venue Detail loads `/api/v1/venues/:id`;
- signal buttons post to `/api/v1/signals`;
- Profile shows current `/me` state and local sign-out.

## Focused Phase 3 Security Check

Phase 3 security expectations:
- iOS has no service-role, DB, Google, Foursquare, or admin secrets.
- bearer tokens are attached only as `Authorization: Bearer ...` and are not logged.
- local config is ignored by git.
- debug ATS local networking is in the Debug plist only.
- Release plist does not include the local networking exception.
- iOS reads app data through Express `/api/v1`, not direct Supabase table access.
- iOS does not reference `/api/v1/admin` or provider import endpoints.

Recommended local scan:

```bash
git ls-files | rg 'NightloopConfig.xcconfig$|\.env$'
rg -n 'SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|sb_secret|postgresql://|sk_' ios frontend backend docs --glob '!backend/.env' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```

The docs may mention placeholder secret names; no real secret values should appear.

## Deferred Work

Phase 4:
- production Apple and phone auth UI;
- onboarding B;
- full Home, Venue Detail, Profile, and Settings polish.

Phase 5:
- Mapbox/MapLibre;
- Midnight Orchid production map style;
- pulse marker bloom and map filters.

Phase 6:
- friends, invites, QR/contact matching, block/report, notifications.

Phase 7:
- group decision sessions and realtime voting.

Phase 8 remains the full security hardening gate.
