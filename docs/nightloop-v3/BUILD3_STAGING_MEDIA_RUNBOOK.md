# Build 3 Staging Media Runbook

## Environment Boundary

- TestFlight uses the Railway-hosted Express API in production mode.
- Railway points at the staging Supabase project for Auth and Postgres.
- iOS uses only the staging Supabase URL and publishable key.
- Supabase service-role keys, database URLs, provider keys, and storage apply
  permissions stay in backend/Railway/local `.env` only.

## Media Apply Safety

Run discovery as dry-run first:

```bash
npm --prefix backend run media:discover:core10
```

Apply only after reviewing the dry-run report:

```bash
npm --prefix backend run media:discover -- --market=san-francisco --core10 --target=staging --apply
```

`--apply` requires:

- `DATABASE_URL` for staging Postgres;
- `SUPABASE_PROJECT_URL` for staging;
- `SUPABASE_SERVICE_ROLE_KEY` in backend-only env;
- `SUPABASE_PROJECT_REF_CONFIRM` matching the staging project ref;
- optional `VENUE_MEDIA_BUCKET`, defaulting to `venue-media-approved`.

## Build 3 Primary Media Applied To Staging

On May 5, 2026, the guarded media apply published one primary image each for
the staging venue rows below. The images were selected from the local review
gallery for the strongest venue-plus-crowd read in the actual Nightloop card
crop.

Applied with:

```bash
SUPABASE_PROJECT_REF_CONFIRM=hbsbemhyhopmkykihxct \
  npm --prefix backend run media:discover -- \
  --market=san-francisco \
  --core10 \
  --apply \
  --target=staging \
  --apply-reviewed=/tmp/nightloop-media-review-balanced/selected-apply-primary-v2.json
```

Selected primaries:

| Venue | Review index | Original image URL |
| --- | ---: | --- |
| 1015 Folsom | 016 | `https://1015.com/wp-content/uploads/2020/01/EricAnanmalay_1015SF_Gryffin-02977.jpg` |
| Monarch | 105 | `https://images.squarespace-cdn.com/content/v1/64066ea051710848ff6e7c28/20a0946c-f0a8-4046-b2fd-3dd6da68b2fd/DSC_7853-Enhanced-NR.jpg?format=2500w` |
| Public Works | 127 | `https://publicsf.com/wp-content/uploads/2023/11/Miss-Monique-Public-Works-11032023-Preview-5.jpg` |

After apply, these three images were verified as the first approved image per
venue by `sort_order ASC, created_at ASC`. Older Public Works pipeline images
remain approved but were moved behind the selected primary.

## Supabase Advisor Note

`venue_media_candidates` is backend-only and has RLS enabled with no anon or
authenticated client policies.

If Supabase Advisor reports `public.spatial_ref_sys` as RLS-disabled, treat it as
a Supabase-managed PostGIS extension table. The existing cleanup migration tries
to enable RLS only when the migration role owns the table. If the owner is
`supabase_admin`, resolve it through Supabase-supported extension/Data API
hardening instead of forcing ownership changes from application migrations.
