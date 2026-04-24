# Nightloop MVP Tickets

This is the preserved, updated product checklist for the current Nightloop architecture.

## Foundation

1. Finalize tag taxonomy such as `cheap_drinks`, `rowdy`, `dive_bar`, and `dance_heavy`.
2. Confirm which schema concepts belong in the current Postgres model versus JSONB staging fields.
3. Add the first product-facing venue contracts to the current backend implementation.

## Venue discovery

4. Implement `GET /venues` with geo filtering, type/tag filters, pagination, and deterministic sorting.
5. Implement `GET /venues/:id` with profile data, summary fields, and live-state output.
6. Decide whether live-state is read directly from recent signals or from a materialized table/view.

## Reports and trust

7. Implement `POST /reports` with enum validation and safe input constraints.
8. Add moderation-pipeline scaffolding with `pending`, `accepted`, `rejected`, and `shadowed` states.
9. Define how accepted reports flow into `signals` or a derived aggregation layer.
10. Add a first-pass user trust model and moderation outcome feedback loop.

## Product enrichment

11. Define storage for venue tags, summaries, and live-state snapshots in the current schema.
12. Add tag expiry and refresh rules.
13. Add summary generation storage and refresh rules.
14. Design the explanation/reason-code payload for personalized recommendations.

## Personalization

15. Add favorites persistence and retrieval.
16. Implement `GET /feed/personalized` on top of the current scoring pipeline.
17. Add explanation fields so recommendations are legible and trustworthy.

## Ops and verification

18. Add endpoint-level tests for `GET /venues`, `GET /venues/:id`, and `POST /reports`.
19. Add observability for freshness, confidence, moderation volume, and API latency.
20. Run a San Francisco alpha checklist covering seed quality, endpoint QA, and basic ops readiness.
