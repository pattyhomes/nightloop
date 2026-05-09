-- Phase 1 backend foundation for Nightloop v3.
-- Idempotent for the dedicated Supabase development project.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  short_label TEXT NOT NULL,
  timezone TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  center_latitude DOUBLE PRECISION NOT NULL,
  center_longitude DOUBLE PRECISION NOT NULL,
  bounds JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_zoom NUMERIC,
  launch_status TEXT NOT NULL DEFAULT 'preview',
  mapbox_style_uri TEXT,
  provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country_code CHAR(2),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location_geog GEOGRAPHY(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  location_geom GEOMETRY(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  market_id UUID REFERENCES markets(id),
  canonical_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  admin_status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venues_lat_range CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT venues_lon_range CHECK (longitude >= -180 AND longitude <= 180)
);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS canonical_type TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS admin_status TEXT NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  signal_value DOUBLE PRECISION,
  confidence NUMERIC(5,4),
  observed_at TIMESTAMPTZ NOT NULL,
  source TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID,
  kind TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  trust_weight NUMERIC(6,4) NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT signals_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trust_weight NUMERIC(6,4) NOT NULL DEFAULT 1;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  reporter_id TEXT,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  notes TEXT,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  rank INTEGER,
  score NUMERIC(6,5) NOT NULL,
  rationale TEXT,
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  enrichment_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_enrichments_venue_source_uq UNIQUE (venue_id, source)
);

CREATE TABLE IF NOT EXISTS market_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  label_latitude DOUBLE PRECISION,
  label_longitude DOUBLE PRECISION,
  polygon JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_neighborhoods_market_slug_uq UNIQUE (market_id, slug)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'unknown',
  age_attested_at TIMESTAMPTZ,
  signal_scout_points INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  selected_market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
  avatar_kind TEXT NOT NULL DEFAULT 'initials',
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ghost_mode BOOLEAN NOT NULL DEFAULT false,
  map_show_neighborhood_labels BOOLEAN NOT NULL DEFAULT true,
  map_show_street_grid BOOLEAN NOT NULL DEFAULT true,
  push_social_enabled BOOLEAN NOT NULL DEFAULT true,
  push_decision_enabled BOOLEAN NOT NULL DEFAULT true,
  push_favorite_venue_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category, preference_key)
);

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS venue_live_states (
  venue_id UUID PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  pulse_level INTEGER NOT NULL DEFAULT 1,
  energy_score INTEGER NOT NULL DEFAULT 28,
  energy_label TEXT NOT NULL DEFAULT 'Chill',
  trend TEXT NOT NULL DEFAULT 'steady',
  wait_minutes INTEGER,
  signal_count INTEGER NOT NULL DEFAULT 0,
  recent_signal_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  last_signal_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_trend_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  energy_score INTEGER NOT NULL,
  pulse_level INTEGER NOT NULL,
  signal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_trend_buckets_venue_bucket_uq UNIQUE (venue_id, bucket_start)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signals_user_id_fkey'
  ) THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_eligibility_status_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_eligibility_status_check
      CHECK (eligibility_status IN ('unknown', 'eligible', 'ineligible'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signals_kind_check'
  ) THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_kind_check
      CHECK (kind IS NULL OR kind IN ('packed', 'short_line', 'long_line', 'dead', 'event_live'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_markets_slug ON markets (slug);
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues (name);
CREATE INDEX IF NOT EXISTS idx_venues_city_state ON venues (city, state);
CREATE INDEX IF NOT EXISTS idx_venues_market_id ON venues (market_id);
CREATE INDEX IF NOT EXISTS idx_venues_market_slug ON venues (market_id, slug);
CREATE INDEX IF NOT EXISTS idx_venues_location_geog ON venues USING GIST (location_geog);
CREATE INDEX IF NOT EXISTS idx_venues_location_geom ON venues USING GIST (location_geom);
CREATE INDEX IF NOT EXISTS idx_signals_venue_id ON signals (venue_id);
CREATE INDEX IF NOT EXISTS idx_signals_type_observed_at ON signals (signal_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_observed_at ON signals (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user_observed_at ON signals (user_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_venue_expires_at ON signals (venue_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_venue_id ON reports (venue_id);
CREATE INDEX IF NOT EXISTS idx_reports_status_reported_at ON reports (status, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_snapshots_snapshot_id_rank ON recommendation_snapshots (snapshot_id, rank);
CREATE INDEX IF NOT EXISTS idx_recommendation_snapshots_venue_id ON recommendation_snapshots (venue_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_snapshots_generated_at ON recommendation_snapshots (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_enrichments_venue_id ON venue_enrichments (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_enrichments_source ON venue_enrichments (source);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles (username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_selected_market ON user_profiles (selected_market_id);
CREATE INDEX IF NOT EXISTS idx_venue_live_states_market_pulse ON venue_live_states (market_id, pulse_level, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_trend_buckets_venue_bucket ON venue_trend_buckets (venue_id, bucket_start DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

DROP TRIGGER IF EXISTS trg_markets_updated_at ON markets;
CREATE TRIGGER trg_markets_updated_at BEFORE UPDATE ON markets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_venues_updated_at ON venues;
CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON venues
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_signals_updated_at ON signals;
CREATE TRIGGER trg_signals_updated_at BEFORE UPDATE ON signals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recommendation_snapshots_updated_at ON recommendation_snapshots;
CREATE TRIGGER trg_recommendation_snapshots_updated_at BEFORE UPDATE ON recommendation_snapshots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_venue_enrichments_updated_at ON venue_enrichments;
CREATE TRIGGER trg_venue_enrichments_updated_at BEFORE UPDATE ON venue_enrichments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_market_neighborhoods_updated_at ON market_neighborhoods;
CREATE TRIGGER trg_market_neighborhoods_updated_at BEFORE UPDATE ON market_neighborhoods
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON user_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_venue_live_states_updated_at ON venue_live_states;
CREATE TRIGGER trg_venue_live_states_updated_at BEFORE UPDATE ON venue_live_states
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_live_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_trend_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
