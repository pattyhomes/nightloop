-- Phase 2B Google Places provider integration.
-- Idempotent for the dedicated Supabase development project.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_import_runs_cap_check'
  ) THEN
    ALTER TABLE provider_import_runs DROP CONSTRAINT provider_import_runs_cap_check;
  END IF;

  ALTER TABLE provider_import_runs
    ADD CONSTRAINT provider_import_runs_cap_check
    CHECK (capped_venue_count >= 1 AND capped_venue_count <= 100);
END $$;

UPDATE markets
SET provider_config = provider_config || '{"google_places": {"enabled": true, "default_live_cap": 100, "default_run_kind": "existing_qa"}}'::jsonb,
    updated_at = NOW()
WHERE slug = 'san-francisco';
