# Google Places Provider Ops Notes

Phase 2B uses Google Places as the primary provider for venue QA and staged nightlife discovery.

## Key Handling

- Store the key only in `backend/.env` as `GOOGLE_PLACES_API_KEY=...`.
- Do not add it to `frontend/.env`, any `NEXT_PUBLIC_*` variable, the iOS app, Supabase, screenshots, logs, or tracked docs.
- For local development, restrict the Google key to the Places API in Google Cloud Console.
- Add deployment IP/app restrictions before production live runs.

## Cost Guardrails

- Current Google Cloud credit is expected to expire soon; treat live runs as intentionally capped.
- First live run should be `google_places`, `existing_qa`, capped at 100.
- Discovery live runs should happen only after QA output has been reviewed.
- Curated SF notable venue QA should use `google_run_kind=curated_qa` and a cap
  of 50. This verifies Nightloop-curated candidates without making Google the
  canonical source of venue notability.
- Default field mask avoids Enterprise fields:
  `places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.googleMapsUri`
- Do not use wildcard field masks or add ratings, hours, phone, website, reviews, or photos without a separate cost/security decision.

## Curated Candidate QA

Curated candidates are imported from `data/venues/sf_notable_candidates.csv` as
manual provider records and pending review items. A Google `curated_qa` run may
create a richer Google review item with coordinates, address, business status,
types, Maps URI, and provider ID.

Google provider names are evidence. They do not overwrite Nightloop-curated
canonical names by default. Closed, duplicate, low-confidence, or incomplete
matches remain manual holds.
