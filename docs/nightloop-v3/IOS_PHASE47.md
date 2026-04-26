# Nightloop iOS Phase 4.7

Phase 4.7 is the final auth/setup polish pass before moving into Mapbox work.
It keeps the live auth UX honest while Apple Developer and SMS provider setup
are still pending.

## Changes

- Apple and phone auth now use explicit local readiness flags instead of trying
  unavailable providers and surfacing confusing runtime failures.
- Debug account tools are tucked into a small DEBUG-only developer testing chip
  instead of being a floating primary control.
- Phone test helper remains DEBUG-only and only enables autofill when phone auth
  is explicitly marked ready in local config.
- Profile setup copy now uses the same direct Nightloop typography language as
  the rest of the setup flow.

## Local iOS Config

`ios/Nightloop/Config/NightloopConfig.xcconfig` remains ignored. Use:

```xcconfig
AUTH_APPLE_ENABLED = NO
AUTH_PHONE_ENABLED = NO
```

Turn `AUTH_APPLE_ENABLED` to `YES` only after:

- Apple Developer membership is active;
- the bundle ID and Sign in with Apple capability are configured;
- Supabase Auth has the Apple provider configured;
- at least one simulator/device Apple auth smoke test passes.

Turn `AUTH_PHONE_ENABLED` to `YES` only after:

- Supabase Phone provider is enabled;
- a real SMS provider such as Twilio Verify is configured;
- rate limits and abuse controls are reviewed;
- test numbers or a controlled dev phone have been validated.

Do not commit real phone numbers, OTPs, Twilio secrets, Supabase service-role
keys, database URLs, Google keys, Foursquare keys, or admin tokens.

## Testing Notes

- With both flags off, the auth screen should show setup-pending states for
  Apple and SMS while still allowing DEBUG developer testing.
- With `AUTH_PHONE_ENABLED = YES` and DEBUG test values set, the phone helper may
  fill the configured test phone/code into the visible phone form.
- Release builds include the readiness flags but do not include the DEBUG phone
  test values or developer account tools.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
cd ios/Nightloop
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -configuration Release -destination 'generic/platform=iOS Simulator' build
```

Security scan:

```bash
git ls-files | rg 'NightloopConfig.xcconfig$|\.env$'
git ls-files -z | xargs -0 rg -n 'sb_secret_|sb_publishable_[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|fsq_[0-9A-Za-z_-]{20,}|postgresql://[^\s]+' --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```
