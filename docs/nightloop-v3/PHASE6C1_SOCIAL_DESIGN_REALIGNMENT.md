# Phase 6C.1 Social Design Realignment Checkpoint

Last updated: 2026-04-28

## Status

Phase 6C.1 realigns Friends and Decision with the v4 design direction:
Decision is deck-first and people-first, while Friends is activity-first.
This is still private, friend-scoped, tonight-only, pull-refresh social. No
realtime, APNs, contacts, public rooms, or friend-influenced public
recommendations were added.

Implemented:

- Decision rooms now have explicit stages: `swiping`, `shortlist_voting`, and
  `finalized`.
- Decision payloads expose a people-first `room_title`, stage capabilities,
  deck candidates, top-5 shortlist, recommended final candidate, and group
  progress/confidence.
- Swipe votes are limited to the swiping stage; shortlist votes are one winner
  per member and remain aggregate-only.
- Creator can force-unlock the shortlist and can lock the final plan from the
  shortlist stage.
- User-facing Decision UI is now active-room first: header, status strip,
  focused deck, group progress sheet, shortlist voting, final plan card,
  secondary room switcher/create/join/suggest/chat sheets.
- Public UI no longer asks users for raw room/session IDs. Short room codes are
  the share/join surface; IDs remain internal.
- Friends now leads with tonight activity groups and a lower compact timeline.
  Requests, invites, search, and friend management live in a management sheet.
- Friends "Pick a spot" opens Decision room creation with visible group friends
  preselected.
- Added `GET /api/v1/friends/tonight` for privacy-filtered venue/group cards.

## Privacy And Product Contract

- Blocks preserve strict mutual invisibility across Friends and Decision.
- Ghost mode hides ambient friend activity. Explicit room participation remains
  visible to room members.
- Friend activity and grouped Friends payloads never expose raw coordinates or
  raw provider records.
- Decision votes expose aggregate counts plus the viewer's own vote only. Named
  vote lists are not exposed.
- Finalized rooms freeze vote/suggest/remove mechanics. Chat, venue detail
  navigation, and "I'm Coming" remain available until expiry.
- "I'm Coming" remains attendance/social only and does not affect venue
  liveness or public recommendations.

## Backend Surface

New or extended routes:

- `POST /decision-sessions/join`
- `POST /decision-sessions/:id/advance-shortlist`
- `POST /decision-sessions/:id/shortlist-votes`
- `GET /friends/tonight`

Existing Decision routes remain stable. Responses gained optional fields, so
older clients should continue decoding the existing contract.

## Deferred

- True swipe gestures/animations beyond the deck-first button flow.
- Realtime/SSE/WebSocket updates.
- APNs/push prompts.
- Universal/deep links for room codes.
- Contacts matching.
- Public/open rooms.
- Member removal UI.
- Named vote display.
- Friend/social influence on public recommendations.

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

## Next Recommended Slice

Before Phase 6D realtime/push, do a simulator walkthrough with the seeded
social users and tune visual friction in Friends and Decision. Plan Mode is
recommended for Phase 6D because realtime, push, presence, or social influence
would reopen privacy and notification contracts.
