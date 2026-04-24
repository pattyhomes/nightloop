# Venues API Port Plan

This note explains what was worth salvaging from the older Nightloop work and how to port it into the current repo without regressing the architecture.

## What to keep

- Product-facing venue API shape from the legacy `src/contracts/venues.js`
- Product planning docs such as the MVP task list and API examples
- Schema ideas for:
  - favorites
  - user trust
  - live venue state
  - venue summaries
  - richer venue tags

## What not to port directly

- Legacy root-level `src/` Express app
- Legacy root `package.json`, `package-lock.json`, and `.gitignore`
- Legacy README as a replacement for the current repo story

Those files belong to an older single-service layout and would fight the current `backend/` + `frontend/` structure.

## Mapping legacy ideas onto the current repo

### Venue discovery

- Implement the route handlers in `backend/src/routes/`
- Add supporting service/data-access code under `backend/src/services/` and `backend/src/dataAccess/`
- Keep the response contract aligned to `docs/API_CONTRACTS.md`

### Schema evolution

- Keep `db/schema.sql` as the source of truth
- Add new tables only where they materially simplify the product model
- Prefer evolving the current schema over reintroducing the old one wholesale

Useful candidates from the legacy branch:

- `favorites`
- `user_trust`
- `venue_live_state`
- `venue_summaries`
- `venue_tags`

### Validation

- The old Zod contract definitions are useful as a design reference
- Rebuild them in the current TypeScript backend instead of copying the old CommonJS files

## Recommended implementation order

1. Add typed request/response contracts for `GET /venues` and `GET /venues/:id`
2. Implement read-only venue discovery using the current schema plus seed data
3. Add `POST /reports` with validation and moderation-state scaffolding
4. Decide whether favorites and trust ship in MVP phase 1 or phase 2
5. Add schema support for live-state and summaries once the read/write flow is clear
