# Post-UI Follow-Up

Do this after the big UI design pass is in a good place.

## Why this exists

Older Nightloop work had some useful product and API ideas, but the code itself came from an older repo shape and should not be merged directly into the current codebase.

The right move is to port the good ideas into the current `backend/` + `frontend/` architecture in a clean way.

## Priority follow-up after UI work

1. Implement `GET /venues` and `GET /venues/:id` in the current backend.
2. Use `docs/API_CONTRACTS.md` as the response/request target.
3. Use `docs/VENUES_API_PORT_PLAN.md` to map the old ideas into the current architecture.

## Good rescued ideas to port later

- favorites
- venue live state
- venue summaries
- richer venue tags
- user trust
- personalized feed contracts

## Do not do this

- Do not merge the legacy rescue branch into `main` wholesale.
- Do not copy the old root-level `src/` app back into the repo.
- Do not replace the current root `package.json` or repo layout with the old one.

## Context

- Clean working repo: `/Users/chuckclaw/projects/nightloop`
- Backup of old divergent work: `/Users/chuckclaw/projects/nightloop-legacy-20260424`
- Rescue branch with preserved old commits: `rescue/legacy-20260424`
