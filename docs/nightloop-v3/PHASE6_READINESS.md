# Phase 6 Readiness Checkpoint

Last updated: 2026-04-30

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

## Phase 6 Status

Phase 6A has started and the first broad beta foundation is implemented:

- backend friends graph, requests, blocks, invites, activity, attendance
  intents, replies, reports, signal auto-share, and venue friend summaries;
- iOS social models/client methods, decode/request tests, and a real Friends
  tab beta surface;
- docs/API contract checkpoint in `PHASE6A_SOCIAL_BETA.md`.

Phase 6A.1 and the Phase 6B decision MVP are also implemented:

- dev social smoke seed for 3-4 eligible local profiles;
- backend private decision sessions, fixed 12-venue candidate slates, code
  join, aggregate votes, group fit, creator end, code revoke, and deletion
  cleanup;
- iOS Decision tab create/join/list/vote/detail/"I'm Coming" flows;
- docs/API checkpoint in `PHASE6B_DECISION_MVP.md`.

Phase 6C group pick rooms are implemented:

- member venue suggestions from approved public venues in the room market;
- tiny room-only text/emoji chat with reports and tonight expiry;
- creator-locked final plans with optional meetup time/note;
- iOS Decision tab room detail for final plans, suggestions, remove/finalize,
  and chat;
- docs/API checkpoint in `PHASE6C_GROUP_PICK_ROOMS.md`.

Phase 6D room-live foundation is implemented:

- server-authoritative Decision deck state and server-backed rewind;
- current-room SSE for active joined Decision rooms only;
- privacy-safe invalidation events that preserve aggregate-only vote semantics;
- backend notification token/preference foundation;
- contextual iOS notification permission prompt and room notification routing;
- Debug/Release APNs entitlement split.

Still do not add live social presence, friend-influenced recommendations,
contacts matching, universal links, public rooms, realtime Friends feed,
notification inbox/history, global unread badges, silent pushes, or named vote
display without a fresh privacy/product plan.

Recommended mode for the next Phase 6 boundary: Codex Plan Mode, high reasoning
for APNs setup or planning polish; xhigh if turning on production delivery,
contacts, public rooms, presence, or recommendation influence.

Next recommended slice: run the APNs Apple Developer setup checklist and test on
a physical device if real push delivery is desired. Otherwise continue with
richer group planning polish or another focused social UI pass.

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
