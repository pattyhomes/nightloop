# MVP_TICKETS.md

1. Finalize tag taxonomy (`cheap_drinks`, `rowdy`, `dive_bar`, etc.) with confidence thresholds.
2. Add migration tooling and apply `schema.sql` to local dev database.
3. Build seed venue import script + dedupe rules (name + geo proximity).
4. Implement `GET /venues` (geo filtering + type/tag filters + pagination).
5. Implement `GET /venues/:id` (profile + tags + live state + summary).
6. Implement favorites endpoints (add/remove).
7. Implement `POST /reports` with enum validation and rate limits.
8. Add moderation pipeline scaffold (pending/accepted/rejected/shadowed states).
9. Implement user trust score update job from moderation outcomes.
10. Implement live-state aggregation job (rolling report window).
11. Expose live-state confidence fields on read endpoints.
12. Build auto-tagging worker contract (LLM + rule signals -> `venue_tags`).
13. Add tag expiry + refresh scheduling.
14. Build summary generation worker -> `venue_summaries`.
15. Implement `GET /feed/personalized` using heuristic rank scoring.
16. Add reason codes/explanations in personalized response payload.
17. Add observability: freshness, confidence, moderation volume, API latency.
18. Run SF neighborhood alpha checklist (data quality + endpoint QA + ops runbook).
