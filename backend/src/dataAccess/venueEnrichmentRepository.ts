import { dbQuery } from "../lib/db";
import type {
  CreateVenueEnrichmentInput,
  FoursquareEnrichmentData,
  VenueEnrichment
} from "../types/venueEnrichment";

interface VenueEnrichmentRow {
  id: string;
  venue_id: string;
  source: string;
  external_id: string;
  enrichment_data: FoursquareEnrichmentData;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

function toVenueEnrichment(row: VenueEnrichmentRow): VenueEnrichment {
  return {
    id: row.id,
    venueId: row.venue_id,
    source: row.source,
    externalId: row.external_id,
    enrichmentData: row.enrichment_data,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Upsert venue enrichment for a given (venue_id, source) pair.
 * Updates all fields on conflict so that re-running the enrichment script
 * always refreshes stale data.
 */
export async function upsertVenueEnrichment(
  input: CreateVenueEnrichmentInput
): Promise<VenueEnrichment> {
  const now = input.fetchedAt ?? new Date().toISOString();

  const result = await dbQuery<VenueEnrichmentRow>(
    `
      INSERT INTO venue_enrichments (
        venue_id,
        source,
        external_id,
        enrichment_data,
        fetched_at
      )
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5::timestamptz)
      ON CONFLICT (venue_id, source) DO UPDATE
        SET external_id     = EXCLUDED.external_id,
            enrichment_data = EXCLUDED.enrichment_data,
            fetched_at      = EXCLUDED.fetched_at,
            updated_at      = NOW()
      RETURNING
        id, venue_id, source, external_id, enrichment_data,
        fetched_at, created_at, updated_at
    `,
    [
      input.venueId,
      input.source,
      input.externalId,
      JSON.stringify(input.enrichmentData),
      now
    ]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Failed to upsert venue enrichment");
  return toVenueEnrichment(row);
}

/**
 * Batch-load Foursquare enrichments for a set of venue IDs.
 * Returns only the rows that exist — venues without enrichment are simply absent.
 * Safe to call with an empty array (returns []).
 */
export async function getVenueEnrichments(
  venueIds: string[],
  source = "foursquare"
): Promise<VenueEnrichment[]> {
  if (venueIds.length === 0) return [];

  const result = await dbQuery<VenueEnrichmentRow>(
    `
      SELECT
        id, venue_id, source, external_id, enrichment_data,
        fetched_at, created_at, updated_at
      FROM venue_enrichments
      WHERE venue_id = ANY($1::uuid[])
        AND source = $2
    `,
    [venueIds, source]
  );

  return result.rows.map(toVenueEnrichment);
}

/**
 * Resolve the PostgreSQL UUID for a venue given its seed_id (mock slug).
 * This bridges mock venue IDs like "venue-audio" to their real DB UUIDs.
 * Returns null when no match is found.
 */
export async function resolveVenueIdBySeedId(seedId: string): Promise<string | null> {
  const result = await dbQuery<{ id: string }>(
    `SELECT id FROM venues WHERE metadata->>'seed_id' = $1 LIMIT 1`,
    [seedId]
  );
  return result.rows[0]?.id ?? null;
}
