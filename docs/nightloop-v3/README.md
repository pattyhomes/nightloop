# Nightloop v3 App Store-Ready Implementation

This folder contains the Phase 0 source of truth for the native iOS rebuild.

Read in this order:

1. `PHASE_0_ARCHITECTURE.md`
2. `API_CONTRACTS.md`
3. `DATA_MODEL.md`
4. `SECURITY_AND_RELEASE.md`
5. `PHASE_GATES.md`
6. `SUPABASE_SETUP_GATE.md`

## Current Gate

Phase 0 documentation is the active work. The Supabase project has been created; Phase 1 backend auth work must not begin until the remaining Supabase setup gate items are complete, especially local env values.

## Phase Handoff Protocol

Every time an implementation phase is ready to start, the handoff must include:

- Whether Codex Plan Mode is recommended for the next phase.
- The recommended reasoning/effort level.
- Any prerequisites the user must complete before work starts.

Default recommendation: use Codex Plan Mode for any new phase or phase redesign, with high effort. Use xhigh effort for security hardening, auth, privacy, data model, or App Store readiness work when the phase contains unresolved tradeoffs.

## Non-Negotiables

- Security is a first-class phase and a requirement inside every earlier phase.
- Supabase service/secret keys stay backend-only.
- The app must scale beyond San Francisco through the `markets` model.
- Implementation stops for user review after each phase.
- If security, privacy, cost, provider, App Store, or scalability ambiguity appears, stop and ask before continuing.
