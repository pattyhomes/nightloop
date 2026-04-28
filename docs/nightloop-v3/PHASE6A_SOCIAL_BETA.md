# Phase 6A Social Beta Checkpoint

Last updated: 2026-04-28

## Status

Phase 6A is implemented as a broad beta foundation.

Committed checkpoints:

- `c59b872 feat: add phase 6a social backend`
- `316b9b4 feat: build phase 6a friends ios beta`

Implemented:

- Real backend friends graph, requests, strict blocks, invites, activity feed,
  attendance intents, replies, and social reports.
- Signal auto-share to friends when ghost mode is off.
- Friend summaries in venue/recommendation payloads without affecting ranking.
- Swift API models/client methods for social payloads and protected requests.
- Friends tab beta UI with ticker, requests, profile search, invite code/QR,
  invite accept, friend strip, activity cards, "I'm Coming", replies, emoji
  signal replies, mini profile sheet, block/report/unfriend.

Deferred:

- Contacts matching.
- Universal links.
- APNs/push.
- Realtime SSE/WebSocket activity.
- Live social presence.
- Friend-influenced recommendations.
- Public event browsing.
- QR camera scanning; current iOS displays a QR and accepts codes manually.

## Privacy Contract

- Profiles are searchable by display name and username by default.
- Search exposes safe profile fields only: id, display name, username,
  avatar kind, optional bio, and friendship state.
- Blocks are strict mutual invisibility and remove friendship/request state.
- Ghost mode hides social activity/presence, not profile search.
- Signal auto-share stores and exposes only venue, signal kind, actor, and time.
  It never exposes raw coordinates or detailed report payloads.
- Activity is friend-scoped, tonight-only, and expires at the market nightlife
  day boundary.
- Text replies are friend-only, max 140 chars, and reportable.
- "I'm Coming" is an attendance intent and social activity item only. It does
  not count as a live signal or liveness evidence.

## Backend Surface

Protected routes under `/api/v1`:

- `GET /friends`
- `GET /friends/search?q=&limit=`
- `POST /friends/requests`
- `POST /friends/requests/:id/accept`
- `POST /friends/requests/:id/decline`
- `DELETE /friends/requests/:id`
- `DELETE /friends/:userId`
- `GET /friends/blocks`
- `POST /friends/blocks`
- `DELETE /friends/blocks/:userId`
- `POST /friends/invites`
- `DELETE /friends/invites/:id`
- `POST /friends/invites/accept`
- `GET /friends/activity`
- `POST /friends/venues/:venueId/coming`
- `POST /friends/activity/:id/replies`
- `POST /friends/activity/:id/report`
- `POST /friends/profiles/:userId/report`

Tables added by migration `009_phase6a_social_beta.sql`:

- `friendships`
- `blocked_users`
- `friend_invites`
- `activity_events`
- `attendance_intents`

Moderation target types now include `profile` and `activity`.

## iOS Surface

Important files:

- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/Features/FriendsShellView.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/API/NightloopAPIClient.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/API/NightloopAPIModels.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/NightloopTests/NightloopTests.swift`

The Friends tab is intentionally pull/refresh based for this slice. Do not add
push or realtime behavior until the graph/privacy model has more soak time.

## Verification So Far

Targeted verification already run during implementation:

```bash
npm --prefix backend run build
npm --prefix backend test -- v1-social-api.test.ts
cd ios/Nightloop
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

The latest iOS run passed 39 tests with 0 failures.

Before calling Phase 6A fully complete, run the full verification set from
`PHASE6_READINESS.md`.

## Next Recommended Slice

Do a short Phase 6A hardening pass before Phase 6B:

- Exercise the social APIs with seeded/dev users in the simulator.
- Add any missing edge-case tests found from real UI use.
- Confirm account deletion cleanup against real social rows.
- Run the full backend/root/iOS verification set.

After that, Phase 6B can start with group planning/decision sessions, still
without live presence or recommendation influence.
