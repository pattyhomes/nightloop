-- Phase 5.8 SF venue trust: provider hours TTL, event source ops, and source enums.
-- Idempotent for the dedicated Supabase development project.

ALTER TABLE venue_schedules
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_venue_schedules_market_expires
  ON venue_schedules (market_id, expires_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_import_runs_provider_check'
  ) THEN
    ALTER TABLE provider_import_runs DROP CONSTRAINT provider_import_runs_provider_check;
  END IF;

  ALTER TABLE provider_import_runs
    ADD CONSTRAINT provider_import_runs_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual', 'datasf_poe', 'eventbrite', 'venue_website'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_records_provider_check'
  ) THEN
    ALTER TABLE provider_records DROP CONSTRAINT provider_records_provider_check;
  END IF;

  ALTER TABLE provider_records
    ADD CONSTRAINT provider_records_provider_check
    CHECK (provider IN ('foursquare', 'google_places', 'resident_advisor', 'manual', 'datasf_poe', 'eventbrite', 'venue_website'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_source_check'
  ) THEN
    ALTER TABLE events DROP CONSTRAINT events_source_check;
  END IF;

  ALTER TABLE events
    ADD CONSTRAINT events_source_check
    CHECK (source IN ('manual', 'foursquare', 'google_places', 'resident_advisor', 'eventbrite', 'venue_website'));
END $$;

CREATE TABLE IF NOT EXISTS venue_event_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT,
  provider_id TEXT,
  trust_status TEXT NOT NULL DEFAULT 'review_required',
  robots_status TEXT NOT NULL DEFAULT 'unchecked',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_event_sources_type_check CHECK (
    source_type IN ('eventbrite_venue', 'eventbrite_organizer', 'venue_ical', 'venue_json', 'venue_rss', 'venue_json_ld')
  ),
  CONSTRAINT venue_event_sources_trust_check CHECK (
    trust_status IN ('trusted', 'review_required', 'blocked')
  ),
  CONSTRAINT venue_event_sources_robots_check CHECK (
    robots_status IN ('unchecked', 'allowed', 'disallowed', 'not_applicable', 'error')
  ),
  CONSTRAINT venue_event_sources_source_present_check CHECK (
    source_url IS NOT NULL OR provider_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_event_sources_provider_uq
  ON venue_event_sources (venue_id, source_type, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS venue_event_sources_url_uq
  ON venue_event_sources (venue_id, source_type, source_url)
  WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venue_event_sources_market_status
  ON venue_event_sources (market_id, trust_status, source_type);

DROP TRIGGER IF EXISTS trg_venue_event_sources_updated_at ON venue_event_sources;
CREATE TRIGGER trg_venue_event_sources_updated_at BEFORE UPDATE ON venue_event_sources
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE venue_event_sources ENABLE ROW LEVEL SECURITY;

UPDATE markets
SET provider_config = provider_config || '{"events": {"eventbrite": {"enabled": true}, "venue_website": {"enabled": true}}, "hours": {"provider_ttl_days": 30, "nightlife_day_window": "18:00-04:00"}}'::jsonb,
    updated_at = NOW()
WHERE slug = 'san-francisco';
