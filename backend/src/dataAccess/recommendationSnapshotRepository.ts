import { dbQuery } from "../lib/db";
import type {
  CreateRecommendationSnapshotInput,
  RecommendationSnapshot
} from "../types/recommendationSnapshot";

interface RecommendationSnapshotRow {
  id: string;
  snapshot_id: string;
  venue_id: string;
  report_id: string | null;
  rank: number | null;
  score: number;
  rationale: string | null;
  factors: unknown[];
  recommendation_data: Record<string, unknown>;
  venue_name?: string | null;
  venue_neighborhood?: string | null;
  venue_category?: string | null;
  venue_latitude?: number | null;
  venue_longitude?: number | null;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isPlaceholderVenueName(value: string | undefined): boolean {
  if (!value) return false;
  return /^Venue\s+v-\d+$/i.test(value.trim());
}

function isPlaceholderNeighborhood(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().toLowerCase() === "unknown";
}

function toRecommendationSnapshot(row: RecommendationSnapshotRow): RecommendationSnapshot {
  const recommendationData = { ...row.recommendation_data };

  const existingVenueName =
    toText(recommendationData.venue_name) ??
    toText(recommendationData.venueName) ??
    toText(recommendationData.name);

  if (row.venue_name && (!existingVenueName || isPlaceholderVenueName(existingVenueName))) {
    recommendationData.venue_name = row.venue_name;
  }

  const existingNeighborhood =
    toText(recommendationData.neighborhood) ??
    toText(recommendationData.venue_neighborhood) ??
    toText(recommendationData.venueNeighborhood);

  if (row.venue_neighborhood && (!existingNeighborhood || isPlaceholderNeighborhood(existingNeighborhood))) {
    recommendationData.neighborhood = row.venue_neighborhood;
  }

  // Inject venue category from the DB JOIN when not already present in recommendation_data.
  // Assumes category is stored in venues.metadata->>'category' (see seed_venues.sql).
  if (row.venue_category && recommendationData.category == null) {
    recommendationData.category = row.venue_category;
  }

  // Inject venue coordinates from the DB JOIN when not already present in recommendation_data.
  // This ensures the DB-backed path has real coordinates instead of relying on the mock
  // VENUES_BY_ID map (which only holds mock string IDs and always misses on UUID venue_id).
  if (row.venue_latitude != null && recommendationData.latitude == null) {
    recommendationData.latitude = row.venue_latitude;
  }
  if (row.venue_longitude != null && recommendationData.longitude == null) {
    recommendationData.longitude = row.venue_longitude;
  }

  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    venueId: row.venue_id,
    reportId: row.report_id,
    rank: row.rank,
    score: row.score,
    rationale: row.rationale,
    factors: row.factors,
    recommendationData,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function insertRecommendationSnapshot(
  input: CreateRecommendationSnapshotInput
): Promise<RecommendationSnapshot> {
  const result = await dbQuery<RecommendationSnapshotRow>(
    `
      INSERT INTO recommendation_snapshots (
        snapshot_id,
        venue_id,
        report_id,
        rank,
        score,
        rationale,
        factors,
        recommendation_data,
        generated_at,
        expires_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz)
      RETURNING
        id,
        snapshot_id,
        venue_id,
        report_id,
        rank,
        score,
        rationale,
        factors,
        recommendation_data,
        generated_at,
        expires_at,
        created_at,
        updated_at
    `,
    [
      input.snapshotId,
      input.venueId,
      input.reportId ?? null,
      input.rank ?? null,
      input.score,
      input.rationale ?? null,
      JSON.stringify(input.factors ?? []),
      JSON.stringify(input.recommendationData ?? {}),
      input.generatedAt ?? new Date().toISOString(),
      input.expiresAt ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert recommendation snapshot");
  }

  return toRecommendationSnapshot(row);
}

export async function listRecommendationSnapshots(
  snapshotId: string
): Promise<RecommendationSnapshot[]> {
  const result = await dbQuery<RecommendationSnapshotRow>(
    `
      SELECT
        id,
        snapshot_id,
        venue_id,
        report_id,
        rank,
        score,
        rationale,
        factors,
        recommendation_data,
        generated_at,
        expires_at,
        created_at,
        updated_at
      FROM recommendation_snapshots
      WHERE snapshot_id = $1::uuid
      ORDER BY rank ASC NULLS LAST, score DESC
    `,
    [snapshotId]
  );

  return result.rows.map(toRecommendationSnapshot);
}

export async function listLatestRecommendationSnapshots(limit = 8): Promise<RecommendationSnapshot[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 8;

  const result = await dbQuery<RecommendationSnapshotRow>(
    `
      WITH latest_per_venue AS (
        SELECT DISTINCT ON (rs.venue_id)
          rs.id,
          rs.snapshot_id,
          rs.venue_id,
          rs.report_id,
          rs.rank,
          rs.score,
          rs.rationale,
          rs.factors,
          rs.recommendation_data,
          rs.generated_at,
          rs.expires_at,
          rs.created_at,
          rs.updated_at,
          v.name AS venue_name,
          COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS venue_neighborhood,
          v.metadata->>'category' AS venue_category,
          v.latitude AS venue_latitude,
          v.longitude AS venue_longitude
        FROM recommendation_snapshots rs
        LEFT JOIN venues v ON v.id = rs.venue_id
        ORDER BY rs.venue_id, rs.generated_at DESC, rs.created_at DESC
      )
      SELECT
        id,
        snapshot_id,
        venue_id,
        report_id,
        rank,
        score,
        rationale,
        factors,
        recommendation_data,
        venue_name,
        venue_neighborhood,
        venue_category,
        venue_latitude,
        venue_longitude,
        generated_at,
        expires_at,
        created_at,
        updated_at
      FROM latest_per_venue
      ORDER BY score DESC, generated_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map(toRecommendationSnapshot);
}
