# Phase 5.5/5.6 Data, Maps, Signals, and Recommendations

Phase 5.5/5.6 makes Google Maps the native production map path, adds open-data
evidence importers, creates a safe hours foundation, and separates Home
recommendations from browse/map venue lists.

## Map Provider

- Production native map: Google Maps SDK for iOS.
- Local ignored config:
  - `GOOGLE_MAPS_IOS_API_KEY`
  - `GOOGLE_MAP_ID`
- The iOS key must be restricted to Maps SDK for iOS and the Nightloop bundle ID
  before production distribution.
- The backend Google Places key remains backend-only and must not be reused in
  iOS.
- Nightloop-owned marker glow, pulse colors, selected halos, sheets, filters,
  and verified signal flow remain app UI over the Google basemap.

## Venue Evidence

DataSF POE and NYC SLA are evidence sources, not direct product truth.

- SF DataSF POE importer:
  - dry-run default;
  - CSV or live API source;
  - writes only `provider_records` and pending review items in apply mode;
  - includes coverage reporting by action bucket/neighborhood/type.
- NYC SLA importer:
  - dry-run feasibility only in this phase;
  - no public NYC market exposure;
  - no bulk mutation of canonical venues.

Operational commands:

```bash
npm --prefix backend run import:datasf-poe -- --csv="/Users/chuckclaw/Downloads/poe_operating_status_review_20260424.csv" --dry-run
npm --prefix backend run import:nyc-sla -- --dry-run
npm --prefix backend run audit:venue-provenance -- --json
```

## Hours Foundation

`venue_schedules` represents unknown, manually verified, provider-sourced,
temporary closure, freshness, and confidence states. Unknown hours must not be
shown as open or closed.

Home and Venue Detail can now display truthful hours language:

- unknown: do not claim open/closed;
- known open later: tonight-oriented copy;
- known closed: clear but not punitive;
- temporary closure/manual hold: hide or warn depending on admin status.

## Recommendations

Home should use:

```text
GET /api/v1/recommendations?market_id=...
```

Map/list browsing should continue to use:

```text
GET /api/v1/venues?market_id=...
```

Ranking combines venue quality, preferences, live verified signals, events,
source confidence, and schedule confidence. Live signals are bounded so sparse
early traffic cannot overpower source-backed venue quality.

Signal guardrails:

- signals must be proximity verified;
- one user cannot repeatedly move one venue during the cooldown window;
- expired signals contribute zero to recommendations;
- raw precise user coordinates are not stored.

## Deferred

- Google hours fetches beyond selected/manual/cost-gated testing.
- NYC public launch.
- Full abuse/security hardening, which remains Phase 8.
- Claude Design tonight-preview polish.
