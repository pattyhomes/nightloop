# Phase 6B Decision MVP Checkpoint

Last updated: 2026-04-28

## Status

Phase 6A hardening plus the Phase 6B decision MVP are implemented as a
night-ready private-room slice.

Committed checkpoints:

- `315e668 feat: add phase 6b decision backend`
- `207a8a2 feat: build phase 6b decision ios mvp`
- Phase 6B.1 hardening checkpoint: see `PHASE6B1_SOCIAL_DECISION_HARDENING.md`.
- Phase 6C group pick room checkpoint: see `PHASE6C_GROUP_PICK_ROOMS.md`.

Implemented:

- Dev social smoke seed: `npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset`.
- Dev social smoke audit: `npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco`.
- Backend decision sessions, members, fixed candidates, votes, code join,
  code revoke, creator end, strict block checks, and account-deletion cleanup.
- Session candidate slate snapshots exactly 12 recommendations at creation.
- Group fit is recalculated from joined members only; invited-but-not-joined
  users do not influence fit.
- Votes expose aggregate `in`/`skip` counts and the viewer's own vote only.
- iOS Decision tab now supports create, invited friends, filters, list/open,
  join by code, vote, venue detail, "I'm Coming", revoke code, end, and
  pull-to-refresh.

Deferred:

- Realtime/WebSocket/SSE vote updates.
- APNs/push.
- Universal links.
- Contacts matching.
- Public/open rooms.
- Member removal UI.
- Named vote display.
- Friend-influenced public recommendations.
- Live social presence.

## Privacy Contract

- Decision sessions are private friend-scoped rooms.
- Creator-selected accepted friends can join without a code.
- Session code works only for accepted friends of current joined members.
- Blocks prevent visibility, joining, and session interaction.
- Ghost mode does not hide explicit decision-session participation, but still
  hides ambient friend activity.
- Session actions do not create friend feed activity. The separate
  "I'm Coming" CTA uses existing attendance intent behavior.
- Candidate payloads use existing venue/recommendation formatting and must not
  expose raw provider records or raw provider payloads.

## Backend Surface

Protected routes under `/api/v1`:

- `GET /decision-sessions`
- `POST /decision-sessions`
- `GET /decision-sessions/:id`
- `POST /decision-sessions/:id/join`
- `POST /decision-sessions/:id/votes`
- `POST /decision-sessions/:id/revoke-code`
- `POST /decision-sessions/:id/end`

Tables added by migration `010_phase6b_decision_sessions.sql`:

- `decision_sessions`
- `decision_session_members`
- `decision_session_candidates`
- `decision_votes`

## iOS Surface

Important files:

- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/Features/DecisionShellView.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/API/NightloopAPIClient.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/API/NightloopAPIModels.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/NightloopTests/NightloopTests.swift`

The Decision tab is intentionally pull-refresh based for this slice. Do not add
push or realtime behavior without a fresh privacy/product plan.

## Verification So Far

Targeted verification already run during implementation:

```bash
npm --prefix backend run build
npm --prefix backend test -- test/v1-decision-api.test.ts
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

The latest iOS run passed 41 tests with 0 failures.

## Next Recommended Slice

Phase 6C has since moved forward with richer private group planning tools.
Next, do a simulator walkthrough with seeded social users and one real dev
account, then patch any UI friction before choosing realtime/push.

Use Plan Mode, xhigh reasoning, before adding realtime, push, contacts, public
rooms, or recommendation influence.
