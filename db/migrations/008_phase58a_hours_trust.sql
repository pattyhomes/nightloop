-- Phase 5.8A hours trust: OSM internal evidence and venue-owned website hours.
-- Idempotent for the dedicated Supabase development project.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_schedules_source_check'
  ) THEN
    ALTER TABLE venue_schedules DROP CONSTRAINT venue_schedules_source_check;
  END IF;

  ALTER TABLE venue_schedules
    ADD CONSTRAINT venue_schedules_source_check
    CHECK (
      source IN (
        'manual',
        'provider:google_places',
        'provider:foursquare',
        'provider:openstreetmap',
        'venue_website',
        'datasf_poe',
        'unknown'
      )
    );
END $$;

UPDATE markets
SET provider_config = provider_config || '{"hours": {"google_ttl_days": 30, "venue_website_ttl_days": 7, "osm_internal_only_until_ui_attribution": true}}'::jsonb,
    updated_at = NOW()
WHERE slug = 'san-francisco';
