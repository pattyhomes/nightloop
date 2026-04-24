# PROJECT_STATE

- Status: active prototype
- Last updated: 2026-04-24

## Current reality

- Current repo shape is the newer `backend/` + `frontend/` architecture from GitHub.
- Backend currently exposes health, signal ingestion, and recommendation-oriented flows.
- Frontend exists as the current product surface for local exploration.
- Database foundation is in `db/schema.sql` plus `db/seed_venues.sql`.

## Already in place

- San Francisco seed venue dataset
- Postgres schema for `venues`, `signals`, `reports`, and `recommendation_snapshots`
- Recommendation scoring path and snapshot-backed reads
- Signal ingestion service and smoke-test scripts

## Not yet ported into the current architecture

- Venue discovery API (`GET /venues`, `GET /venues/:id`)
- Report submission contract aligned to the product-facing nightlife UX
- Favorites flow
- Personalized feed contract
- Explicit live-state/materialized venue-summary layer

## Recommended next step

Implement `GET /venues` and `GET /venues/:id` in the current `backend/` app using the rescued contract docs in `docs/API_CONTRACTS.md` and the porting guidance in `docs/VENUES_API_PORT_PLAN.md`.

## After that

Implement `POST /reports` with request validation and a moderation-state scaffold that can feed the existing signal/recommendation pipeline.
