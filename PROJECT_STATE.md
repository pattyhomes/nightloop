# PROJECT_STATE.md

## Project
Nightloop — college-focused nightlife decision app, launching in San Francisco.

## Goal
Help users choose where to go tonight in under 60 seconds with trustworthy, explainable nightlife signals.

## Current State
- Planning docs are established (`README.md`, `schema.sql`, `api_contracts.md`, `MVP_TICKETS.md`).
- Vertical slice scaffold implemented: migrations + API service + venue read endpoints.
- Core architecture direction: API + worker jobs + Postgres.

## Milestone
M2: First backend vertical slice implemented and locally validated.

## Scope (MVP)
### In
- Venue discovery (search/filter/map-ready API)
- Favorites
- Live report ingestion (crowd/line/vibe)
- Moderation + trust scoring foundations
- Live-state aggregation
- AI tagging and summary storage contracts
- Personalized feed contract

### Out (later)
- Cover prepay / priority entry
- Full club SaaS dashboards
- Advanced group/social planning
- Vision-based line monitoring

## Stack (initial)
- Backend: Node.js (NestJS or Express)
- DB: PostgreSQL
- Queue/cache: Redis
- AI workers: LLM + rules hybrid

## Next Task
Implement API skeleton + database migration flow, then ship `GET /venues` and `GET /venues/:id` as the first working vertical slice.
