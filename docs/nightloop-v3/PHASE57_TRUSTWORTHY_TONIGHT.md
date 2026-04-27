# Phase 5.7 Trustworthy Tonight Stabilization

Phase 5.7 turns the SF experience into a source-backed Tonight concierge. The product must not claim live, open, or closed unless the backend can justify it from source-verified hours and fresh, proximity-verified user density.

## Liveness Contract

Venue and recommendation payloads now expose:

- `liveness.state`: `live`, `opens_later`, `closed_today`, or `unknown`
- `liveness.hours_state`: `source_verified`, `unknown`, `temporary_closed`, or `manual_hold`
- `liveness.confidence`: `high`, `medium`, or `low`
- `opens_at`, `closes_at`, `expected_pulse_level`, `live_signal_count`, `live_unique_user_count`
- copy/provenance fields for truthful UI rendering

`live` requires source-verified hours, an open-now source signal, at least 3 fresh signals, and at least 2 unique users in the last 90 minutes.

## Ops Commands

```bash
npm --prefix backend run audit:sf-trust -- --json
npm --prefix backend run audit:sf-trust -- --fix-neighborhoods
npm --prefix backend run hours:google -- --market=san-francisco --limit=50
npm --prefix backend run hours:google -- --fetch-dry-run --market=san-francisco --limit=10
npm --prefix backend run hours:google -- --apply --market=san-francisco --limit=5
npm --prefix backend run recommendations:refresh-inputs -- --dry-run
npm --prefix backend run recommendations:refresh-inputs -- --apply
```

Google hours apply is backend-only and requires `GOOGLE_PLACES_API_KEY`. Dry-run reports candidate counts and planned request/write counts without writing. Apply writes capped `venue_schedules` rows for approved SF venues with `source = provider:google_places`.

## iOS Behavior

- Home presents Tonight Preview unless at least one venue is truly live.
- Venue cards and detail screens render liveness/confidence instead of implying unverified live status.
- Detail uses `HoursStatusBlock` for source/provenance copy.
- Map markers follow the contract: filled bloom for `live`, hollow purple ring for `opens_later`, dashed amber ring for `unknown`, gray outline for `closed_today`.
- Expanded reports are structured only. No free text or raw coordinates are sent.
- `Remind me` is UI-only and returns “Reminders coming soon.”

## Verification

Targeted verification during implementation:

```bash
npm --prefix backend test -- --run test/livenessService.test.ts test/v1-api.test.ts
cd ios/Nightloop && xcodegen generate
cd ios/Nightloop && xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Before promotion, also run the full root/backend build and full backend suite.
