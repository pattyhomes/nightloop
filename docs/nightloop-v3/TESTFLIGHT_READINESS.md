# TestFlight Readiness Runbook
Last updated: 2026-04-30

## Target
Tiny trusted external TestFlight beta for `com.nightloop.app`.

## Manual Account Setup

### Apple Developer
1. Open Certificates, Identifiers & Profiles.
2. Select or create App ID `com.nightloop.app`.
3. Enable Sign in with Apple.
4. Enable Push Notifications.
5. Create an APNs Auth Key.
6. Record Team ID, Key ID, and download the private key once.

### Supabase Staging
1. Create a separate staging Supabase project.
2. Apply migrations `db/migrations/*.sql` in order.
3. Configure Sign in with Apple for bundle id `com.nightloop.app`.
4. Copy project URL, JWKS URL, issuer URL, publishable key, and service role key.
5. Store service role only in Railway/backend env.

### Railway
1. Create a Railway service from this repo.
2. Build command: `npm --prefix backend run build`.
3. Start command: `npm --prefix backend start`.
4. Set `NODE_ENV=production`.
5. Set Supabase, DB, provider, and APNs env vars.
6. Set `NOTIFICATION_DELIVERY_MODE=apns` only after APNs credentials are present.
7. Confirm `/health` returns success over HTTPS.

### Vercel
1. Deploy the existing `frontend` app.
2. Confirm these public URLs load:
   - `/privacy`
   - `/terms`
   - `/support`
   - `/delete-account`
   - `/accessibility`

## Staging Seed
Apply the current migrations in order against the staging database:

```bash
psql "$DATABASE_URL" -f db/migrations/001_venue_enrichments.sql
psql "$DATABASE_URL" -f db/migrations/002_phase1_backend_foundation.sql
psql "$DATABASE_URL" -f db/migrations/003_phase2_data_ops.sql
psql "$DATABASE_URL" -f db/migrations/004_phase2b_google_places.sql
psql "$DATABASE_URL" -f db/migrations/005_phase4_security_advisor_cleanup.sql
psql "$DATABASE_URL" -f db/migrations/006_phase55_56_data_recommendations.sql
psql "$DATABASE_URL" -f db/migrations/007_phase58_sf_venue_trust.sql
psql "$DATABASE_URL" -f db/migrations/008_phase58a_hours_trust.sql
psql "$DATABASE_URL" -f db/migrations/009_phase6a_social_beta.sql
psql "$DATABASE_URL" -f db/migrations/010_phase6b_decision_sessions.sql
psql "$DATABASE_URL" -f db/migrations/011_phase6c_group_pick_rooms.sql
psql "$DATABASE_URL" -f db/migrations/012_phase6c1_social_design_realignment.sql
psql "$DATABASE_URL" -f db/migrations/013_phase6d_room_live_foundation.sql
npm --prefix backend run import:sf-notable
npm --prefix backend run neighborhoods:sf -- --apply --market=san-francisco
npm --prefix backend run recommendations:refresh-inputs -- --market=san-francisco
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
```

## App Store Connect Test Info
- Beta description: Nightloop helps small friend groups choose where to go tonight in San Francisco using source-backed venue context, private friends activity, and Decision rooms.
- Features to test: Apple sign-in, Home recommendations, Map, Venue Detail, Friends, Decision rooms, room chat, final plan, notifications.
- Reviewer notes: normal auth is Sign in with Apple; reviewer demo access is enabled for this TestFlight build and credentials are provided in App Review notes.
- Privacy policy URL: Vercel `/privacy`.
- Support URL: Vercel `/support`.
- Contact: `axelbaumcharles@gmail.com`.

## Verification
Run the local readiness checks:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run testflight:readiness
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Real-device smoke list:

- Apple sign-in.
- Reviewer demo access.
- Home.
- Map.
- Venue Detail.
- Friends.
- Decision.
- Notification permission.
- At least one room notification.

Do not include real env var values or secrets in docs, tickets, logs, or commits.
