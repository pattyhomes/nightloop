# Supabase Setup Gate

Last updated: 2026-04-24

Phase 1 must not begin until this gate is complete.

Status:

- Supabase project: created by user on 2026-04-24.
- Local env values: saved locally by user on 2026-04-24.
- Local backend database connection: verified with Supabase Session Pooler on 2026-04-24.
- Cost/plan decision: confirm again before any paid upgrade or additional paid infrastructure.

## Why This Gate Exists

Nightloop v3 uses Supabase Auth for phone and Sign in with Apple. Backend auth work depends on real Supabase project values and may require a paid project. The user must create or confirm the project before implementation starts.

## User Action Required Before Phase 1

Create or confirm a dedicated Supabase project for Nightloop v3.

Recommended environment split:

- development
- staging
- production

For Phase 1, development is enough.

## Values To Provide Locally

Add values to local env files only. Do not paste secrets into committed docs.

Use the Supabase **Session Pooler** connection string for `DATABASE_URL` when available. Direct database hostnames such as `db.<project-ref>.supabase.co` can be IPv6/DNS-sensitive from local machines and are less reliable for this setup.

Backend env:

```bash
SUPABASE_PROJECT_URL=
SUPABASE_JWT_ISSUER=
SUPABASE_JWKS_URL=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

iOS local config:

```bash
SUPABASE_PROJECT_URL=
SUPABASE_PUBLISHABLE_KEY=
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` or secret keys are backend-only.
- The iOS app may use a publishable/anon key appropriate for client auth.
- Prefer current Supabase publishable/secret key guidance when creating keys.
- The exact env names may be adjusted during Phase 1 implementation, but the client/server secret boundary may not change.

## Supabase Dashboard Setup To Confirm

- Phone auth enabled and configured.
- Sign in with Apple configured.
- Redirect URLs configured for iOS auth flow.
- RLS enabled on any app tables exposed through Supabase APIs.
- Service/secret keys stored only in backend deployment secrets.
- Production backup/security settings reviewed before production launch.

## Cost Gate

Before creating a paid project or upgrading a plan, confirm with the user.

Implementation must stop and ask before any action that requires new paid infrastructure.

## Phase 1 Start Checklist

- User confirms project exists.
- User confirms cost/plan decision.
- Local backend env contains required values.
- Local backend can connect to the Supabase database.
- Local iOS config contains only client-safe values.
- No secret values are committed.
