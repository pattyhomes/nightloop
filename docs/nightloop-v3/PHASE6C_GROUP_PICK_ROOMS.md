# Phase 6C Group Pick Rooms Checkpoint

Last updated: 2026-04-28

## Status

Phase 6C upgrades private Decision rooms from vote-only slates into useful
"pick tonight" rooms while keeping the Phase 6 boundary conservative.

Implemented:

- Migration `011_phase6c_group_pick_rooms.sql`.
- Suggested room candidates with source attribution, suggester attribution,
  removal permissions, a 6-suggestion cap, and automatic `in` vote upsert.
- Creator-locked final plan with optional meetup time and 140-character note.
- Tiny room chat with text and emoji messages, 140-character text limit,
  reporting, expiry at room expiry, and deleted-user anonymization.
- Backend routes for venue search, suggest/remove, finalize, message, and
  report-message actions.
- Account deletion cleanup/anonymization for Phase 6C suggestion/message/final
  attribution.
- Phase 6 smoke seed/audit coverage for an open room, a finalized room,
  suggested candidate, messages, and frozen finalized-room mechanics.
- iOS Decision tab support for final plan card, suggestion search, suggested
  candidate remove, creator finalize, and tiny chat.

## Product Boundary

Rooms remain:

- private and friend-scoped;
- tonight-only, expiring at the market nightlife-day end;
- pull-refresh/on-appear refreshed;
- aggregate-vote only;
- free of raw provider payloads, coordinates, contacts matching, universal
  links, push prompts, realtime presence, and public room behavior.

Finalizing a room freezes voting, suggestions, and suggested-candidate removal.
Chat and the existing "I'm Coming" attendance CTA remain available until the
room expires. There is no unlock/change-final-pick flow in Phase 6C; creator
can end the room and create a new one.

## Backend Surface

Protected routes under `/api/v1`:

- `GET /decision-sessions/:id/venue-search?q=&limit=`
- `POST /decision-sessions/:id/candidates`
- `DELETE /decision-sessions/:id/candidates/:candidateId`
- `POST /decision-sessions/:id/finalize`
- `POST /decision-sessions/:id/messages`
- `POST /decision-sessions/:id/messages/:messageId/report`

Existing Decision routes remain stable and responses only gained optional
fields:

- `session.final_plan`
- `session.capabilities`
- candidate `source`, `suggested_by`, `suggested_at`, `can_remove`
- `messages`

## Privacy And Abuse Contract

- Joined members only can search, suggest, vote, message, or finalize.
- Suggestions are limited to approved public venues in the room market.
- Blocks preserve strict invisibility and prevent room visibility and actions.
- Message reports create moderation rows with target type `decision_message`.
- Deleted users are shown as deleted/anonymized attribution until expiry.
- Votes expose aggregate `in`/`skip` counts and viewer vote only. No named vote
  lists are exposed.

## Deferred

- Realtime/WebSocket/SSE room updates.
- APNs/push.
- Universal/deep links.
- Contacts matching.
- Public/open rooms.
- Member removal UI.
- Named vote display.
- Final-plan unlock/change flow.
- Friend-influenced public recommendations.
- Live social presence.

## Verification

Run before treating Phase 6C as fully ready:

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

Phase 6D should be a fresh Plan Mode/xhigh decision. The most likely branches:

- realtime/push for room and friend updates; or
- richer planning polish, such as nicer meetup time controls, room-level notes,
  and a dev-user simulator walkthrough to tune friction before realtime.
