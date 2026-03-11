export interface RecommendationSnapshot {
  id: string;
  snapshotId: string;
  venueId: string;
  reportId: string | null;
  rank: number | null;
  score: number;
  rationale: string | null;
  factors: unknown[];
  recommendationData: Record<string, unknown>;
  generatedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecommendationSnapshotInput {
  snapshotId: string;
  venueId: string;
  reportId?: string | null;
  rank?: number | null;
  score: number;
  rationale?: string | null;
  factors?: unknown[];
  recommendationData?: Record<string, unknown>;
  generatedAt?: string;
  expiresAt?: string | null;
}
