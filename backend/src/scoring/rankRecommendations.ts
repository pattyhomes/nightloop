import type { RankedRecommendation, RankingOptions, VenueScore } from "./types";

const DEFAULT_MIN_SCORE = 0;

export function rankRecommendations(
  scores: VenueScore[],
  options: RankingOptions = {}
): RankedRecommendation[] {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const limited = options.limit;

  const ranked = scores
    .filter((score) => score.score >= minScore)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.normalizedFactors.confidence !== left.normalizedFactors.confidence) {
        return right.normalizedFactors.confidence - left.normalizedFactors.confidence;
      }

      if (right.normalizedFactors.recency !== left.normalizedFactors.recency) {
        return right.normalizedFactors.recency - left.normalizedFactors.recency;
      }

      return left.venueId.localeCompare(right.venueId);
    })
    .map((score, index) => ({
      ...score,
      rank: index + 1
    }));

  if (limited === undefined || limited < 0) {
    return ranked;
  }

  return ranked.slice(0, Math.max(0, limited));
}
