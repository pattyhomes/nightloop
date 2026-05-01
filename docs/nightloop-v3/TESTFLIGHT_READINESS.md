# TestFlight Readiness Runbook
Last updated: 2026-05-01

This is the plain-English setup order for getting Nightloop onto TestFlight.

## The Big Picture

There are four separate places we configure things:

1. **Apple Developer**
   - Owns the iOS app identifier, Sign in with Apple key, and APNs key.
2. **Supabase Pro**
   - Owns Auth and the canonical Nightloop Postgres database.
3. **Hosted Express backend**
   - The API server iOS calls. This is likely Railway.
   - It gets secret env vars in the host dashboard. There is no repo file for this.
4. **iOS Release config**
   - The app config that points TestFlight builds at the hosted Express backend and Supabase Auth.

Do these in order. Do not jump ahead.

## Current Database Decision

- Use the existing Supabase **Pro** project as the canonical TestFlight database.
- `NightloopStaging` is scratch only. Do not point TestFlight at it unless we explicitly decide to.
- Pro audit on 2026-05-01 passed:
  - Approved active SF venues: `136`.
  - Recommendation input coverage: `136/136`.
  - Fresh/unexpired schedules: `140`.
  - Future approved events: `134`.
  - Event sources: `36`, trusted: `4`.
  - Fixtures: `0`.
  - Unknown neighborhoods: `0`.
  - Phase 6 readiness: passed.

Do not run migrations, seed scripts, or smoke resets against Pro unless there is a specific new migration/task and Chuck approves it.

## Known Apple Values

- Apple Team ID: `HFAR6K43RC`
- Sign in with Apple Key ID: `266WLZ656M`
- APNs Key ID: `AGDL986SYH`
- Bundle ID / APNs topic: `com.nightloop.app`

Never commit `.p8` files or private key contents.

## Step 1: Apple Developer

Where: Apple Developer website.

Goal: make Apple know that `com.nightloop.app` can use Sign in with Apple and Push Notifications.

Checklist:

1. In **Certificates, Identifiers & Profiles → Identifiers**, confirm App ID `com.nightloop.app` exists.
2. On that App ID, confirm **Sign in with Apple** is enabled.
3. On that App ID, confirm **Push Notifications** is enabled.
4. In **Keys**, confirm/download the APNs key with Key ID `AGDL986SYH`.
5. In **Keys**, confirm/download the Sign in with Apple key with Key ID `266WLZ656M`.

Private key handling:

- If Apple gives you a `.p8`, download it immediately.
- Apple usually only lets you download a key once.
- Keep `.p8` files out of the repo.

## Step 2: Supabase Pro Auth

Where: Supabase Dashboard for the Pro project.

Goal: make Supabase Auth accept Sign in with Apple for the Nightloop iOS app.

Configure this in Supabase, not Railway:

1. Open the Pro Supabase project.
2. Go to **Authentication → Sign In / Providers**.
3. Open **Apple**.
4. Enable Apple provider.
5. Use:
   - Team ID: `HFAR6K43RC`
   - Key ID: `266WLZ656M`
   - Bundle ID / Services ID field, if shown for iOS: `com.nightloop.app`
   - Apple private key: contents of the Sign in with Apple `.p8`
6. Save.

Exact field labels may vary in Supabase. The important point:

- **Sign in with Apple Key ID `266WLZ656M` goes in Supabase Auth provider settings.**
- It does **not** go in Railway unless we later build custom Apple auth handling.

## Step 3: Hosted Express Backend

Where: Railway or whichever host runs the backend.

Goal: deploy the Express API and give it the server-only secrets it needs.

Important: there is no "hosted Express `.env` file" inside the repo. On Railway, env vars live in the service dashboard under something like **Variables**. The local file `backend/.env.hosted.template` is only a copy/paste helper.

Railway service settings:

```bash
Root directory: backend
Build command: npm ci --include=dev && npm run build
Start command: npm start
```

Railway settings to use:

- **Public networking:** enable this so the iOS app can reach the API. Current
  Railway API base: `https://nightloop-production.up.railway.app`.
- **Public port:** `8080` for the current Railway service.
- **Regions and replicas:** one region and one replica is fine for TestFlight. Prefer
  the default free/trial-supported region. Do not pay for multi-region yet.
- **Builder:** leave the default Railway builder unless the deploy fails.
- **Metal build environment:** okay to enable. It worked for the current backend
  deploy.
- **Custom build command:** set to `npm ci --include=dev && npm run build`.
- **Watch paths:** leave blank for now.
- **Custom start command:** set to `npm start`.
- **Teardown:** leave off.
- **Cron schedule:** leave blank. We are not scheduling hosted jobs yet.
- **Healthcheck path:** `/health`; timeout `30` seconds.
- **Serverless:** leave off. The API should stay warm for auth, SSE, and normal mobile
  traffic.
- **Restart policy:** `On Failure` is fine. The default retry count is fine.
- **Railway config file / config-as-code:** leave unset for now.
- **Feature flags:** leave unchanged unless a deploy error specifically points to one.

Required Railway/backend env vars:

```bash
NODE_ENV=production
DATABASE_URL=<Pro Supabase Postgres URL>
SUPABASE_PROJECT_URL=<Pro Supabase project URL>
SUPABASE_JWT_ISSUER=<Pro Supabase project URL>/auth/v1
SUPABASE_JWKS_URL=<Pro Supabase project URL>/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=<Pro Supabase service role key>
NOTIFICATION_DELIVERY_MODE=apns
APNS_TEAM_ID=HFAR6K43RC
APNS_KEY_ID=AGDL986SYH
APNS_PRIVATE_KEY=<APNs .p8 private key contents>
APNS_BUNDLE_ID=com.nightloop.app
APNS_ENVIRONMENT=production
NIGHTLOOP_PRIVACY_URL=<public privacy URL>
NIGHTLOOP_TERMS_URL=<public terms URL>
NIGHTLOOP_SUPPORT_URL=<public support URL>
NIGHTLOOP_DELETE_ACCOUNT_URL=<public delete-account URL>
NIGHTLOOP_ACCESSIBILITY_URL=<public accessibility URL>
REVIEWER_AUTH_USER_ID=<reviewer Supabase Auth user UUID>
REVIEWER_DEMO_ENABLED=true
```

Optional backend-only env vars:

```bash
GOOGLE_PLACES_API_KEY=<backend-only Google Places key>
FOURSQUARE_API_KEY=<backend-only Foursquare key, Pro fields only>
```

Placeholder cleanup rules:

- Delete `<` and `>` after filling values.
- Delete Supabase placeholder square brackets around DB passwords.
  - Use `:password@`, not `:[password]@`.
- Do not add parentheses.
- If a value is optional and unused, remove the line instead of leaving `<PLACEHOLDER>`.
- For `DATABASE_URL`, hosted Node may need `?sslmode=no-verify`.
- For `APNS_PRIVATE_KEY`, paste the full private key. If Railway accepts multiline variables, keep it multiline. If it needs one line, replace line breaks with literal `\n`; the backend supports that.

After deploy:

1. Open the hosted backend URL.
2. Confirm `/health` returns success over HTTPS.
3. Run the backend readiness command locally with matching env values when possible:

```bash
npm --prefix backend run testflight:readiness
```

## Step 4: Public Web Pages

Where: Vercel or whatever hosts the `frontend` app.

Goal: App Store Connect and the backend need public legal/support URLs.

Current Vercel production URL:

```bash
https://getnightloop.vercel.app
```

Deploy the frontend and confirm these pages load over HTTPS:

- `https://getnightloop.vercel.app/privacy`
- `https://getnightloop.vercel.app/terms`
- `https://getnightloop.vercel.app/support`
- `https://getnightloop.vercel.app/delete-account`
- `https://getnightloop.vercel.app/accessibility`

Then paste those full URLs into the hosted backend env vars:

- `NIGHTLOOP_PRIVACY_URL=https://getnightloop.vercel.app/privacy`
- `NIGHTLOOP_TERMS_URL=https://getnightloop.vercel.app/terms`
- `NIGHTLOOP_SUPPORT_URL=https://getnightloop.vercel.app/support`
- `NIGHTLOOP_DELETE_ACCOUNT_URL=https://getnightloop.vercel.app/delete-account`
- `NIGHTLOOP_ACCESSIBILITY_URL=https://getnightloop.vercel.app/accessibility`

Also add/check these hosted backend variables during the Vercel/public setup pass:

- `REVIEWER_AUTH_USER_ID`
- `GOOGLE_PLACES_API_KEY`
- `FOURSQUARE_API_KEY`

`GOOGLE_PLACES_API_KEY` and `FOURSQUARE_API_KEY` are backend-only. They belong in
Railway if hosted enrichment/audits need them, never in iOS. Foursquare remains
optional while it is on the backburner.

## Step 5: Reviewer Account

Where: Supabase Pro Auth plus hosted Express backend.

Goal: create an App Review account and seed its Nightloop profile.

Steps:

1. In Supabase Pro, create or confirm one reviewer Auth user.
2. Copy that user's Supabase Auth UUID.
3. Put that UUID in Railway/backend env:

```bash
REVIEWER_AUTH_USER_ID=<reviewer auth UUID>
```

4. Restart/redeploy the hosted backend so it loads the env var.
5. Use the backend admin reviewer-account endpoints:
   - `GET /api/v1/admin/reviewer-account/status`
   - `POST /api/v1/admin/reviewer-account/seed`
   - `GET /api/v1/admin/reviewer-account/status` again

Only put the reviewer email/password in App Store Connect review notes. Do not commit it.

## Step 6: iOS Release Config

Where: local ignored file `ios/Nightloop/Config/NightloopConfig.xcconfig`.

Goal: make the TestFlight app talk to hosted Express and Supabase Pro Auth.

Required Release values:

```bash
API_BASE_URL=<hosted Express HTTPS URL>
SUPABASE_URL=<Pro Supabase project URL>
SUPABASE_PUBLISHABLE_KEY=<Pro Supabase publishable key>
GOOGLE_MAPS_IOS_API_KEY=<iOS-restricted Maps key>
APPLE_AUTH_ENABLED=true
PHONE_AUTH_ENABLED=false
REVIEWER_DEMO_ENABLED=true
```

Do not put these in iOS:

- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APNS_PRIVATE_KEY`
- `GOOGLE_PLACES_API_KEY`
- `FOURSQUARE_API_KEY`

## Step 7: App Store Connect

Where: App Store Connect.

Use:

- Beta description: Nightloop helps small friend groups choose where to go tonight in San Francisco using source-backed venue context, private friends activity, and Decision rooms.
- Features to test: Apple sign-in, Home recommendations, Map, Venue Detail, Friends, Decision rooms, room chat, final plan, notifications.
- Reviewer notes: normal auth is Sign in with Apple; reviewer demo access is enabled for this TestFlight build and credentials are provided in App Review notes.
- Reviewer credentials: put reviewer email/password here only.
- Privacy policy URL: public `/privacy`.
- Support URL: public `/support`.
- Contact: `axelbaumcharles@gmail.com`.

## Verification Before Upload

Run:

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

- Pro DB is canonical for TestFlight.
- NightloopStaging is scratch only.
- No destructive Pro resets without explicit approval.
- No secrets in docs, tickets, screenshots, logs, or commits.
- iOS uses Supabase only for Auth/session and calls Express `/api/v1` for product data.
