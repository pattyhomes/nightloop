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
- Default field mask avoids Enterprise fields:
  `places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.googleMapsUri`
- Do not use wildcard field masks or add ratings, hours, phone, website, reviews, or photos without a separate cost/security decision.
