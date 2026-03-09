-- Nightloop MVP schema (PostgreSQL)
create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text unique,
  school text,
  home_lat numeric(9,6),
  home_lng numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  neighborhood text,
  address text,
  canonical_type text not null check (canonical_type in ('club','bar','lounge','hybrid')),
  price_band text check (price_band in ('$','$$','$$$','$$$$')),
  music_genres text[] default '{}',
  hours_json jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_venues_geo on venues (lat, lng);
create index if not exists idx_venues_type on venues (canonical_type);

create table if not exists venue_tags (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references venues(id) on delete cascade,
  tag_key text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source_mix jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (venue_id, tag_key)
);

create table if not exists favorites (
  user_id uuid not null references users(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  crowd_level text not null check (crowd_level in ('low','medium','high','packed')),
  line_wait_bin text not null check (line_wait_bin in ('none','short','moderate','long')),
  vibe_tags text[] default '{}',
  note_text text,
  photo_url text,
  moderation_state text not null default 'pending' check (moderation_state in ('pending','accepted','rejected','shadowed')),
  quality_score numeric(4,3) check (quality_score >= 0 and quality_score <= 1),
  created_at timestamptz not null default now()
);
create index if not exists idx_reports_venue_created on reports (venue_id, created_at desc);

create table if not exists user_trust (
  user_id uuid primary key references users(id) on delete cascade,
  trust_score numeric(4,3) not null default 0.500 check (trust_score >= 0 and trust_score <= 1),
  reports_count int not null default 0,
  last_updated timestamptz not null default now()
);

create table if not exists venue_live_state (
  venue_id uuid primary key references venues(id) on delete cascade,
  crowd_level text check (crowd_level in ('low','medium','high','packed')),
  line_wait_bin text check (line_wait_bin in ('none','short','moderate','long')),
  status_confidence numeric(4,3) check (status_confidence >= 0 and status_confidence <= 1),
  report_count_window int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists venue_summaries (
  venue_id uuid primary key references venues(id) on delete cascade,
  summary_short text not null,
  bullets jsonb not null default '[]'::jsonb,
  model_version text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
