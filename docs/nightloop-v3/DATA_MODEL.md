# Nightloop v3 Data Model

Last updated: 2026-04-28

This is the target data model for Phase 1 and Phase 2. It is intentionally not a migration yet; SQL migrations should be written in Phase 1 after the Supabase project is confirmed.

## Existing Tables To Preserve

- `venues`
- `signals`
- `reports`
- `recommendation_snapshots`

These tables need market-aware extensions rather than replacement.

## Core New Tables

### markets

First-class city/region launch unit.

Important columns:

- `id uuid primary key`
- `slug text unique not null`
- `display_name text not null`
- `short_label text not null`
- `timezone text not null`
- `country_code char(2) not null`
- `center_latitude double precision not null`
- `center_longitude double precision not null`
- `bounds jsonb not null default '{}'`
- `default_zoom numeric`
- `launch_status text not null`
- `mapbox_style_uri text`
- `provider_config jsonb not null default '{}'`
- `created_at timestamptz`
- `updated_at timestamptz`

### market_neighborhoods

Neighborhood labels/polygons per market.

### users

Nightloop app user mapped to Supabase Auth identity.

Important columns:

- `id uuid primary key`
- `auth_user_id uuid unique not null`
- `eligibility_status text not null`
- `age_attested_at timestamptz`
- `deleted_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

### user_profiles

User-facing profile fields.

- `user_id uuid primary key references users(id)`
- `display_name text not null`
- `username text unique not null`
- `selected_market_id uuid references markets(id)`
- `avatar_kind text not null default 'initials'`
- `bio text`

### user_settings

Privacy, notifications, map preferences.

Columns include:

- `ghost_mode boolean not null default false`
- `map_show_neighborhood_labels boolean not null default true`
- `map_show_street_grid boolean not null default true`
- `push_social_enabled boolean not null default true`
- `push_decision_enabled boolean not null default true`
- `push_favorite_venue_alerts_enabled boolean not null default false`

### user_preferences

Onboarding picks grouped by category.

- `user_id`
- `category`
- `preference_key`

Unique on `(user_id, category, preference_key)`.

### venue_live_states

Current materialized venue state used by Home/Map/Detail.

Columns include:

- `venue_id`
- `market_id`
- `pulse_level`
- `energy_score`
- `energy_label`
- `trend`
- `wait_minutes`
- `signal_count`
- `recent_signal_count`
- `confidence`
- `last_signal_at`
- `expires_at`
- `computed_at`
- `source_summary jsonb`

### venue_trend_buckets

Time-series bars for the Venue Detail live trend chart.

### venue_assets

Provider/manual venue images with provenance and license metadata.

### provider_records

Raw or normalized provider payload tracking:

- provider name
- provider venue/event ID
- market
- venue match
- raw payload
- confidence
- imported_at
- license/attribution fields

### events

Nightlife event data linked to venues and markets.

### friendships

Friend graph request/accept state.

Important columns:

- `id uuid primary key`
- `requester_user_id uuid references users(id)`
- `addressee_user_id uuid references users(id)`
- `status text`: `pending`, `accepted`, or `declined`
- `responded_at timestamptz`
- unique unordered requester/addressee pair

### friend_invites

Expiring in-app invite code backing for QR/manual code entry.

Important columns:

- `id uuid primary key`
- `user_id uuid references users(id)`
- `token_hash text unique not null`
- `code_hint text not null`
- `expires_at timestamptz not null`
- `revoked_at timestamptz`
- `accepted_count integer`
- `metadata jsonb`

Plaintext invite codes are not stored.

### contact_match_jobs

Deferred. Do not add contacts matching until a separate privacy review. If
implemented later, jobs must be ephemeral and hash-only; never store raw
contacts.

### activity_events

Friend-visible feed/ticker events.

Important columns:

- `actor_user_id uuid references users(id)`
- `target_user_id uuid references users(id)`
- `venue_id uuid references venues(id)`
- `market_id uuid references markets(id)`
- `parent_activity_id uuid references activity_events(id)`
- `source_signal_id uuid references signals(id)`
- `type text`: `signal`, `coming`, `comment`, or `emoji_signal`
- `visibility text`: `friends`
- `signal_kind text`
- `text text` with 140 character max
- `expires_at timestamptz`
- `metadata jsonb`

Friend activity must respect ghost mode, accepted friendship, expiry, and block
lists. Signal-derived activity is sanitized and must not expose raw coordinates
or structured signal details.

### attendance_intents

"I'm Coming" state for friend groups.

Important columns:

- `user_id uuid references users(id)`
- `venue_id uuid references venues(id)`
- `market_id uuid references markets(id)`
- `status text`: `active` or `cancelled`
- `activity_id uuid references activity_events(id)`
- `expires_at timestamptz`

Attendance intents do not count as live signals or liveness evidence.

### decision_sessions

Private friend-scoped group voting session.

Important columns:

- `id uuid primary key`
- `creator_user_id uuid references users(id)`
- `market_id uuid references markets(id)`
- `status text`: `active`, `ended`, or `expired`
- `token_hash text unique`
- `code_hint text`
- `code_revoked_at timestamptz`
- `filters jsonb`
- `metadata jsonb`
- `expires_at timestamptz`
- `ended_at timestamptz`
- `created_at`

Plaintext session codes are not stored. Expiry is the market nightlife-day end.

### decision_session_members

Users invited/joined to a session.

Important columns:

- `session_id uuid references decision_sessions(id)`
- `user_id uuid references users(id)`
- `role text`: `creator` or `member`
- `status text`: `invited` or `joined`
- `source text`: `creator`, `invited`, or `code`
- `joined_at timestamptz`

Only joined members affect group fit. Invited-but-not-joined members do not.

### decision_session_candidates

Fixed candidate slate for a decision session.

Important columns:

- `session_id uuid references decision_sessions(id)`
- `venue_id uuid references venues(id)`
- `original_rank integer`
- `base_score numeric`
- `snapshot jsonb`

Snapshots store safe venue/recommendation payloads only. Do not store raw
provider payloads or raw provider records in candidate snapshots.

### decision_votes

User vote per session and venue.

Important columns:

- `session_id uuid references decision_sessions(id)`
- `candidate_id uuid references decision_session_candidates(id)`
- `user_id uuid references users(id)`
- `vote text`: `in` or `skip`

Votes are exposed to clients only as aggregate counts plus the viewer's own
vote. Do not expose named voter lists in Phase 6B.

### device_push_tokens

APNs tokens and notification settings.

### moderation_reports

Reports against users, activity events, profiles, or venue content.

### blocked_users

User-level blocks.

Strict mutual invisibility source. Creating a block removes friendship/request
state between the two users.

### audit_logs

Admin and security-sensitive actions.

## Venue Extensions

Add to `venues`:

- `market_id uuid references markets(id)`
- `canonical_type text`
- `is_active boolean default true`
- `admin_status text`

Keep city/state/country columns for compatibility, but do not use them as the primary market abstraction.

## Signal Extensions

Add user-facing fields to `signals` or introduce a companion table:

- `user_id`
- `kind`
- `points_awarded`
- `trust_weight`
- `expires_at`

The existing `signal_type` and `signal_value` can continue serving scoring internals.

## RLS And Access Model

Supabase Auth tables and any Supabase-exposed app tables must have RLS enabled.

General policy intent:

- Users can read/update their own profile/settings.
- Public profile search exposes only safe profile fields.
- Friends can see friend-visible activity only when not blocked and when ghost mode allows it.
- Admin access goes through backend/admin roles, not anonymous client access.
- Backend service role is server-only.

## Deletion And Retention

Account deletion should:

- Delete/anonymize profile, settings, friend graph, device tokens, and personally linked activity.
- Retain aggregate venue signal value only after identity is removed.
- Preserve moderation/audit records where legally/operationally necessary, with user identity minimized.

## Indexing Priorities

- `venues(market_id, location_geog)`
- `venues(market_id, slug)`
- `venue_live_states(market_id, pulse_level, computed_at desc)`
- `signals(venue_id, observed_at desc)`
- `signals(user_id, observed_at desc)`
- `activity_events(user_id, created_at desc)`
- `activity_events(market_id, created_at desc)`
- `friendships(user_id, friend_user_id)`
- `decision_sessions(expires_at)`
- `decision_votes(session_id, venue_id)`
