# Nightloop v3 API Contracts

Last updated: 2026-04-24

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

### GET /friends/activity

Returns friend activity visible to the current user, excluding users in ghost mode or blocked relationships.

### POST /friends/invite-link

Creates an invite link for adding friends.

### POST /friends/contacts-match

Request contains normalized phone hashes only.

### POST /friend-groups/:id/attendance

Toggles "I'm Coming" for a friend group and emits social activity plus push notification where enabled.

## Decision Sessions

### POST /decision-sessions

Creates a night-of group voting session.

Default TTL: 12 hours.

### GET /decision-sessions/:id

Returns session state, candidates, members, votes, and current counters.

### POST /decision-sessions/:id/votes

Request:

```json
{
  "venue_id": "venue-halcyon",
  "vote": "in"
}
```

Allowed `vote`: `skip`, `in`.

## Realtime

Use WebSocket or SSE for:

- venue live-state updates
- friends ticker
- attendance intents
- decision vote counters
- in-app notification events

Push payloads must not include sensitive personal or precise location data.

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
