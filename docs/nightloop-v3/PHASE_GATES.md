# Nightloop v3 Phase Gates

Last updated: 2026-04-24

Each phase begins with a checkpoint and ends with a review. If any product ambiguity, security tradeoff, cost decision, provider limitation, App Store risk, or scalable architecture concern appears during implementation, stop and ask before continuing.

## Required Phase Handoff

Every "ready for next phase" message must tell the user:

- whether Codex Plan Mode is recommended;
- which effort/intelligence level is recommended;
- what prerequisites are still needed;
- what questions, if any, must be answered before implementation starts.

Default recommendation:

- Plan Mode: recommended before starting each new phase.
- Effort: high by default.
- Effort: xhigh for security, auth, privacy, data model, provider architecture, or App Store readiness phases.

## Phase 0: Product Architecture

Goal: finalize architecture, contracts, data model, Supabase setup needs, provider strategy, and App Store readiness requirements.

Exit artifacts:

- `PHASE_0_ARCHITECTURE.md`
- `API_CONTRACTS.md`
- `DATA_MODEL.md`
- `SECURITY_AND_RELEASE.md`
- `PHASE_GATES.md`
- `SUPABASE_SETUP_GATE.md`

Review gate:

- User reviews Phase 0 docs.
- User confirms readiness to create/confirm Supabase project before Phase 1.

## Phase 1: Backend Foundation

Prerequisite:

- Supabase project confirmed.
- Local env values supplied.

Scope:

- Supabase Auth integration.
- JWT verification middleware.
- users, profiles, settings, markets.
- age attestation.
- account deletion.
- venue/live-state contracts.

Stop before continuing if:

- Supabase cost/project setup is not confirmed.
- JWT verification approach is unclear.
- RLS vs backend-only access boundary changes.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: xhigh until auth/security design is finalized; high is acceptable for execution after the Phase 1 backend plan is approved.

## Phase 2: Data And Ops

Scope:

- Provider abstraction.
- Foursquare importer.
- generalized Resident Advisor importer.
- manual/admin imports.
- venue reconciliation.
- image provenance/licensing.
- event ingestion.
- moderation basics.
- reviewer account management.
- ops dashboard expansion.

Stop before continuing if:

- Provider licensing is unclear.
- New provider requires paid API approval.
- Venue image rights are uncertain.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: xhigh for provider architecture and data model changes; high for implementation after approval.

## Phase 3: Native App Foundation

Scope:

- SwiftUI iPhone project.
- app shell with five tabs.
- per-tab navigation.
- theme/design tokens.
- API client.
- Supabase session handling.
- loading/error/empty states.
- previews and tests.

Stop before continuing if:

- Apple developer team/bundle ID is needed.
- Mapbox token setup is missing.
- Supabase mobile redirect URL setup is missing.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: high.

## Phase 4: Core UX

Scope:

- Auth UI.
- age screen.
- profile setup.
- onboarding Variation B.
- Home.
- Venue Detail.
- Profile and Settings.
- Supabase Auth and Security Advisor cleanup before real user testing.

Security/advisor cleanup:

- Enable leaked password protection in Supabase Auth settings before real user
  testing.
- Apply the Phase 4 advisor migration for `public.set_updated_at` search path
  and `public.spatial_ref_sys` RLS/revokes.
- Keep product data backend-mediated through Express. App tables with RLS and no
  broad direct-client policies are intentional while Express owns authorization.
- Do not add permissive `USING (true)` policies to app/private/admin tables to
  silence advisor warnings.
- Track PostGIS-in-public relocation, unused indexes, and unindexed foreign keys
  as DB hardening follow-ups unless a concrete Phase 4 issue appears.

Stop before continuing if:

- setup flow copy or required fields feel wrong.
- "Tonight in SF v" market switcher behavior needs design review.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: high.

## Phase 5: Map

Scope:

- Mapbox iOS.
- market-aware map config.
- Midnight Orchid style.
- pulse bloom markers.
- filter counts.
- anchored bottom sheet.
- orange signal FAB.

Stop before continuing if:

- Mapbox custom style cannot be configured with needed visibility.
- marker performance is poor at expected venue counts.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: high.

## Phase 6: Social

Scope:

- Friends feed.
- invite links.
- username search.
- QR.
- hashed contacts matching.
- ghost mode.
- report/block.
- social and decision notifications.
- optional favorite venue alerts in Settings.

Stop before continuing if:

- contacts permission UX or privacy copy is unclear.
- push notification payload would reveal sensitive location/presence.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: xhigh for privacy/security choices; high for implementation after approval.

## Phase 7: Decision Mode

Scope:

- decision sessions.
- 12-hour expiry.
- invite/join.
- venue deck.
- votes.
- realtime counters.
- results.

Stop before continuing if:

- real-time implementation choice changes.
- session membership/privacy behavior is ambiguous.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: high.

## Phase 8: Security Hardening

Scope:

- threat model.
- RLS and authorization review.
- rate limits.
- audit logs.
- abuse prevention.
- dependency audit.
- PII logging review.
- secret handling review.
- account deletion verification.

Stop before continuing if:

- any security requirement cannot be verified.
- a shortcut would expose PII or weaken ownership checks.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: xhigh.

## Phase 9: App Store Hardening

Scope:

- accessibility.
- privacy labels.
- legal/support pages.
- reviewer account.
- crash/error handling.
- TestFlight checklist.

Stop before continuing if:

- App Review metadata needs business/legal input.
- privacy label answers are uncertain.

Recommended next-session mode:

- Use Codex Plan Mode: yes.
- Effort: xhigh for privacy/App Review decisions; high for execution after approval.
