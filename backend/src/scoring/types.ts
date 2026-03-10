export const SCORE_FACTOR_KEYS = [
  "crowdLevel",
  "lineLength",
  "socialActivity",
  "popularity",
  "recency",
  "confidence"
] as const;

export type ScoreFactorKey = (typeof SCORE_FACTOR_KEYS)[number];

export type ScoreFactorMap = Record<ScoreFactorKey, number>;

export interface RawVenueSignalsInput {
  venueId?: string;
  crowdLevel?: number | null;
  lineLengthMinutes?: number | null;
  socialActivity?: number | null;
  popularity?: number | null;
  confidence?: number | null;
  observedAt?: string | Date | null;
}

export interface RawUserReportInput {
  reportId?: string;
  venueId?: string;
  crowdLevel?: number | null;
  lineLengthMinutes?: number | null;
  socialActivity?: number | null;
  popularity?: number | null;
  confidence?: number | null;
  reportedAt?: string | Date | null;
}

export interface RawVenueScoringInput {
  venueId: string;
  signals?: RawVenueSignalsInput | null;
  reports?: RawUserReportInput[];
}

export interface NormalizedUserReport {
  reportId?: string;
  venueId: string;
  reportedAt: string | null;
  factors: Partial<Omit<ScoreFactorMap, "recency" | "confidence">>;
  recency: number;
  confidence: number;
}

export interface NormalizedVenueInput {
  venueId: string;
  factors: ScoreFactorMap;
  reports: NormalizedUserReport[];
  sourceCoverage: {
    signalFactors: number;
    reportFactors: number;
    reportCount: number;
  };
}

export interface NormalizationRange {
  min: number;
  max: number;
}

export interface NormalizationConfig {
  crowdLevel: NormalizationRange;
  lineLengthMinutes: NormalizationRange;
  socialActivity: NormalizationRange;
  popularity: NormalizationRange;
  confidence: NormalizationRange;
  freshnessHalfLifeMinutes: number;
  reportBlendWeight: number;
  missingFactorDefault: number;
  missingRecencyDefault: number;
  missingConfidenceDefault: number;
}

export interface NormalizationOptions {
  now?: Date | string;
  config?: PartialNormalizationConfig;
}

export interface PartialNormalizationConfig
  extends Partial<
    Omit<
      NormalizationConfig,
      "crowdLevel" | "lineLengthMinutes" | "socialActivity" | "popularity" | "confidence"
    >
  > {
  crowdLevel?: Partial<NormalizationRange>;
  lineLengthMinutes?: Partial<NormalizationRange>;
  socialActivity?: Partial<NormalizationRange>;
  popularity?: Partial<NormalizationRange>;
  confidence?: Partial<NormalizationRange>;
}

export interface ScoringWeights extends ScoreFactorMap {}

export type ScoreDirection = "higher-is-better" | "lower-is-better";

export interface ScoringConfig {
  weights: ScoringWeights;
  crowdLevelDirection: ScoreDirection;
  lineLengthDirection: ScoreDirection;
}

export interface ScoreVenueOptions {
  config?: PartialScoringConfig;
}

export interface PartialScoringConfig extends Partial<Omit<ScoringConfig, "weights">> {
  weights?: Partial<ScoringWeights>;
}

export interface VenueScore {
  venueId: string;
  score: number;
  normalizedFactors: ScoreFactorMap;
  adjustedFactors: ScoreFactorMap;
  weightedContributions: ScoreFactorMap;
}

export interface RankingOptions {
  minScore?: number;
  limit?: number;
}

export interface RankedRecommendation extends VenueScore {
  rank: number;
}

export interface ScoreAndRankOptions {
  now?: Date | string;
  normalization?: PartialNormalizationConfig;
  scoring?: PartialScoringConfig;
  ranking?: RankingOptions;
}
