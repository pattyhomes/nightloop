# TestFlight Readiness Runbook
Last updated: 2026-05-01

## Target
Tiny trusted external TestFlight beta for `com.nightloop.app`.

## Current Baseline
- Canonical database: the existing Supabase **Pro** project. Use this for TestFlight.
- Scratch database: `NightloopStaging`. Keep it only for rehearsal/destructive testing.
- Do not rerun migrations, seeds, or smoke resets against Pro unless a new migration or explicit data task requires it.
- Pro read-only audit on 2026-05-01:
  - Approved active SF venues: `136`.
  - Recommendation input coverage: `136/136`.
  - Fresh/unexpired schedules: `140`.
  - Future approved events: `134`.
  - Event sources: `36`, trusted: `4`.
  - Fixture rows: `0`.
  - Unknown neighborhood cleanup: `0`.
  - `phase6:readiness -- --market=san-francisco --limit=60`: passed.

## Apple Values
- Apple Team ID: `HFAR6K43RC`
- Sign in with Apple Key ID: `266WLZ656M`
- APNs Key ID: `AGDL986SYH`
- Bundle ID / APNs topic: `com.nightloop.app`

Do not commit `.p8` private keys or Apple private key contents. Store private keys only in local ignored env files and hosted backend/Supabase provider settings as needed.

## Database Policy
- `backend/.env` should point to the Pro database for TestFlight setup work.
- `backend/.env.pro` is an ignored local backup of the Pro backend env.
- If we keep NightloopStaging, store it separately as `backend/.env.staging`; do not make it the default TestFlight DB.
- Local Node `pg` scripts may need `sslmode=no-verify` in `DATABASE_URL`.
- Raw `psql` does not support `sslmode=no-verify`; translate to `sslmode=require` only for direct `psql` commands.

## Remaining Setup

### Supabase Pro
1. Confirm the Pro project URL and publishable key for iOS Release config.
2. Configure Sign in with Apple for `com.nightloop.app` using:
   - Team ID: `HFAR6K43RC`
   - Sign in with Apple Key ID: `266WLZ656M`
   - Apple private key: stored in Supabase only, not git.
3. Copy the Pro service role key into the hosted Express backend env only.
4. Create or confirm the App Review / reviewer Supabase Auth user.
5. Record only the reviewer Auth user UUID as backend env `REVIEWER_AUTH_USER_ID`.
6. Do not document the reviewer password anywhere except App Store Connect review notes.

### Hosted Express Backend
Deploy the backend to Railway or equivalent. The backend is the only server that should use DB/provider/service-role/APNs secrets.

Required backend build settings:

```bash
npm --prefix backend run build
npm --prefix backend start
```

Required hosted backend env:

```bash
NODE_ENV=production
DATABASE_URL=<Pro Supabase Postgres URL>
SUPABASE_PROJECT_URL=<Pro Supabase project URL>
SUPABASE_JWKS_URL=<Pro Supabase JWKS URL>
SUPABASE_SERVICE_ROLE_KEY=<server-side only>
NOTIFICATION_DELIVERY_MODE=apns
APNS_TEAM_ID=HFAR6K43RC
APNS_KEY_ID=AGDL986SYH
APNS_PRIVATE_KEY=<.p8 contents, server-side only>
APNS_BUNDLE_ID=com.nightloop.app
APNS_ENVIRONMENT=production
NIGHTLOOP_PRIVACY_URL=<public /privacy URL>
NIGHTLOOP_TERMS_URL=<public /terms URL>
NIGHTLOOP_SUPPORT_URL=<public /support URL>
NIGHTLOOP_DELETE_ACCOUNT_URL=<public /delete-account URL>
NIGHTLOOP_ACCESSIBILITY_URL=<public /accessibility URL>
REVIEWER_AUTH_USER_ID=<Supabase Auth UUID for reviewer>
```

Optional/if configured:

```bash
GOOGLE_PLACES_API_KEY=<backend-only>
FOURSQUARE_API_KEY=<backend-only, Pro fields only>
REVIEWER_DEMO_ENABLED=true
```

After deploy:
1. Confirm hosted `/health` returns success over HTTPS.
2. Run `npm --prefix backend run testflight:readiness` with env pointed at the hosted/production-like backend values.
3. Seed the reviewer Nightloop profile through the backend admin flow:
   - `GET /api/v1/admin/reviewer-account/status`
   - `POST /api/v1/admin/reviewer-account/seed`
   - Re-check status.

### Public Web URLs
Deploy the existing frontend app and confirm these load publicly:

- `/privacy`
- `/terms`
- `/support`
- `/delete-account`
- `/accessibility`

Set the matching `NIGHTLOOP_*_URL` env vars on the hosted backend.

### iOS Release Config
Update ignored `ios/Nightloop/Config/NightloopConfig.xcconfig` for the TestFlight build:

```bash
API_BASE_URL=<hosted Express HTTPS URL>
SUPABASE_URL=<Pro Supabase project URL>
SUPABASE_PUBLISHABLE_KEY=<Pro publishable key>
GOOGLE_MAPS_IOS_API_KEY=<iOS-restricted Maps key>
APPLE_AUTH_ENABLED=true
PHONE_AUTH_ENABLED=false
REVIEWER_DEMO_ENABLED=true
```

Keep provider/server keys out of iOS config.

### App Store Connect
- Beta description: Nightloop helps small friend groups choose where to go tonight in San Francisco using source-backed venue context, private friends activity, and Decision rooms.
- Features to test: Apple sign-in, Home recommendations, Map, Venue Detail, Friends, Decision rooms, room chat, final plan, notifications.
- Reviewer notes: normal auth is Sign in with Apple; reviewer demo access is enabled for this TestFlight build and credentials are provided in App Review notes.
- Reviewer credentials: provide the reviewer email/password only in App Store Connect review notes.
- Privacy policy URL: public `/privacy`.
- Support URL: public `/support`.
- Contact: `axelbaumcharles@gmail.com`.

## Verification
Run before upload:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run testflight:readiness
npm --prefix backend run audit:sf-trust -- --market=san-francisco --json --top=20
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -configuration Release -destination 'generic/platform=iOS Simulator' build
```

Real-device smoke list:

- Apple sign-in.
- Reviewer demo access.
- Home recommendations.
- Map.
- Venue Detail.
- Friends.
- Decision room creation/join/swipe/shortlist/final plan.
- Notification permission.
- At least one room notification delivered through APNs production/TestFlight.

## Hard Rules
- Do not include real env var values or secrets in docs, tickets, logs, screenshots, or commits.
- Do not point TestFlight at NightloopStaging unless we intentionally decide to use a scratch DB.
- Do not run destructive smoke resets against Pro without explicit approval.
- iOS uses Supabase only for Auth/session and calls Express `/api/v1` for product data.
