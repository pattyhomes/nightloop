# Nightloop Architecture (Scaffold)

## High-level flow

1. **Ingestion** pulls source data into normalized structures.
2. **Scoring** computes ranking/priority signals.
3. **Agents** review outputs and trigger actions.
4. **Backend/API** expose run state and score artifacts.
5. **Frontend** provides operational visibility.

## Next implementation milestones

- Define canonical schemas for ingestion + scoring handoff
- Establish backend service entrypoint and configuration
- Add API contract stubs and initial tests
- Stand up a minimal frontend dashboard shell

## Current planning anchors

- Product-facing API targets live in `docs/API_CONTRACTS.md`
- MVP sequencing lives in `docs/MVP_TICKETS.md`
- Legacy-to-current porting guidance lives in `docs/VENUES_API_PORT_PLAN.md`
