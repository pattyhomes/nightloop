CREATE TABLE IF NOT EXISTS venue_media_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  source_page_url TEXT NOT NULL,
  image_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  rights_basis TEXT NOT NULL,
  proof_excerpt TEXT,
  robots_status TEXT NOT NULL DEFAULT 'unknown',
  credit_text TEXT,
  credit_url TEXT,
  license_name TEXT,
  license_url TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  width INTEGER,
  height INTEGER,
  aspect_ratio NUMERIC,
  content_category TEXT NOT NULL DEFAULT 'unknown',
  content_hash TEXT,
  storage_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT venue_media_candidates_rights_status_check CHECK (
    rights_status IN ('approved', 'review', 'rejected')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_media_candidates_venue_image_uq
  ON venue_media_candidates (venue_id, image_url);

CREATE INDEX IF NOT EXISTS idx_venue_media_candidates_status_created
  ON venue_media_candidates (rights_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_media_candidates_venue
  ON venue_media_candidates (venue_id, rights_status);

DROP TRIGGER IF EXISTS trg_venue_media_candidates_updated_at ON venue_media_candidates;
CREATE TRIGGER trg_venue_media_candidates_updated_at BEFORE UPDATE ON venue_media_candidates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
