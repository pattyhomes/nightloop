# Phase 6 Dev Social Crew

Last updated: 2026-04-28

## Purpose

Use this local-only development crew to test Friends and Decision screens with
real Supabase Auth sessions plus seeded Nightloop social data. This is not a
TestFlight, App Store reviewer, or production demo account setup.

## Debug Presets

All preset users use the shared local dev password Chuck chose during planning.

- Chuck: `test@dev.com`, username `chuck`, primary simulator account.
- Alex: `alex@dev.com`, username `dev_social_alex`.
- Maya: `maya@dev.com`, username `dev_social_maya`.
- Jules: `jules@dev.com`, username `dev_social_jules`.
- Blocked: `blocked@dev.com`, username `dev_social_blocked`.
- Nia/Theo are request-state fixtures used by the seed, available through the
  backend response but not shown as primary iOS preset buttons.

## How To Use

In a DEBUG simulator build:

1. Open `Developer testing` from the auth screen.
2. Tap `Reset + Sign In as Chuck`.
3. Use Friends and Decision with the seeded graph.
4. To test the other side of a flow, sign out and tap Alex, Maya, Jules, or
   Blocked from the same Dev crew card.

The reset button calls:

```bash
POST /api/v1/dev/social-crew/reset
```

The route is unavailable in production and uses the backend Supabase service
role server-side to create confirmed email users. iOS never receives a service
role key, DB URL, provider key, raw provider payload, or raw coordinates.

## Seeded State

- Chuck is accepted friends with Alex, Maya, and Jules.
- Chuck has one incoming and one outgoing pending friend request.
- Chuck and Alex both have a strict blocked-user case.
- Visible tonight activity, a reply, an attendance intent, one open Decision
  room, and one finalized Decision room are created for walkthroughs.
- The existing terminal smoke command remains available:

```bash
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
```
