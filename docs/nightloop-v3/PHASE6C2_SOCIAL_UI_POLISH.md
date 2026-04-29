# Phase 6C.2 Social UI Polish

Last updated: 2026-04-29

## Purpose

Phase 6C.2 polishes Nightloop's social surfaces into a premium nightlife
utility: sleek, energetic, refined, and fast. The first implementation target is
Decision, Friends, and the shared bottom navigation/components they rely on.
Home, Map, Venue Detail, and Profile should keep their current behavior unless a
shared primitive naturally improves them.

## Design Sources

- Figma Make file: `/Users/chuckclaw/Downloads/Nightloop (1).make`
  - file key: `4DQ6yq2GMasckxw966TLZD`
  - use for visual structure, premium card hierarchy, near-black surfaces, and
    refined nightlife energy.
- Claude v4 direction and current Phase 6 docs
  - use for product breadth, privacy boundaries, truthfulness, off-hours rules,
    and the actual Nightloop feature set.
- Current SwiftUI app
  - preserve existing backend-mediated architecture, Supabase Auth identity
    model, and Phase 5 trust/liveness contracts.

When sources disagree, Figma wins for look/feel/polish and Claude/current docs
win for product rules, privacy, and truthful state.

## Visual Direction

- Premium nightlife utility, not playful social toy or luxury concierge.
- Deeper near-black base, cleaner premium cards, fewer nested containers, and
  stronger but controlled purple/pink/green active lighting.
- Energy should come from light, motion, hierarchy, and venue-forward imagery or
  refined abstract fallbacks.
- Typography should be tighter inside cards. Avoid oversized competing labels
  and dashboard-like rows unless the user is comparing compact data.
- The center Decision tab stays prominent, but should feel sleeker and more
  intentional than a large toy-like orb.

## Decision Direction

- Active rooms should be deck-first.
- The primary card should show venue art/fallback, venue name, one strong
  verdict/reason, liveness/energy/social chips, and minimal supporting detail.
- Swipe right means "I'm in"; swipe left means "Skip".
- Swipes commit, with a small rewind button to restore the previous card.
- Buttons under the card mirror the gesture and scale/glow as the drag moves.
- Details, suggestions, room switching, chat, and creator controls belong in
  refined sheets or compact trays, not inline above the deck.
- Shortlist and finalized states remain, but should feel like results and a
  locked plan rather than a management table.

## Friends Direction

- Venue/group cards are the main feed unit.
- Each card should answer who is going, where, why it matters tonight, and what
  the viewer can do next.
- Direct actions: "I'm Coming" and "Pick a spot".
- Add a compact reaction button that expands into a vertical selector with a few
  nightlife-relevant reactions.
- Replies, reports, mini profiles, search, invites, requests, and management
  should live in polished sheets.
- The lower individual timeline is secondary context and should be compact.

## Backend Boundary

Prefer existing API contracts. Add backend support only when the polished UI
genuinely needs it, such as durable reaction summaries or rewind support that
cannot be reliable locally. Do not add realtime, push, contacts, public rooms,
named vote lists, raw provider records, raw coordinates, or social influence on
public recommendations.

## Verification

Run the full checkpoint before committing implementation:

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

Simulator walkthrough target: dev login, Friends cards/reactions/sheets,
Decision swipe/rewind/shortlist/final plan, refined nav, and no LoopVille
simulator disruption.
