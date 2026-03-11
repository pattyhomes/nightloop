# Nightloop DB (MVP)

This folder contains the baseline PostgreSQL schema for Nightloop.

## Requirements

- PostgreSQL 15+
- PostGIS extension

## Apply schema

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Seed San Francisco venues (MVP)

```bash
psql "$DATABASE_URL" -f db/seed_venues.sql
```

- Seed source data lives in `../data/venues/sf_seed.csv`
- Script performs an upsert on `venues.slug`
- `metadata` includes `seed_id`, `neighborhood`, `category`, `seed_version`
- Coordinates are best-effort approximate and intended for MVP/testing

## What is included

- `venues` (with `latitude`, `longitude`, and generated PostGIS point columns)
- `signals` (venue-level observations/signals)
- `reports` (user-submitted venue reports)
- `recommendation_snapshots` (ranked output rows grouped by `snapshot_id` and linked to venues/reports)
- Primary keys, timestamps, update triggers, and practical indexes for MVP queries

## Backend storage access (MVP)

Simple Postgres data-access repositories now live in:

- `backend/src/dataAccess/signalRepository.ts`
- `backend/src/dataAccess/recommendationSnapshotRepository.ts`

These provide minimal read/write helpers for signal ingestion outputs and recommendation snapshot persistence.

## Notes

- `location_geog` is best for distance/radius queries.
- `location_geom` is useful for geometry operations/projections.
- `metadata`/`payload`/`*_data` JSONB columns keep MVP flexible while product shape evolves.
