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
- `recommendations` (ranked output linked to venues and optional reports)
- Primary keys, timestamps, update triggers, and practical indexes for MVP queries

## Notes

- `location_geog` is best for distance/radius queries.
- `location_geom` is useful for geometry operations/projections.
- `metadata`/`payload`/`*_data` JSONB columns keep MVP flexible while product shape evolves.
