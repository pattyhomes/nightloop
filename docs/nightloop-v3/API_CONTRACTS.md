# Nightloop v3 API Contracts

Last updated: 2026-04-28

Base path: `/api`

All protected endpoints require a Supabase access token in:

```http
Authorization: Bearer <supabase-access-token>
```

Errors use this envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message.",
    "details": {
      "field": "example"
    }
  }
}
```

## Auth Boundary

Supabase handles phone OTP and Sign in with Apple. Express verifies JWTs and maps `auth.uid`/token subject to a Nightloop user/profile.

The iOS app receives a Supabase session from Supabase Auth, then uses the access token for Express API calls.

## Account And Profile

### GET /me

Returns current account, eligibility, profile, settings, and onboarding state.

```json
{
  "user": {
    "id": "uuid",
    "auth_user_id": "supabase-user-id",
    "eligibility_status": "eligible",
    "created_at": "2026-04-24T00:00:00Z"
  },
  "profile": {
    "display_name": "Alex",
    "username": "alexsf",
    "avatar_kind": "initials",
    "bio": null,
    "selected_market_id": "market-sf"
  },
  "settings": {
    "ghost_mode": false,
    "map_show_neighborhood_labels": true,
    "map_show_street_grid": true,
    "push_social_enabled": true,
    "push_decision_enabled": true,
    "push_favorite_venue_alerts_enabled": false
  },
  "onboarding": {
    "status": "complete",
    "missing_steps": []
  }
}
```

### POST /me/age-attestation

Stores self-attested 21+ eligibility after auth.

Request:

```json
{
  "is_21_or_over": true
}
```

If false, the API stores minimal ineligible state and blocks protected app features except sign out and account deletion.

### PATCH /me/profile

Request:

```json
{
  "display_name": "Alex",
  "username": "alexsf",
  "selected_market_id": "market-sf",
  "bio": "Optional"
}
```

### PATCH /me/settings

Request:

```json
{
  "ghost_mode": true,
  "map_show_neighborhood_labels": true,
  "map_show_street_grid": false,
  "push_favorite_venue_alerts_enabled": true
}
```

### DELETE /me/account

Initiates account deletion. Deletes or anonymizes profile, settings, social graph, device tokens, and personally linked content while retaining aggregate venue signals only after identity removal.

Response:

```json
{
  "status": "accepted",
  "message": "Account deletion has started."
}
```

## Markets

### GET /markets

Returns launch markets and selectable future markets.

```json
{
  "items": [
    {
      "id": "market-sf",
      "slug": "san-francisco",
      "display_name": "San Francisco",
      "short_label": "SF",
      "timezone": "America/Los_Angeles",
      "launch_status": "active",
      "center": {
        "latitude": 37.773972,
        "longitude": -122.431297
      }
    }
  ]
}
```

### GET /markets/:id/config

Returns map, provider, and neighborhood config for the selected market.

## Onboarding Preferences

### GET /me/preferences

Returns selected preference keys grouped by category.

### PUT /me/preferences

Request:

```json
{
  "vibe": ["dance", "queer", "wild"],
  "music": ["house", "hiphop", "afro"],
  "crowd": ["locals", "twenties", "queer"],
  "neighborhoods": ["mission", "soma", "castro"]
}
```

Each category must include at least three picks in the native onboarding flow. Backend validation should also reject incomplete onboarding writes.

## Venues And Feed

### GET /venues

Query:

- `market_id` required
- `lat` optional
- `lng` optional
- `radius_km` default `8`
- `pulse` optional: `chill|active|packed`
- `friends_only` optional boolean
- `q` optional
- `limit` default `30`
- `cursor` optional

Response:

```json
{
  "generated_at": "2026-04-24T04:00:00Z",
  "market": {
    "id": "market-sf",
    "short_label": "SF"
  },
  "items": [
    {
      "id": "venue-halcyon",
      "slug": "halcyon",
      "name": "Halcyon",
      "market_id": "market-sf",
      "neighborhood": "SoMa",
      "category": "club",
      "coordinate": {
        "latitude": 37.775125,
        "longitude": -122.410482
      },
      "distance_miles": 0.8,
      "pulse": {
        "level": 3,
        "label": "Packed",
        "score": 82
      },
      "trend": "steady",
      "wait_minutes": 15,
      "signal_count": 38,
      "recent_signal_count": 12,
      "confidence": "high",
      "event": {
        "title": "Black Coffee b2b",
        "starts_at": "2026-04-25T05:00:00Z"
      },
      "friend_summary": {
        "friends_here_count": 3,
        "first_friend_name": "Maya"
      },
      "image": {
        "url": "https://example.com/halcyon.jpg",
        "attribution": "Provider"
      },
      "why_short": "Packed right now, strong match for house and dance floor."
    }
  ],
  "counts": {
    "all": 23,
    "packed": 7,
    "active": 14,
    "chill": 2,
    "friends": 4
  },
  "next_cursor": null
}
```

### GET /venues/:id

Returns detail payload for Venue Detail.

Important display rule: energy is shown as number plus label, such as `82 - Packed`, not `82/100`.

## Signals

### POST /signals

Request:

```json
{
  "venue_id": "venue-halcyon",
  "kind": "packed",
  "observed_at": "2026-04-24T04:01:00Z"
}
```

Allowed `kind` values:

- `packed`
- `short_line`
- `long_line`
- `dead`
- `event_live`

Response:

```json
{
  "signal_id": "uuid",
  "venue_id": "venue-halcyon",
  "points_awarded": 3,
  "new_signal_scout_points": 921
}
```

Server behavior:

- Authenticate user.
- Rate-limit submissions.
- Apply user trust weighting.
- Persist raw signal.
- Recompute or enqueue live-state aggregation.
- Enforce 90-minute default decay server-side.

## Friends And Presence

Phase 6A implements friend graph and tonight-only activity. It does not include
contacts matching, APNs push, universal links, realtime presence, or
friend-influenced recommendations.

Privacy rules:

- Profiles are searchable by display name and username by default.
- Blocks create strict mutual invisibility and cancel friendship/request state.
- Ghost mode hides social activity/presence only, not profile search.
- Signal auto-share is sanitized to venue, signal kind, actor, and time.
- Friend activity expires at the market nightlife-day end.
- "I'm Coming" is not a live signal and does not affect venue liveness.

### GET /friends

Returns accepted friends, incoming requests, and outgoing requests.

```json
{
  "friends": [
    {
      "user": {
        "id": "user-maya",
        "display_name": "Maya",
        "username": "maya",
        "avatar_kind": "initials",
        "bio": null
      },
      "friendship": {
        "id": "friendship-1",
        "status": "accepted",
        "direction": "outgoing",
        "requester_user_id": "user-alex",
        "addressee_user_id": "user-maya",
        "responded_at": "2026-04-28T00:00:00Z",
        "created_at": "2026-04-28T00:00:00Z",
        "updated_at": "2026-04-28T00:00:00Z"
      }
    }
  ],
  "incoming_requests": [],
  "outgoing_requests": []
}
```

### GET /friends/search

Query:

- `q` required, at least 2 characters
- `limit` optional, max 30

Returns safe profile fields plus current friendship state. Excludes self,
deleted users, and blocked relationships.

### Friend Requests

`POST /friends/requests`

```json
{
  "user_id": "user-maya"
}
```

`POST /friends/requests/:id/accept`

`POST /friends/requests/:id/decline`

`DELETE /friends/requests/:id`

`DELETE /friends/:userId`

### Blocks

`GET /friends/blocks`

`POST /friends/blocks`

```json
{
  "user_id": "user-maya"
}
```

`DELETE /friends/blocks/:userId`

### Invites

`POST /friends/invites`

Creates a 7-day reusable invite code. The database stores a hash and code hint;
the plaintext code is returned only at creation.

```json
{
  "invite": {
    "id": "invite-1",
    "code": "NL-ABCD-2345",
    "code_hint": "2345",
    "expires_at": "2026-05-05T00:00:00Z",
    "revoked_at": null,
    "created_at": "2026-04-28T00:00:00Z"
  }
}
```

`DELETE /friends/invites/:id`

`POST /friends/invites/accept`

```json
{
  "code": "NL-ABCD-2345"
}
```

### GET /friends/activity

Returns friend activity visible to the current user, excluding users in ghost mode or blocked relationships.

```json
{
  "items": [
    {
      "id": "activity-1",
      "type": "signal",
      "signal_kind": "packed",
      "text": null,
      "actor": {
        "id": "user-maya",
        "display_name": "Maya",
        "username": "maya",
        "avatar_kind": "initials",
        "bio": null
      },
      "venue": {
        "id": "venue-halcyon",
        "name": "Halcyon",
        "neighborhood": "SoMa",
        "category": "club"
      },
      "viewer_has_coming": false,
      "coming_count": 1,
      "replies": [],
      "expires_at": "2026-04-29T11:00:00Z",
      "created_at": "2026-04-28T00:00:00Z"
    }
  ]
}
```

### POST /friends/venues/:venueId/coming

Request:

```json
{
  "is_coming": true
}
```

When `is_coming` is false, the active attendance intent is cancelled.

### POST /friends/activity/:id/replies

Request for a text reply:

```json
{
  "kind": "comment",
  "text": "got a booth"
}
```

Request for an emoji signal reply:

```json
{
  "kind": "emoji_signal",
  "signal_kind": "short_line"
}
```

Text replies are max 140 characters and require friendship with the activity
actor.

### Reports

`POST /friends/activity/:id/report`

`POST /friends/profiles/:userId/report`

Request:

```json
{
  "reason": "inappropriate"
}
```

## Decision Sessions

Phase 6B-6D implements private friend-scoped group decision rooms. Realtime is
limited to the currently viewed Decision room through SSE, and push is limited
to private room notifications. It does not include contacts, universal links,
public rooms, named vote display, live social presence, realtime Friends feed,
notification inbox, or recommendation influence.

Privacy rules:

- Creator-selected accepted friends can join without a code.
- A session code works only for accepted friends of current joined members.
- Blocks prevent visibility, joining, and voting.
- Ghost mode does not hide explicit session participation.
- Votes expose aggregate counts and the viewer's own vote only.
- Candidate payloads reuse safe venue/recommendation formatting and must not
  expose raw provider records.

### GET /decision-sessions

Returns rooms visible to the viewer.

### POST /decision-sessions

Creates a night-of group voting session. The candidate slate is fixed to 12
venues selected from recommendations at creation time.

Request:

```json
{
  "market_id": "market-sf",
  "invited_user_ids": ["user-maya"],
  "filters": {
    "neighborhood": "SoMa",
    "category": "club",
    "pulse": "active"
  }
}
```

Session expiry is the market nightlife-day end, around 4am local time.

Response:

```json
{
  "session": {
    "id": "session-1",
    "status": "active",
    "market": {
      "id": "market-sf",
      "slug": "san-francisco",
      "short_label": "SF"
    },
    "code": "ND-ABCD-2345",
    "code_hint": "2345",
    "code_revoked_at": null,
    "member_counts": {
      "joined": 1,
      "invited": 1
    },
    "viewer_role": "creator",
    "viewer_status": "joined",
    "expires_at": "2026-04-29T11:00:00Z"
  },
  "candidates": [
    {
      "id": "candidate-1",
      "venue_id": "venue-halcyon",
      "original_rank": 1,
      "venue": {},
      "recommendation": {},
      "in_count": 0,
      "skip_count": 0,
      "viewer_vote": null,
      "group_fit_score": 72.5,
      "group_fit_member_count": 1,
      "group_fit_reason": "Group fit is based on the creator's saved picks."
    }
  ],
  "leader": null
}
```

### GET /decision-sessions/:id

Returns session state, fixed candidates, aggregate votes, viewer vote, group fit
reason, and the soft leader. It does not expose named votes.

The response may include `session.deck_state`:

```json
{
  "deck_size": 8,
  "cards_total": 8,
  "cards_remaining": 6,
  "next_candidate_id": "candidate-3",
  "last_swiped_candidate_id": "candidate-2",
  "can_rewind": true
}
```

### GET /decision-sessions/:id/events

Server-sent event stream for the currently viewed room. Requires authenticated,
eligible, joined membership in an active visible room.

Events are invalidation-style and safe for private room UI refreshes. Vote and
progress events do not expose actor identity, vote value, or candidate ids.

### POST /decision-sessions/:id/rewind

Rewinds the viewer's latest swiping-stage deck vote only. It is disabled after
shortlist voting, finalization, ending, or expiry.

### POST /decision-sessions/:id/join

Invited members can join with an empty body. Friends of joined members can join
with the session code.

```json
{
  "code": "ND-ABCD-2345"
}
```

### POST /decision-sessions/:id/votes

Request:

```json
{
  "candidate_id": "candidate-1",
  "vote": "in"
}
```

Allowed `vote`: `skip`, `in`. `venue_id` is also accepted for clients that do
not have the candidate id.

### Notification Device Tokens

`POST /me/device-tokens`

Registers an iOS APNs token for the authenticated user/device. Response payloads
never include the raw token or token hash.

`DELETE /me/device-tokens`

Revokes the current device token for this account.

### Notification Preferences

`GET /me/notification-preferences`

`PATCH /me/notification-preferences`

Supported room notification preference fields:

- `room_invites_enabled`
- `shortlist_ready_enabled`
- `final_plan_locked_enabled`
- `room_messages_enabled`

Push copy remains privacy-conscious and does not include venue names in Phase
6D.

### POST /decision-sessions/:id/revoke-code

Creator-only. Existing joined members remain in the room.

### POST /decision-sessions/:id/end

Creator-only. Ended sessions reject joins and votes.

## Realtime

Phase 6D uses SSE only for the currently viewed Decision room. Friends, venue
live-state updates, global unread counts, and broad social streams remain
pull-refresh or deferred.

Push payloads must not include sensitive personal data, venue names, raw
provider records, raw coordinates, named vote lists, device tokens, or secrets.

## Admin/Ops

Admin endpoints must be protected by explicit admin roles:

- markets and venue curation
- provider imports
- event reconciliation
- moderation queue
- audit log search
- reviewer account seeding
- feature flags
- notification template management
