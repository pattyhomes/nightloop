-- Migration 001: venue_enrichments
-- Stores external data fetched from third-party sources (e.g. Foursquare) per venue.
-- One row per (venue_id, source) — upserted on each enrichment refresh.

CREATE TABLE IF NOT EXISTS venue_enrichments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  source       TEXT        NOT NULL,               -- e.g. 'foursquare'
  external_id  TEXT        NOT NULL,               -- e.g. Foursquare fsq_id
  enrichment_data JSONB    NOT NULL DEFAULT '{}'::jsonb,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_enrichments_venue_source_uq UNIQUE (venue_id, source)
);

CREATE INDEX IF NOT EXISTS idx_venue_enrichments_venue_id
  ON venue_enrichments (venue_id);

CREATE INDEX IF NOT EXISTS idx_venue_enrichments_source
  ON venue_enrichments (source);

DROP TRIGGER IF EXISTS trg_venue_enrichments_updated_at ON venue_enrichments;
CREATE TRIGGER trg_venue_enrichments_updated_at
BEFORE UPDATE ON venue_enrichments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
