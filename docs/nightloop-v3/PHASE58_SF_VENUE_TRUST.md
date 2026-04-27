# Phase 5.8 SF Venue Trust

Phase 5.8 stabilizes SF recommendations around trust inputs instead of visual polish:
public venue quality, source-backed hours, explicit unknown states, neighborhood cleanup,
event-backed tonight context, and capped live-signal influence.

## Product Contract

- Home remains a Tonight concierge. Before live thresholds are met, copy should say
  "Expected tonight", "likely", or "based on venue type/event", never fake history or
  fake live claims.
- A venue is consumer-public only if it is approved, active, and not fixture/test data.
  `phase2-test`, `metadata.fixture = true`, `metadata.test_run_id`, and names starting
  with `Phase 2` are filtered out of public venue, map, and recommendation APIs.
- Source precedence for tonight context is approved event times, manual/admin schedule,
  fresh Google schedule, fresh Foursquare schedule, then unknown.
- Live remains strict: source-verified open hours plus at least 3 fresh signals from at
  least 2 users in 90 minutes.
- Unknown provider hours stay explicit. They must not become open, closed, or live by
  inference.

## Ops Commands

Baseline audit:

```bash
npm --prefix backend run audit:sf-trust -- --json --top=20
```

Neighborhood cleanup:

```bash
npm --prefix backend run neighborhoods:sf -- --market=san-francisco --limit=80
npm --prefix backend run neighborhoods:sf -- --market=san-francisco --limit=80 --apply
```

Google hours, capped:

```bash
npm --prefix backend run hours:google -- --market=san-francisco --limit=25
npm --prefix backend run hours:google -- --market=san-francisco --limit=25 --fetch-dry-run --summary
npm --prefix backend run hours:google -- --market=san-francisco --limit=25 --apply --summary
```

Foursquare fallback for Google gaps:

```bash
npm --prefix backend run hours:foursquare -- --market=san-francisco --limit=25
npm --prefix backend run hours:foursquare -- --market=san-francisco --limit=25 --fetch-dry-run --summary
npm --prefix backend run hours:foursquare -- --market=san-francisco --limit=25 --apply --summary
```

Event source ingestion:

```bash
npm --prefix backend run events:sync -- --market=san-francisco --limit=25
npm --prefix backend run events:sync -- --market=san-francisco --limit=25 --apply
```

Recommendation input refresh:

```bash
npm --prefix backend run recommendations:refresh-inputs -- --market=san-francisco --apply
```

## Current Local Batch Result

As of the Phase 5.8 local pass on April 27, 2026:

- Public approved SF venue count: 136.
- Fixture/test approved rows detected: 12, excluded from public APIs.
- Neighborhood cleanup resolved 27 of 31 unknowns using fallback coordinate polygons
  because the current DataSF map export returned no geometry in this environment.
  The 4 unresolved venues are explicitly flagged for ops review.
- Google hours wrote fresh provider schedules with 30-day TTL metadata.
- Hours coverage after refresh: 124 fresh `verified_hours`, 8 fresh explicit
  `unknown`, and 4 missing.
- Recommendation input coverage: 136 of 136 public approved SF venues.
- Event source rows configured: 0, so event ingestion currently performs no fetches.
- Foursquare key is present locally, but the provider returned `401 Invalid request token`;
  rerun the FSQ fallback after replacing `FOURSQUARE_API_KEY` with a current Places API
  service key.

## Source Notes

- Google Places details hours fields used: `regularOpeningHours`,
  `currentOpeningHours`, `regularSecondaryOpeningHours`,
  `currentSecondaryOpeningHours`, `businessStatus`, `utcOffsetMinutes`, and
  `timeZone`.
- Foursquare fallback stores only hours, popular hours, popularity, price, rating,
  verified status, timezone, location neighborhood, and closed bucket. It does not store
  tips, photos, descriptions, or promo copy.
- Event ingestion stores only event title, start/end, source URL, source ID,
  structured cover/price, and source metadata. Descriptions, artist bios, promo copy,
  and images stay out of Nightloop storage.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```
