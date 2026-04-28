# Phase 6 Readiness Checkpoint

Last updated: 2026-04-28

## Status

Phase 5 map/UI foundation is done. Phase 5 trust/data is complete enough to
start Phase 6 work while venue/event coverage continues as Phase 5.x ops.

Current gates:

- Recommendation input coverage: 136 of 136 approved public SF venues.
- Fixture/test venues in public approved set: 0.
- Unknown-neighborhood cleanup queue: 0.
- Hours are source-backed or explicitly unknown.
- Core trusted future event context exists for Cafe Du Nord, 1015 Folsom,
  Boom Boom Room, and Bottom of the Hill.
- Approved future venue-owned events: 143.
- Public liveness contract is enforced by backend tests and the Phase 6
  readiness audit.

Known caveats:

- Audio Nightclub remains review-only because sampled official pages expose
  date-only context and at least one off-venue/day-party item.
- Black Cat remains blocked by Turntable/provider decision; do not fetch
  third-party event pages until provider/terms scope changes.
- 1015 Folsom and Boom Boom Room events use date-only default 10 PM event
  times where the venue page does not expose structured times.
- Recommendations still need real active-night calibration once live usage
  and signal density exist.

## Phase 6A Recommendation

Phase 6A has started and the first broad beta foundation is implemented:

- backend friends graph, requests, blocks, invites, activity, attendance
  intents, replies, reports, signal auto-share, and venue friend summaries;
- iOS social models/client methods, decode/request tests, and a real Friends
  tab beta surface;
- docs/API contract checkpoint in `PHASE6A_SOCIAL_BETA.md`.

Do not add live social presence, friend-influenced recommendations, contacts
matching, universal links, or push notification behavior until the Phase 6A
foundation has been exercised with seeded/dev users and reviewed.

Recommended mode for Phase 6A: Codex Plan Mode, xhigh reasoning while privacy
and abuse-prevention decisions are being made; high reasoning is fine for
implementation after the plan is approved.

Next recommended slice: a short Phase 6A hardening pass with simulator/dev-user
exercise, account-deletion verification against real social rows, and the full
verification set below. After that, Phase 6B can begin with group planning and
decision sessions.

## Verification

Run before starting Phase 6 work or after changing trust/liveness behavior:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

The readiness audit must fail if public venue/recommendation payloads expose raw
provider records or claim live/open/closed status outside the liveness contract.
