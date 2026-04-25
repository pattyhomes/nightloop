# Nightloop iOS Phase 4

Phase 4 turns the native app from a Phase 3 smoke shell into the first real
consumer UX for local/dev user testing.

## Scope

- Production-shaped Sign in with Apple and US SMS phone auth.
- Debug-only email sign-in for local testing.
- Hard-gated setup: 21+ attestation, profile setup, onboarding B.
- Polished Home, Venue Detail, Profile, Settings, and account deletion.
- No device location permission and no iOS notification permission prompt yet.
- Mapbox remains Phase 5.

## Supabase Auth Setup Gates

Before live Phase 4 user testing:

- Enable leaked password protection in Supabase Auth settings.
- Configure phone auth/SMS provider before live phone OTP testing.
- Configure Sign in with Apple in Apple Developer and Supabase before live Apple
  auth testing.

The iOS app may contain only the Supabase URL and publishable/anon key. It must
not contain service-role keys, database URLs, provider API keys, or admin
secrets.

## Security Advisor Cleanup

Nightloop v3 is backend-mediated. Supabase Auth owns identity/session, but iOS
calls Express `/api/v1` for product data. Express verifies Supabase JWTs and
enforces product authorization.

Because of that, app tables with RLS enabled and no client-facing policies are
intentional while Express owns product data access. Do not add broad
`USING (true)` policies to app, private, provider, or admin tables just to quiet
advisor warnings.

Apply the Phase 4 cleanup migration to Supabase dev after review:

```bash
psql "$DATABASE_URL" -f db/migrations/005_phase4_security_advisor_cleanup.sql
```

This migration:

- gives `public.set_updated_at` an explicit `search_path = pg_catalog`;
- enables RLS on `public.spatial_ref_sys`, revokes direct API access from
  `anon`/`authenticated`, and adds an explicit deny policy when the migration
  role owns that extension-created table;
- emits a warning instead of failing if Supabase-hosted extension ownership
  keeps `public.spatial_ref_sys` owned by `supabase_admin`. Treat that warning
  as a manual advisor follow-up, not as permission to add broad policies.

PostGIS installed in `public` should be tracked as Phase 5 database cleanup
before map-heavy work. Do not relocate an existing PostGIS install without a
verified safe path.

Do not remove unused indexes during Phase 4. There is not enough real usage
data. Track unindexed foreign keys in the DB hardening backlog unless a concrete
query or test shows a Phase 4 problem.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'generic/platform=iOS Simulator' build
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Security scan:

```bash
git ls-files | rg 'NightloopConfig.xcconfig$|\.env$'
rg -n 'SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|sb_secret|postgresql://|sk_' ios frontend backend docs --glob '!backend/.env' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE' ios/Nightloop/Nightloop
```
