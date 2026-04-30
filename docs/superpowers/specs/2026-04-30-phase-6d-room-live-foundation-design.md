# Phase 6D Room-Live Foundation Design

Date: 2026-04-30

## Summary

Phase 6D makes private Decision rooms feel reliable and alive without widening
Nightloop's social privacy surface. The phase fixes swipe correctness first,
then adds current-room server-sent events, and finally adds a production-shaped
push notification foundation with mock/dev verification.

The slice is intentionally bounded:

- realtime is scoped to the currently viewed Decision room only;
- push is limited to important room events;
- no live presence, typing indicators, read receipts, inbox, global unread
  counts, contacts matching, public rooms, universal links, or
  friend-influenced public recommendations;
- Friends remains pull-refresh based in this phase.

## Product Decisions

- Decision rooms use server-authoritative swipe/deck state.
- Drag and button voting share one mutation path.
- Dragging past threshold while still holding the card never commits a vote.
  Only release after threshold, or an explicit button tap, commits.
- Rewind is server-backed and limited to the viewer's most recent swipe.
- Current-room realtime uses SSE first, not WebSockets.
- SSE events are invalidations plus safe hints; iOS refetches the canonical
  room snapshot after meaningful events.
- Chat updates live through SSE, but there are no typing indicators or read
  receipts.
- Push notifications are visible-only and limited to:
  - room invite;
  - shortlist ready;
  - final plan locked;
  - room message.
- Notification copy is natural, lowercase, and privacy-conscious. It may use
  safe friend display names, but should not include venue names yet.
- Push permission is requested contextually after a user creates or joins a
  Decision room, through a Nightloop pre-permission sheet before the iOS system
  prompt.
- Ghost Mode hides ambient social activity, not explicit room participation or
  room notifications.

## Backend Design

### Server-Authoritative Deck State

Decision room responses should expose enough canonical state for iOS to render
the active deck without local guessing:

- current stage;
- active deck candidates for the viewer;
- viewer vote state;
- cards remaining;
- member progress;
- group confidence;
- shortlist readiness;
- final plan state;
- capabilities for vote, rewind, suggest, message, finalize, end, and refresh.

Swipe vote, button vote, shortlist vote, and rewind routes return a fresh room
snapshot or enough data to immediately fetch one. The backend is responsible for
deduping votes, finding the next unswiped card, and calculating progress. This
removes the two-venue looping and stale progress issues from the client.

Rewind removes or reverts only the viewer's latest swiping-stage vote in the
room. It is disabled once the room reaches shortlist voting, finalized, ended,
or expired. Rewind emits a room update so other members' progress views remain
honest.

### Room Event Bus And SSE

Add a small room event bus interface with an in-process implementation for
Phase 6D. The interface should be swappable later for Redis, Postgres
LISTEN/NOTIFY, or another multi-instance pubsub backend.

Initial SSE route:

```text
GET /api/v1/decision-sessions/:id/events
```

Access rules:

- authenticated user only;
- user must be an eligible joined member;
- room must be visible to that user;
- blocks, deleted users, expired rooms, and ended rooms must be respected.

Event types should cover:

- `room_joined`
- `vote_changed`
- `progress_changed`
- `shortlist_ready`
- `shortlist_vote_changed`
- `message_created`
- `candidate_suggested`
- `candidate_removed`
- `final_plan_locked`
- `room_ended`
- `room_snapshot_invalidated`

Events may include safe hints such as actor display name for visible explicit
actions, candidate id, message id, or stage. They must not include raw provider
records, raw coordinates, named vote lists, or private device tokens.

### Push Foundation

Add backend support for multiple device tokens per user:

- user id;
- platform;
- device token hash or encrypted token as appropriate for existing project
  conventions;
- APNs environment (`sandbox` or `production`);
- app build/version metadata when available;
- last seen timestamp;
- revoked timestamp.

Add social notification preferences with four toggles:

- room invites;
- shortlist ready;
- final plan locked;
- room messages.

Preferences default on after the user grants notification permission, but the
user can disable individual categories.

Add a notification sender abstraction:

- mock sender for tests/dev;
- direct APNs sender shell for Apple Push Notification service;
- async in-process queue so room actions do not wait on APNs.

Notification send failures should be logged/auditable but should never fail the
room action that triggered them.

Add a dev-only notification test path or script to verify routing and UI without
real APNs credentials. It must be unavailable in production and must not expose
secrets, JWTs, raw provider payloads, or coordinates.

## iOS Design

### Swipe Correctness

The Decision focused room view keeps a stable local gesture state and a
server-backed snapshot.

During `onChanged`, iOS may update:

- card translation;
- tilt;
- glow;
- `I'M IN` or `SKIP` stamp emphasis;
- bottom action button scale/glow;
- "release to vote" style feedback.

It must not call the vote mutation from `onChanged`.

During `onEnded`, if the drag crosses threshold, iOS calls the same vote
mutation used by the matching button. If it does not cross threshold, the card
springs back with no mutation.

After a committed vote, iOS may animate optimistically, then reconciles to the
backend snapshot. On rejection, it restores the card and shows a compact toast.
Rewind calls the backend and restores the server-approved previous state.

### Current-Room SSE

iOS opens the SSE connection only while the user is viewing one active Decision
room. Room lists and Friends remain pull/on-appear refresh surfaces in this
phase.

SSE connection states:

- normal;
- reconnecting;
- fallback/manual refresh.

The UI should keep actions usable while reconnecting. When the stream reconnects
or receives a meaningful event, iOS refetches the canonical room snapshot. New
messages, suggestions, shortlist unlocks, final plan locks, and room endings
should feel live without creating a broader social stream.

### Push Permission And Routing

After the user creates or joins a Decision room, show a compact Nightloop
pre-permission sheet:

```text
stay in the loop when your friends pick a spot
```

Actions:

- Enable: triggers the iOS notification permission prompt and registers the
  device token when allowed.
- Not now: dismisses and leaves a quiet enable option in settings/profile.

Notification taps route directly to the relevant Decision room when the user is
still eligible. If the room is expired, ended, blocked, or unavailable, Decision
shows a graceful unavailable state.

Add settings/profile controls for the four notification categories. Release
builds must not expose dev-only notification controls.

## Privacy And Abuse Contract

- Blocks enforce strict mutual invisibility for SSE, pushes, room viewing,
  joins, votes, messages, suggestions, and finalization.
- Ghost Mode does not hide explicit room participation or room notifications.
- Votes and swipes remain aggregate-only.
- SSE may show safe actor names for explicit visible actions such as messages,
  joins, suggestions, and final locks.
- SSE must not expose named vote lists.
- Push copy should avoid venue names until a future notification privacy pass.
- No raw provider records, raw coordinates, device tokens, service credentials,
  or APNs keys are returned to iOS.
- Missing APNs credentials in dev should disable real send or use mock/dev
  behavior, not crash the backend.

## Out Of Scope

- WebSockets.
- Realtime Friends feed.
- Live social presence.
- Typing indicators.
- Read receipts.
- Notification inbox/history.
- Global unread badges.
- Silent/background pushes.
- Contacts matching.
- Universal/deep links.
- Public/open rooms.
- Named vote display.
- Friend-influenced public recommendations.
- Apple Developer portal/key creation as an automated step. The code should
  prepare for APNs, and the manual Apple setup can follow with a focused
  checklist.

## Implementation Checkpoints

1. Fix swipe correctness and server-authoritative deck snapshots.
2. Add SSE event bus and current-room stream.
3. Add push device-token/preferences backend, mock sender, and APNs sender
   shell.
4. Add iOS notification permission, token registration, routing, and settings.
5. Add dev notification path, simulator walkthrough, docs, and final
   verification.

## Verification Requirements

Automated tests should prove:

- drag `onChanged` never commits a swipe;
- drag `onEnded` and buttons share one vote mutation path;
- cards progress deterministically and counters update from server snapshots;
- rewind only affects the viewer's most recent swiping-stage vote;
- rewind emits room updates;
- SSE access requires joined membership;
- SSE respects blocks, deleted users, expired rooms, and ended rooms;
- SSE events trigger snapshot refetch and survive reconnect fallback;
- notification preferences gate sends by category;
- blocks prevent sends to affected users;
- dev notification endpoints are unavailable in production;
- push payloads contain no venue names, coordinates, raw provider records, or
  named vote lists.

Full project verification after implementation:

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

Run the `verification-loop` skill after implementation and adapt its phases to
Nightloop's actual backend/root/iOS commands. The final report should include
builds, tests, security/diff review, and unresolved risks.

Manual verification must use Computer Use on the plain iPhone 17 Nightloop
simulator only. Do not touch the LoopVille simulator. The walkthrough should
cover:

- dev crew reset and sign-in as Chuck;
- Decision room entry;
- swipe hold without release;
- left/right release commits;
- button votes;
- deterministic card progression and cards-left counts;
- group progress updates;
- server-backed rewind;
- SSE live update behavior for message, suggestion, shortlist, and final plan
  where possible;
- push pre-permission sheet;
- notification preference controls;
- dev notification routing to a room;
- graceful unavailable room route;
- Friends still behaving as pull-refresh without new realtime presence.

## Success Bar

Phase 6D is successful when:

- swiping is reliable and deterministic;
- the current Decision room updates live through SSE;
- push infrastructure exists and is testable without real APNs credentials;
- permission ask and preference controls are in place;
- APNs manual setup can happen as a follow-up checklist;
- privacy boundaries remain intact;
- full backend/root/iOS verification and Computer Use simulator walkthrough
  pass.
