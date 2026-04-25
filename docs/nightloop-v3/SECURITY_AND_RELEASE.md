# Nightloop v3 Security And Release Checklist

Last updated: 2026-04-24

Security is a phase gate. It is also a requirement inside every earlier phase.

## Security Sources

Useful official references:

- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple App Review: https://developer.apple.com/app-store/review/
- Apple app privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Supabase RLS: https://supabase.com/docs/guides/auth/auth-row-level-security
- Supabase API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase JWTs: https://supabase.com/docs/guides/auth/jwts
- Mapbox iOS styles: https://docs.mapbox.com/ios/maps/guides/styles/

## Phase 8 Security Hardening Gate

Phase 8 cannot pass until these items are reviewed and evidence is recorded.

### Threat Model

Cover at minimum:

- Auth/session hijacking.
- Underage account state bypass.
- User ownership bypass.
- Friend graph enumeration.
- Ghost mode leaks.
- Contacts upload misuse.
- Signal spam and venue manipulation.
- Decision vote manipulation.
- Invite link abuse.
- Admin privilege escalation.
- Provider import poisoning.
- Push notification privacy leaks.
- Location privacy leaks.
- Secrets leakage in iOS, frontend, logs, and git history.

### Auth And Authorization

- Supabase token verification implemented server-side.
- All protected Express routes require auth middleware.
- Every user-scoped route checks ownership.
- Every friend-scoped route checks friendship, block state, and ghost mode.
- Admin routes require explicit admin role.
- Reviewer/demo account is isolated from real users.

### Database

- RLS enabled for Supabase-exposed tables.
- Policies reviewed for user-owned rows.
- While Nightloop remains backend-mediated, app tables may intentionally have RLS
  enabled with no broad direct-client policies. Express owns product-data
  authorization.
- Do not add permissive `USING (true)` policies to app/private/admin tables to
  silence Supabase Advisor warnings.
- Phase 4 Supabase Advisor cleanup includes leaked password protection,
  `public.set_updated_at` search-path hardening, and direct API denial for
  `public.spatial_ref_sys` when the migration role owns that extension-created
  table. If Supabase keeps it owned by `supabase_admin`, record the advisor item
  as a manual extension cleanup follow-up.
- PostGIS-in-public relocation is tracked for Phase 5 database cleanup unless a
  safe migration path is verified earlier.
- Service role/secret keys only in backend env.
- No service role in iOS, Next frontend bundle, tests committed with real secrets, or screenshots.
- Migrations reviewed before production apply.

### Privacy

- Precise location used only at request time unless tied to explicit venue action.
- Selected market stored; raw precise location not stored by default.
- Contacts matching uses hashes only.
- Ghost mode hides presence/check-ins from friends.
- Push notifications avoid sensitive venue/location details unless user explicitly opts into richer content.
- Account deletion deletes/anonymizes personal data.

### Abuse Prevention

Rate-limit:

- signals
- friend requests
- invite link creation
- contacts matching
- decision votes
- report submissions
- login/OTP attempts where not already handled by Supabase

Add:

- block user
- report user/activity/profile
- moderation queue
- admin audit logs
- provider import audit logs

### Secrets And Transport

- HTTPS only outside local development.
- Separate development, staging, production env files.
- `.env` files remain uncommitted.
- Mapbox token restricted where possible.
- Supabase service/secret keys never leave backend.
- Crash logs and app logs redact tokens, phone numbers, contact hashes, and precise coordinates.

### Dependency And Supply Chain

- Run npm audit or documented equivalent for backend/frontend.
- Run Swift Package dependency review for iOS.
- Review Mapbox and Supabase SDK privacy manifests/requirements before App Store submission.

## App Store Release Checklist

### In-App Requirements

- Account deletion available in Settings.
- Sign out available.
- Support link available.
- Privacy policy and terms links available.
- Ghost mode and contacts sync controls available.
- Notification settings available.
- Location permission purpose strings explain nearby/map functionality.
- Contacts permission purpose string explains friend matching.
- Push permission copy explains social/decision alerts and optional favorite venue alerts.

### Web/Metadata Requirements

Host from Next or another production web surface:

- Privacy Policy
- Terms
- Support
- Delete Account help
- Accessibility support page

### App Review Account

Seed one dedicated reviewer account with:

- eligible 21+ state
- completed profile
- selected SF market
- completed onboarding preferences
- friends
- friend activity
- decision session
- favorite venues
- sample signals

Add App Review notes explaining:

- login credentials
- social test data
- notification behavior
- location permission purpose
- contacts sync behavior
- account deletion location

### Accessibility

- VoiceOver labels for tab bar, signal buttons, map markers, filter pills, decision actions, QR, and settings toggles.
- Minimum touch target review.
- Reduced motion support for pulse/breathe animations.
- Contrast check for Midnight Orchid palette.
- Dynamic Type support where feasible.

### Final Verification

- Fresh install flow.
- Existing session restore.
- Underage blocked state.
- Account deletion.
- Home/Map/Venue detail signal submission.
- Friends attendance.
- Decision session sync.
- Ghost mode.
- Contacts matching opt-in.
- Reviewer account path.
