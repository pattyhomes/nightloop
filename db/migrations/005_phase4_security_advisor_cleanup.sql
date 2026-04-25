-- Phase 4 Supabase Security Advisor cleanup.
-- Idempotent for the dedicated Supabase development project.
--
-- Nightloop v3 is backend-mediated: clients use Supabase Auth for identity
-- and call Express /api/v1 for product data. Do not add permissive PostgREST
-- policies to app/private/admin tables just to quiet advisor warnings.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  spatial_owner TEXT;
BEGIN
  SELECT pg_get_userbyid(c.relowner)
  INTO spatial_owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'spatial_ref_sys';

  IF spatial_owner IS NULL THEN
    RETURN;
  END IF;

  IF spatial_owner <> current_user THEN
    RAISE WARNING
      'Skipping public.spatial_ref_sys RLS/policy cleanup because table owner is %, but current user is %. This Supabase-managed extension table requires an owner/supported extension cleanup path.',
      spatial_owner,
      current_user;
    RETURN;
  END IF;

  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM authenticated;
  END IF;

  DROP POLICY IF EXISTS "No API access to spatial_ref_sys" ON public.spatial_ref_sys;
  CREATE POLICY "No API access to spatial_ref_sys"
    ON public.spatial_ref_sys
    FOR SELECT
    TO anon, authenticated
    USING (false);
END;
$$;
