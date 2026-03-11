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
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRecommendationSnapshot(row: RecommendationSnapshotRow): RecommendationSnapshot {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    venueId: row.venue_id,
    reportId: row.report_id,
    rank: row.rank,
    score: row.score,
    rationale: row.rationale,
    factors: row.factors,
    recommendationData: row.recommendation_data,
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
        SELECT DISTINCT ON (venue_id)
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
        ORDER BY venue_id, generated_at DESC, created_at DESC
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
