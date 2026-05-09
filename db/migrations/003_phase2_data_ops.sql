-- Phase 2 data and ops foundation for Nightloop v3.
-- Idempotent for the dedicated Supabase development project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'ops_admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_role_check CHECK (role IN ('ops_admin', 'reviewer_admin', 'super_admin'))
);

CREATE TABLE IF NOT EXISTS provider_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'dry_run',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  capped_venue_count INTEGER NOT NULL DEFAULT 20,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_import_runs_provider_check CHECK (
    provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual')
  ),
  CONSTRAINT provider_import_runs_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'blocked')
  ),
  CONSTRAINT provider_import_runs_mode_check CHECK (mode IN ('fixture', 'dry_run', 'live')),
  CONSTRAINT provider_import_runs_cap_check CHECK (
    capped_venue_count >= 1 AND capped_venue_count <= 20
  )
);

CREATE TABLE IF NOT EXISTS provider_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  import_run_id UUID REFERENCES provider_import_runs(id) ON DELETE CASCADE,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_confidence NUMERIC(5,4),
  match_status TEXT NOT NULL DEFAULT 'candidate',
  license JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_records_provider_check CHECK (
    provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual')
  ),
  CONSTRAINT provider_records_record_type_check CHECK (record_type IN ('venue', 'event')),
  CONSTRAINT provider_records_match_status_check CHECK (
    match_status IN ('candidate', 'approved', 'rejected', 'ignored', 'error')
  ),
  CONSTRAINT provider_records_confidence_check CHECK (
    match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)
  )
);

CREATE TABLE IF NOT EXISTS venue_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_record_id UUID NOT NULL REFERENCES provider_records(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_notes TEXT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_review_items_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS venue_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  alt_text TEXT,
  credit_text TEXT NOT NULL,
  credit_url TEXT,
  license_name TEXT NOT NULL,
  license_url TEXT,
  rights_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_assets_type_check CHECK (asset_type IN ('image')),
  CONSTRAINT venue_assets_rights_status_check CHECK (
    rights_status IN ('licensed', 'owned', 'partner', 'public_domain')
  )
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  source_event_id TEXT,
  url TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_source_check CHECK (source IN ('manual', 'foursquare', 'google_places', 'resident_advisor')),
  CONSTRAINT events_time_check CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS events_source_event_id_uq
  ON events (source, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_reports_target_type_check CHECK (
    target_type IN ('venue', 'event', 'user', 'signal', 'asset')
  ),
  CONSTRAINT moderation_reports_status_check CHECK (
    status IN ('open', 'reviewing', 'resolved', 'dismissed')
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_users_auth_active
  ON admin_users (auth_user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_provider_import_runs_market_status
  ON provider_import_runs (market_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_records_run
  ON provider_records (import_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_records_market_status
  ON provider_records (market_id, match_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_review_items_status
  ON venue_review_items (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_review_items_run
  ON venue_review_items (provider_record_id);

CREATE INDEX IF NOT EXISTS idx_venue_assets_venue_approved
  ON venue_assets (venue_id, is_approved, sort_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_events_venue_approved_starts
  ON events (venue_id, is_approved, starts_at ASC);

CREATE INDEX IF NOT EXISTS idx_events_market_starts
  ON events (market_id, starts_at ASC);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_status
  ON moderation_reports (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON admin_users;
CREATE TRIGGER trg_admin_users_updated_at BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_import_runs_updated_at ON provider_import_runs;
CREATE TRIGGER trg_provider_import_runs_updated_at BEFORE UPDATE ON provider_import_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_records_updated_at ON provider_records;
CREATE TRIGGER trg_provider_records_updated_at BEFORE UPDATE ON provider_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_venue_review_items_updated_at ON venue_review_items;
CREATE TRIGGER trg_venue_review_items_updated_at BEFORE UPDATE ON venue_review_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_venue_assets_updated_at ON venue_assets;
CREATE TRIGGER trg_venue_assets_updated_at BEFORE UPDATE ON venue_assets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_moderation_reports_updated_at ON moderation_reports;
CREATE TRIGGER trg_moderation_reports_updated_at BEFORE UPDATE ON moderation_reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_import_runs_provider_check'
  ) THEN
    ALTER TABLE provider_import_runs DROP CONSTRAINT provider_import_runs_provider_check;
  END IF;

  ALTER TABLE provider_import_runs
    ADD CONSTRAINT provider_import_runs_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_records_provider_check'
  ) THEN
    ALTER TABLE provider_records DROP CONSTRAINT provider_records_provider_check;
  END IF;

  ALTER TABLE provider_records
    ADD CONSTRAINT provider_records_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_source_check'
  ) THEN
    ALTER TABLE events DROP CONSTRAINT events_source_check;
  END IF;

  ALTER TABLE events
    ADD CONSTRAINT events_source_check
    CHECK (source IN ('manual', 'foursquare', 'google_places', 'resident_advisor'));
END $$;
