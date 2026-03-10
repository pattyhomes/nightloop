export interface Recommendation {
  id: string;
  venueId: string;
  reportId: string | null;
  rationale: string | null;
  score: number;
  rank: number | null;
  recommendationData: Record<string, unknown>;
  generatedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
