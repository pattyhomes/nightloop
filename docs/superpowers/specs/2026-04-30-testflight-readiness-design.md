# TestFlight Readiness Design

Date: 2026-04-30

## Summary

This design prepares Nightloop for a tiny trusted external TestFlight beta,
not full App Store submission. The goal is to make the app installable,
reviewable, and safe for a first group of outside testers while preserving the
current product boundary: native SwiftUI iOS, Express/Postgres backend, and
Supabase Auth for identity/session only.

The first beta will use:

- the real bundle id, `com.nightloop.app`;
- a Railway-hosted staging Express API;
- a separate staging Supabase project for Auth and Postgres;
- Apple-first release sign-in;
- a config-gated reviewer demo path with seeded social/Decision data;
- real APNs delivery through Railway backend environment variables;
- Vercel-hosted beta legal/support pages;
- no PostHog or new analytics SDKs before the first external beta.

## Product Decisions

- TestFlight target is a small external beta after internal sanity testing.
- The first tester group should be tiny and trusted, roughly 5-10 people.
- Blocker polish only is in scope. Broad Friends/Decision visual redesign is
  intentionally deferred to a separate UI pass.
- Sign in with Apple is the normal release auth path.
- The reviewer/demo path is release-safe, staging-only/config-gated, and exists
  so App Review can see seeded friends, activity, and Decision rooms without
  landing in an empty account.
- Push notifications are enabled for the first external beta because Phase 6D
  already prepared room notification infrastructure.
- APNs credentials live only in Railway backend environment variables. Supabase
  remains Auth/Postgres, not the push delivery owner.
- Legal/support pages use `axelbaumcharles@gmail.com` as the beta support
  contact. A branded domain/email can replace this later.
- Analytics are deferred. Use TestFlight feedback, Apple crash reports, server
  logs, and manual tester notes for the first beta.

## Approaches Considered

### Recommended: Staging Beta Stack

Deploy the existing Express backend to Railway, connect it to a separate
staging Supabase project, point Release iOS config at Railway, and use Vercel
for beta legal/support pages.

This keeps engineering risk low because the app continues to use the existing
backend architecture. It also keeps beta data isolated from development and any
future production environment.

### Rejected: Supabase-Only API Refactor

Moving the Express API into Supabase Edge Functions would avoid a separate API
host, but it would require a backend architecture refactor before TestFlight.
That is too much risk for a readiness pass, especially with Decision room SSE
and existing Express services already working.

### Rejected: Internal-Only TestFlight

Internal TestFlight would be faster, but it would not exercise Beta App Review,
public legal/support URLs, reviewer access, or the external-tester install path.
The user explicitly chose a small external beta.

### Rejected: Full App Store Hardening

Full App Store readiness would include a deeper accessibility pass, final
privacy labels, final legal review, app metadata polish, and broader support
processes. That remains a later hardening phase.

## Architecture

### iOS Release Configuration

Release builds must use a staging API URL, staging Supabase URL, staging
Supabase publishable key, Google Maps iOS key, Apple auth enabled, and phone
auth disabled unless it is deliberately configured later.

Release builds must not expose:

- DEBUG dev crew UI;
- local phone test helpers;
- localhost or `127.0.0.1` API URLs;
- Supabase service role keys;
- database URLs;
- Google Places server keys;
- Foursquare keys;
- APNs private keys;
- admin/provider endpoints as user-facing surfaces.

The existing Debug/Release plist split and Debug-only UI gates remain the
baseline. The readiness pass should add explicit release checks so unsafe config
fails before archive/upload.

### Railway Staging Backend

Railway runs the current backend as a normal Node service:

- build command: `npm --prefix backend run build`;
- start command: `npm --prefix backend start`;
- health check: `/health`;
- HTTPS Railway service URL used as the iOS `API_BASE_URL`.

Railway environment variables own backend secrets and production-like runtime
configuration:

- `NODE_ENV=production`;
- `DATABASE_URL`;
- Supabase project URL, issuer, JWKS URL, audience, and service role key;
- provider keys used by backend-only scripts/services;
- APNs team id, key id, private key, bundle id, environment, and delivery mode;
- CORS origins for the Vercel frontend/admin surface as needed.

Production-mode backend behavior must keep dev-only endpoints unavailable.

### Staging Supabase

Create a separate Supabase project for staging. It must be configured for:

- database migrations through the latest checked-in migration;
- Supabase Auth issuer/JWKS values used by Express JWT verification;
- Sign in with Apple provider settings for `com.nightloop.app`;
- service role key stored only in Railway/backend local env;
- publishable key and project URL stored in iOS Release config.

Staging data should be populated through curated scripts, not by copying the
current development database wholesale.

### Curated Staging Seed

The seed path should produce a credible SF beta environment:

- apply all migrations in order;
- import/refresh approved public SF venues;
- run neighborhood, hours, events, and recommendation input refreshes;
- run Phase 6 social smoke seed for demo/reviewer users;
- run social smoke audit and Phase 6 readiness audit;
- ensure fixture/test venues are not public;
- ensure unknown hours never claim open, closed, or live.

Seeded reviewer/demo data should include completed onboarding/profile state,
accepted friends, visible friend activity, at least one Decision room, and a
finalized room so App Review can see core social value quickly.

### Reviewer Demo Access

Add a release-safe demo/reviewer entry point that is available only when a
staging config flag enables it. It should not expose dev reset tools, raw seed
operations, or reusable local dev credentials.

The reviewer path should authenticate through a backend-approved staging
account flow and land in a fully seeded state. App Store Connect review notes
should explain:

- normal auth is Sign in with Apple;
- reviewer demo access is available for the review build;
- the app is 21+ nightlife discovery for SF;
- location is used while the app is open for nearby venues and signal
  verification;
- push notifications are used for private Decision room updates.

### APNs

Phase 6D already prepared APNs entitlement/config structure. TestFlight
readiness turns real APNs delivery on for staging after Apple Developer setup:

- enable Push Notifications for `com.nightloop.app`;
- create an APNs Auth Key;
- configure Railway backend env with APNs credentials;
- set backend notification delivery mode to APNs only when credentials are
  present;
- verify on a physical device if simulator delivery is insufficient.

APNs credentials must never be committed, returned by API responses, placed in
iOS config, or stored in Supabase unless a future architecture explicitly moves
push delivery there.

### Legal And Support Pages

Add beta-grade public pages to the existing Next frontend and deploy them on
Vercel:

- Privacy Policy;
- Terms;
- Support;
- Delete Account Help;
- Accessibility Support.

The pages should be concise and accurate for the first beta:

- no analytics SDKs;
- location used while the app is open;
- user content includes profiles, friend activity, room messages, signals, and
  reports;
- Supabase, Google Maps, Railway, Vercel, and Apple are relevant processors or
  platform providers;
- account deletion is available in the app;
- support contact is `axelbaumcharles@gmail.com`.

These pages are beta operational pages, not final lawyer-reviewed App Store
launch policy.

## Verification Design

Use the verification-loop structure after implementation:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Add release-specific checks:

- Release config does not point to localhost;
- Release build contains no DEBUG dev crew UI;
- production-mode backend returns 404 for dev-only endpoints;
- secret scan finds no service role, DB URL, APNs private key, provider server
  key, or Postgres URL in tracked app/frontend files;
- Vercel legal URLs load publicly;
- Railway `/health` and `/api/v1` load over HTTPS;
- real device smoke covers Apple sign-in, reviewer demo path, Home/Map, venue
  detail, location permission, Friends, Decision rooms, notification
  permission, and room notification routing.

## Manual Setup Boundaries

Chuck chose guided manual setup for Apple/account work. Codex should provide
exact fields, links, and command outputs, and should do all repo/config/test
work that does not require account ownership, 2FA, billing, or private
credential entry.

Manual or semi-manual steps expected:

- create/configure the staging Supabase project;
- create/configure the Railway project and enter backend secrets;
- enable Apple Developer capabilities and create/download APNs key;
- create App Store Connect app record and TestFlight groups;
- connect/deploy the Vercel frontend if connector permissions are insufficient.

## Acceptance Criteria

- A Release archive/build can be produced for `com.nightloop.app`.
- Release config points at Railway staging and staging Supabase.
- App Review can sign in or use reviewer demo access and see seeded social and
  Decision room content.
- Normal beta users can use Sign in with Apple.
- APNs registration and at least one Decision room notification route are
  verified on a physical device or documented as blocked by Apple/device setup.
- Public legal/support URLs exist and are usable in App Store Connect.
- Backend, frontend, iOS, social smoke, and Phase 6 readiness checks pass.
- No broad UI redesign, analytics SDK, contacts matching, public rooms, or
  production data migration is included in this readiness pass.

## Spec Self-Review

- Placeholder scan: no placeholders or TBDs remain.
- Consistency check: the design keeps Supabase as Auth/Postgres and Railway as
  Express host; APNs belongs to Railway backend env only.
- Scope check: the spec is one implementation phase focused on external
  TestFlight readiness, not full App Store hardening.
- Ambiguity check: beta target, hosting, auth, push, legal pages, telemetry,
  and manual-account boundaries are explicitly decided.
