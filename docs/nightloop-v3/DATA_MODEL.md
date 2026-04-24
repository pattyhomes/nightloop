# Nightloop v3 Data Model

Last updated: 2026-04-24

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

Friend graph with accepted/pending/blocked status.

### friend_invites

Invite links and QR token targets.

### contact_match_jobs

Ephemeral hashed contact matching jobs. Do not store raw contacts.

### activity_events

Friend-visible feed/ticker events.

Important: event visibility must respect ghost mode, friendship status, and block lists.

### attendance_intents

"I'm Coming" state for friend groups.

### decision_sessions

Group voting session.

Important columns:

- `id`
- `creator_user_id`
- `market_id`
- `status`
- `expires_at`
- `created_at`

Default expiry is 12 hours.

### decision_session_members

Users invited/joined to a session.

### decision_votes

User vote per session and venue.

### device_push_tokens

APNs tokens and notification settings.

### moderation_reports

Reports against users, activity events, profiles, or venue content.

### blocked_users

User-level blocks.

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
