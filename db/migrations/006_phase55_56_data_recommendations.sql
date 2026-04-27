-- Phase 5.5/5.6 data, hours, recommendations, and open-data evidence foundation.
-- Idempotent for the dedicated Supabase development project.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_import_runs_provider_check'
  ) THEN
    ALTER TABLE provider_import_runs DROP CONSTRAINT provider_import_runs_provider_check;
  END IF;

  ALTER TABLE provider_import_runs
    ADD CONSTRAINT provider_import_runs_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual', 'datasf_poe'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_records_provider_check'
  ) THEN
    ALTER TABLE provider_records DROP CONSTRAINT provider_records_provider_check;
  END IF;

  ALTER TABLE provider_records
    ADD CONSTRAINT provider_records_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual', 'datasf_poe'));
END $$;

CREATE TABLE IF NOT EXISTS venue_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'unknown',
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  weekly_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_url TEXT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  verified_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_schedules_source_check CHECK (
    source IN ('manual', 'provider:google_places', 'provider:foursquare', 'datasf_poe', 'unknown')
  ),
  CONSTRAINT venue_schedules_status_check CHECK (
    status IN ('unknown', 'verified_hours', 'temporarily_closed', 'manual_hold')
  ),
  CONSTRAINT venue_schedules_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT venue_schedules_unique_source UNIQUE (venue_id, source)
);

CREATE INDEX IF NOT EXISTS idx_venue_schedules_venue_status
  ON venue_schedules (venue_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_schedules_market_status
  ON venue_schedules (market_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_venue_schedules_updated_at ON venue_schedules;
CREATE TRIGGER trg_venue_schedules_updated_at BEFORE UPDATE ON venue_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE venue_schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS venue_recommendation_inputs (
  venue_id UUID PRIMARY KEY REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  venue_quality_score NUMERIC(5,4) NOT NULL DEFAULT 0.60,
  source_confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.50,
  event_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  hours_confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  baseline_score NUMERIC(5,4) NOT NULL DEFAULT 0.60,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_recommendation_inputs_quality_check CHECK (venue_quality_score >= 0 AND venue_quality_score <= 1),
  CONSTRAINT venue_recommendation_inputs_source_check CHECK (source_confidence_score >= 0 AND source_confidence_score <= 1),
  CONSTRAINT venue_recommendation_inputs_event_check CHECK (event_score >= 0 AND event_score <= 1),
  CONSTRAINT venue_recommendation_inputs_hours_check CHECK (hours_confidence_score >= 0 AND hours_confidence_score <= 1),
  CONSTRAINT venue_recommendation_inputs_baseline_check CHECK (baseline_score >= 0 AND baseline_score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_venue_recommendation_inputs_market_baseline
  ON venue_recommendation_inputs (market_id, baseline_score DESC, computed_at DESC);

DROP TRIGGER IF EXISTS trg_venue_recommendation_inputs_updated_at ON venue_recommendation_inputs;
CREATE TRIGGER trg_venue_recommendation_inputs_updated_at BEFORE UPDATE ON venue_recommendation_inputs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE venue_recommendation_inputs ENABLE ROW LEVEL SECURITY;

UPDATE markets
SET provider_config = provider_config || '{"google_maps": {"production_default": true}, "open_data": {"datasf_poe": {"enabled": true}, "nyc_sla": {"dry_run_only": true}}}'::jsonb,
    updated_at = NOW()
WHERE slug = 'san-francisco';
