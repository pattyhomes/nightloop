# Build 3 Venue Media Runbook

## Environment Boundary

- TestFlight Build 3 uses the Railway-hosted Express API in production mode:
  `https://nightloop-production.up.railway.app/api/v1`.
- The TestFlight data plane should match that Railway backend's Supabase
  project for Auth, Postgres, and Storage.
- NightloopStaging remains a rehearsal sandbox for migrations/media applies, not
  the final TestFlight runtime.
- iOS uses only the matching Supabase URL and publishable key.
- Supabase service-role keys, database URLs, provider keys, and storage apply
  permissions stay in backend/Railway/local `.env` only.

## Media Apply Safety

Run discovery as dry-run first:

```bash
npm --prefix backend run media:discover:core10
```

Apply only after reviewing the dry-run report. Use `--target=staging` for the
rehearsal sandbox and `--target=production` only for the Railway/TestFlight data
plane:

```bash
npm --prefix backend run media:discover -- --market=san-francisco --core10 --target=production --apply
```

`--apply` requires:

- `DATABASE_URL` for the target Postgres database;
- `SUPABASE_PROJECT_URL` for the target Supabase project;
- `SUPABASE_SERVICE_ROLE_KEY` in backend-only env;
- `SUPABASE_PROJECT_REF_CONFIRM` matching the target project ref;
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

## Build 3 Primary Media Promoted To Production

On May 5, 2026, the same three reviewed primary images were promoted to the
production Supabase project used by `nightloop-production.up.railway.app`.

Before apply, production had no `venue_media_candidates` table, no
`venue_assets.pipeline_original_image_url` generated column, and no
`venue-media-approved` bucket. Migrations `014_build3_venue_media_candidates.sql`
and `015_build3_media_security_hardening.sql` were applied first, then verified:

- `venue_media_candidates` RLS enabled;
- `venue_assets` RLS enabled;
- `venue-media-approved` bucket exists and is public;
- 38 app-owned public tables checked with no RLS-disabled app tables.

Applied with a production-ID reviewed file:

```bash
SUPABASE_PROJECT_REF_CONFIRM=<production-project-ref> \
  npm --prefix backend run media:discover -- \
  --market=san-francisco \
  --core10 \
  --apply \
  --target=production \
  --apply-reviewed=/tmp/nightloop-media-review-balanced/selected-apply-primary-production.json
```

The apply report selected 9 production Core 10 rows and applied exactly 3
reviewed approved candidates. `Audio SF` was reported as the one missing Core 10
production row.

Verified production `venue_assets` rows:

| Venue | Sort order | Original image URL |
| --- | ---: | --- |
| 1015 Folsom | 0 | `https://1015.com/wp-content/uploads/2020/01/EricAnanmalay_1015SF_Gryffin-02977.jpg` |
| Monarch | 0 | `https://images.squarespace-cdn.com/content/v1/64066ea051710848ff6e7c28/20a0946c-f0a8-4046-b2fd-3dd6da68b2fd/DSC_7853-Enhanced-NR.jpg?format=2500w` |
| Public Works | 0 | `https://publicsf.com/wp-content/uploads/2023/11/Miss-Monique-Public-Works-11032023-Preview-5.jpg` |

## Supabase Advisor Note

`venue_media_candidates` is backend-only and has RLS enabled with no anon or
authenticated client policies.

If Supabase Advisor reports `public.spatial_ref_sys` as RLS-disabled, treat it as
a Supabase-managed PostGIS extension table. The existing cleanup migration tries
to enable RLS only when the migration role owns the table. If the owner is
`supabase_admin`, resolve it through Supabase-supported extension/Data API
hardening instead of forcing ownership changes from application migrations.
