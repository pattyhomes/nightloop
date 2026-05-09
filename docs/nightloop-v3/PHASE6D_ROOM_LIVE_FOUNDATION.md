# Phase 6D Room-Live Foundation

Last updated: 2026-04-30

## Status

Phase 6D makes private Decision rooms reliable and live-feeling while preserving
the Phase 6 social privacy boundary.

Implemented:

- server-authoritative Decision deck state with `deck_state`;
- release-only swipe commits and button/gesture parity;
- server-backed rewind for the viewer's latest deck swipe;
- current-room SSE for active joined Decision rooms;
- privacy-safe room events for joins, progress invalidation, shortlist, chat,
  suggestions, final plan, and room end;
- device-token and notification-preference backend foundation;
- contextual iOS notification pre-permission sheet;
- iOS notification route handling into Decision rooms;
- profile room-notification preference controls;
- Debug/Release APNs entitlement split;
- dev-only room notification test route and UI affordance.

## Privacy Boundary

Phase 6D still does not add:

- realtime Friends feed;
- live presence;
- typing indicators;
- read receipts;
- notification inbox/history;
- global unread badges;
- silent/background pushes;
- contacts matching;
- universal links;
- public/open rooms;
- named vote display;
- friend-influenced public recommendations.

Votes and swipes remain aggregate-only. Vote-related SSE events are
invalidation-only and do not include actor identity or candidate ids.

## Backend Surface

New or extended protected routes:

- `GET /decision-sessions/:id/events`
- `POST /decision-sessions/:id/rewind`
- `POST /me/device-tokens`
- `DELETE /me/device-tokens`
- `GET /me/notification-preferences`
- `PATCH /me/notification-preferences`

Dev-only route:

- `POST /dev/notifications/room-test`

The dev notification route returns `404` in production and never returns APNs
credentials, raw device tokens, JWTs, raw provider records, or coordinates.

## iOS Surface

Decision rooms now:

- use backend `deck_state` for card progression and cards-left state;
- commit drag swipes only on release past threshold;
- ignore duplicate/opposite swipe submissions while a vote is pending;
- reconnect to the current active joined room through SSE only while that room
  is visible;
- debounce SSE invalidations before canonical room refetches;
- route notification taps directly into the target room when allowed.

Profile now exposes room notification preferences for:

- room invites;
- shortlist ready;
- final plan locked;
- room messages.

## APNs Follow-Up

Code and entitlements are prepared, but real APNs delivery is still a follow-up
manual setup:

- enable Push Notifications for `com.nightloop.app` in Apple Developer;
- create an APNs Auth Key;
- add APNs team id, key id, private key, bundle id, and environment to backend
  env;
- switch backend notification delivery mode deliberately after credentials are
  configured;
- verify on a physical device if simulator push behavior is insufficient.

Until real APNs delivery is implemented and configured, backend APNs mode fails
closed instead of pretending to deliver. Mock/dev notification paths remain
available for local routing verification.

## Verification

Recommended full checkpoint:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Manual verification should use Computer Use on the plain iPhone 17 Nightloop
simulator only. Do not touch the LoopVille simulator.

## Next Recommended Slice

Before Phase 6E, do a simulator/physical-device APNs setup pass if push delivery
should become real. If not, the next product branch is richer group planning or
another focused social UI polish pass.
