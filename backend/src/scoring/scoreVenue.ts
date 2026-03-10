import type {
  NormalizedVenueInput,
  PartialScoringConfig,
  ScoreDirection,
  ScoreVenueOptions,
  ScoreFactorMap,
  ScoringConfig,
  ScoringWeights,
  VenueScore
} from "./types";

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    crowdLevel: 0.25,
    lineLength: 0.2,
    socialActivity: 0.2,
    popularity: 0.15,
    recency: 0.1,
    confidence: 0.1
  },
  crowdLevelDirection: "lower-is-better",
  lineLengthDirection: "lower-is-better"
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function applyDirection(value: number, direction: ScoreDirection): number {
  const boundedValue = clamp01(value);
  return direction === "lower-is-better" ? 1 - boundedValue : boundedValue;
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const totalWeight =
    weights.crowdLevel +
    weights.lineLength +
    weights.socialActivity +
    weights.popularity +
    weights.recency +
    weights.confidence;

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return { ...DEFAULT_SCORING_CONFIG.weights };
  }

  return {
    crowdLevel: weights.crowdLevel / totalWeight,
    lineLength: weights.lineLength / totalWeight,
    socialActivity: weights.socialActivity / totalWeight,
    popularity: weights.popularity / totalWeight,
    recency: weights.recency / totalWeight,
    confidence: weights.confidence / totalWeight
  };
}

export function resolveScoringConfig(overrides: PartialScoringConfig = {}): ScoringConfig {
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...overrides,
    weights: normalizeWeights({
      ...DEFAULT_SCORING_CONFIG.weights,
      ...overrides.weights
    })
  };
}

export function scoreVenue(input: NormalizedVenueInput, options: ScoreVenueOptions = {}): VenueScore {
  const config = resolveScoringConfig(options.config);
  const normalizedFactors: ScoreFactorMap = {
    crowdLevel: clamp01(input.factors.crowdLevel),
    lineLength: clamp01(input.factors.lineLength),
    socialActivity: clamp01(input.factors.socialActivity),
    popularity: clamp01(input.factors.popularity),
    recency: clamp01(input.factors.recency),
    confidence: clamp01(input.factors.confidence)
  };

  const adjustedFactors: ScoreFactorMap = {
    crowdLevel: applyDirection(normalizedFactors.crowdLevel, config.crowdLevelDirection),
    lineLength: applyDirection(normalizedFactors.lineLength, config.lineLengthDirection),
    socialActivity: normalizedFactors.socialActivity,
    popularity: normalizedFactors.popularity,
    recency: normalizedFactors.recency,
    confidence: normalizedFactors.confidence
  };

  const weightedContributions: ScoreFactorMap = {
    crowdLevel: adjustedFactors.crowdLevel * config.weights.crowdLevel,
    lineLength: adjustedFactors.lineLength * config.weights.lineLength,
    socialActivity: adjustedFactors.socialActivity * config.weights.socialActivity,
    popularity: adjustedFactors.popularity * config.weights.popularity,
    recency: adjustedFactors.recency * config.weights.recency,
    confidence: adjustedFactors.confidence * config.weights.confidence
  };

  const score = roundScore(
    weightedContributions.crowdLevel +
      weightedContributions.lineLength +
      weightedContributions.socialActivity +
      weightedContributions.popularity +
      weightedContributions.recency +
      weightedContributions.confidence
  );

  return {
    venueId: input.venueId,
    score,
    normalizedFactors,
    adjustedFactors,
    weightedContributions
  };
}
