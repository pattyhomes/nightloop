# Nightloop DB (MVP)

This folder contains the baseline PostgreSQL schema for Nightloop.

## Requirements

- PostgreSQL 15+
- PostGIS extension

## Apply schema

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

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
