# Nightloop

Nightloop is an AI-native project scaffold for building a nightly data ingestion, scoring, and recommendation loop.

## San Francisco MVP venue seed dataset

Nightloop now includes a first-pass **MVP seed dataset** of real San Francisco nightlife venues (best-effort, approximate coordinates):

- CSV seed source: `data/venues/sf_seed.csv`
- SQL seed script: `db/seed_venues.sql`
- Backend in-app mock dataset: `backend/src/data/mockVenues.ts`

Coverage in this MVP seed:

- 100 venues
- neighborhoods: SoMa, Mission, Castro, North Beach, Marina, Lower Nob Hill/Polk, Hayes Valley
- category mix: `club`, `bar`, `lounge`, `live_music`

> Coordinates are intentionally approximate for MVP prototyping and ranking experiments.

## Quick start (local)

### 1) Install deps

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 2) Configure env files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 3) Start both apps together (single command)

```bash
npm run dev
```

This runs:
- backend on `http://localhost:4000`
- frontend on `http://localhost:3000`

Local demo note: backend CORS is intentionally scoped to allow requests from `http://localhost:3000` (frontend) to `http://localhost:4000` (backend API).

### 4) Build checks

```bash
npm run build
```

## Storage model (Postgres MVP)

`db/schema.sql` now defines four core persistence tables for the signal pipeline foundation:

- `venues`
- `signals`
- `reports`
- `recommendation_snapshots`

`recommendation_snapshots` stores ranked rows per generation run via `snapshot_id`.

## Seed workflow (Postgres)

After applying `db/schema.sql`, run:

```bash
psql "$DATABASE_URL" -f db/seed_venues.sql
```

The seed upserts venues by `slug` and stores `neighborhood` + `category` in `venues.metadata`.

## Useful endpoints

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/recommendations`

Recommendations behavior:

- When `DATABASE_URL` is configured and snapshots are available, `/api/recommendations` serves snapshot-backed recommendations from Postgres.
- In local/dev environments where the DB is unavailable or unconfigured, `/api/recommendations` safely falls back to demo/mock recommendations (no crash/500).

## Signal ingestion pipeline

`backend/src/services/signalIngestionService.ts` provides `ingestSignal(signalEvent)` and persists both raw signals and a lightweight recommendation snapshot per venue.

Validation rules enforced by `ingestSignal`:

- `venue_id`: required non-empty string
- `signal_type`: one of `crowd_report`, `line_report`, `event_report`
- `signal_strength`: required finite number
- `source`: one of `user`, `scraper`, `manual`
- `metadata`: optional object

Storage + scoring behavior:

- Raw signal is stored through `backend/src/dataAccess/signalRepository.ts`.
- Latest venue signals are folded into snapshot metrics:
  - `crowd_report` raises `popularity`
  - `line_report` raises `wait_time`
  - `event_report` raises `activity`
- Snapshot is persisted through `backend/src/dataAccess/recommendationSnapshotRepository.ts`.

Run the local end-to-end script:

```bash
node --import tsx scripts/testSignalIngestion.ts
```

## Signal ingestion pipeline

Nightloop now includes a minimal ingestion path for normalized venue signals in:

- `backend/src/services/signalIngestionService.ts`

`ingestSignal(signalEvent)` validates incoming signal events, stores them through `signalRepository`, computes lightweight venue scores, and writes a recommendation snapshot through `recommendationSnapshotRepository`.

Supported signal types:

- `crowd_report` → increases popularity score
- `line_report` → increases wait-time estimate
- `event_report` → increases activity score

A runnable demo script is available at:

- `scripts/testSignalIngestion.ts`

It generates mock signal events, ingests them, and prints snapshot updates after each insert.

## Signal ingestion pipeline

Nightloop includes a minimal signal ingestion pipeline service at:

- `backend/src/services/signalIngestionService.ts`

Local smoke check command:

```bash
npm run test:signal-ingestion
```

Optional DB-backed run:

```bash
npm --prefix backend exec -- tsx scripts/testSignalIngestion.ts --live
```

## Snapshot-backed recommendations test

Run a local in-memory verification of the signal → snapshot → recommendations path:

```bash
npm --prefix backend exec -- tsx scripts/testRecommendationsFromSnapshots.ts
```

The script ingests sample signals, verifies latest recommendation snapshot rows exist, and asserts `getRecommendations()` returns snapshot-backed output.

## Codex path verification
Nightloop codex path verification marker.
