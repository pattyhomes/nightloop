ALTER TABLE venue_media_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE venue_media_candidates FROM anon;
REVOKE ALL ON TABLE venue_media_candidates FROM authenticated;

ALTER TABLE venue_assets
  ADD COLUMN IF NOT EXISTS pipeline_original_image_url TEXT
  GENERATED ALWAYS AS (metadata->>'original_image_url') STORED;

CREATE UNIQUE INDEX IF NOT EXISTS venue_assets_pipeline_original_image_uq
  ON venue_assets (venue_id, source, pipeline_original_image_url)
  WHERE source = 'venue_media_pipeline'
    AND pipeline_original_image_url IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('venue-media-approved', 'venue-media-approved', true)
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
  END IF;
END $$;

