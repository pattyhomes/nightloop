# Phase 6B.1 Social And Decision Hardening Checkpoint

Last updated: 2026-04-28

## Status

Phase 6A Friends and Phase 6B Decision are now backed by a repeatable local
smoke baseline plus a read-only audit. This pass did not add realtime, APNs,
contacts, universal links, public rooms, member removal, named votes, live
social presence, or friend-influenced public recommendations.

Implemented:

- `phase6:social-smoke` now validates its own seed output before reporting
  success.
- New read-only audit:
  `npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco`.
- Seed baseline proves:
  - 4 dev social profiles exist in SF.
  - Alex is accepted friends with Maya and Jules.
  - Alex strictly blocks the blocked smoke user.
  - Seeded signal activity, "I'm Coming", one reply, and one attendance intent
    are active for tonight.
  - Friend activity metadata contains no raw coordinates.
  - Decision rooms have at least 2 visible friends and 12+ approved candidate
    venues available.
- Friends tab invite cards now have a copy-code affordance for simulator/dev
  walkthroughs.
- Decision tab now shows a short room ID, copy-room-ID/copy-code affordances,
  and clearer join guidance.

Current local smoke output after reset:

- Market: `san-francisco`
- Venue: `1015 Folsom`
- Dev users: `dev_social_alex`, `dev_social_maya`, `dev_social_jules`,
  `dev_social_blocked`
- Approved decision candidates: `136`

## Commands

Reset and reseed the local dev social baseline:

```bash
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
```

Audit without mutating data:

```bash
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
```

Expected read-only success summary:

```text
Phase 6 social smoke audit passed for san-francisco.
Users: 4/4
Accepted smoke friendships: alex:jules, alex:maya
Decision candidates: 136
```

## Privacy Contract Rechecked

- Blocks remain strict mutual invisibility.
- Ghost mode is still ambient-social only; explicit decision participation is
  not hidden.
- Friend activity never stores or exposes raw coordinates.
- Decision votes remain aggregate-only plus viewer vote.
- Decision payloads continue to use safe venue/recommendation formatting.
- "I'm Coming" remains attendance/social activity only and does not affect
  liveness.

## Files

- `/Users/chuckclaw/projects/nightloop/backend/src/services/v1/socialSmokeAudit.ts`
- `/Users/chuckclaw/projects/nightloop/backend/src/scripts/seedPhase6SocialSmoke.ts`
- `/Users/chuckclaw/projects/nightloop/backend/src/scripts/auditPhase6SocialSmoke.ts`
- `/Users/chuckclaw/projects/nightloop/backend/test/phase6SocialSmokeAudit.test.ts`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/Features/FriendsShellView.swift`
- `/Users/chuckclaw/projects/nightloop/ios/Nightloop/Nightloop/Sources/Features/DecisionShellView.swift`

## Next Phase Recommendation

Phase 6C should be planned before implementation. The next product decision is:

- realtime/push, if the priority is making Friends and Decision feel alive at
  night, or
- richer group planning, if the priority is making private rooms more useful
  before notification/realtime complexity.

Recommendation: plan Phase 6C in Plan Mode with xhigh reasoning if choosing
realtime, APNs, contacts, public rooms, live social presence, or social
influence on recommendations. Those choices change privacy and data contracts.
