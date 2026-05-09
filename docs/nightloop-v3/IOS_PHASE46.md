# Nightloop iOS Phase 4.6

Phase 4.6 tightens the already-wired native UX before Mapbox work starts.

## Scope

- Replace placeholder venue-photo text with a polished Nightloop fallback art
  treatment until licensed venue assets are available.
- Keep real approved `venue_assets` first when present.
- Make Home and Venue Detail feel credible without importing Google/Foursquare
  photos, ratings, reviews, hours, phone numbers, or websites.
- Add a Debug-only phone auth testing helper so simulator QA can exercise the
  production-shaped phone flow without storing real user phone data in code.

## Phone Auth Testing

Supabase phone login uses `signInWithOTP(phone:)` followed by
`verifyOTP(phone:token:type: .sms)` in the Swift SDK. Nightloop keeps that path
client-side for identity/session only; product data still goes through Express
`/api/v1`.

The app supports optional Debug-only local config values:

```xcconfig
DEBUG_PHONE_TEST_NUMBER =
DEBUG_PHONE_TEST_CODE =
```

Use these only for:

- a Supabase dashboard test number if the hosted project supports one;
- a self-hosted/local Supabase test OTP mapping;
- or one controlled development phone number during a planned live SMS smoke
  test.

Do not put a real user's phone number, OTP, Twilio credentials, or Supabase
service-role key in iOS config, docs, screenshots, or git.

## Manual Gates

Before real phone testing:

- Confirm phone auth is enabled in Supabase Auth.
- Confirm SMS provider/cost/rate-limit expectations.
- Use one controlled live SMS test before broader QA.
- Keep Debug email/dev account creation for repeated onboarding loops so SMS
  spend stays low.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
cd ios/Nightloop
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Security scan:

```bash
git ls-files | rg 'NightloopConfig.xcconfig$|\.env$'
rg -n 'SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|sb_secret|postgresql://|sk_' ios frontend backend docs --glob '!backend/.env' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```

## References

- Supabase Swift `signInWithOTP`: https://supabase.com/docs/reference/swift/auth-signinwithotp
- Supabase Swift `verifyOTP`: https://supabase.com/docs/reference/swift/auth-verifyotp
- Supabase phone login guide: https://supabase.com/docs/guides/auth/phone-login
- Supabase self-hosted test OTP mapping: https://supabase.com/docs/guides/self-hosting/self-hosted-phone-mfa
