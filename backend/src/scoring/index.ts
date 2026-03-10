import { normalizeVenueInput } from "./normalize";
import { rankRecommendations } from "./rankRecommendations";
import { scoreVenue } from "./scoreVenue";
import type {
  NormalizedVenueInput,
  RankedRecommendation,
  ScoreAndRankOptions,
  VenueScore,
  RawVenueScoringInput
} from "./types";

export * from "./types";
export * from "./normalize";
export * from "./scoreVenue";
export * from "./rankRecommendations";

export interface ScoringEngineOutput {
  normalized: NormalizedVenueInput[];
  scored: VenueScore[];
  recommendations: RankedRecommendation[];
}

export function scoreAndRankVenues(
  venues: RawVenueScoringInput[],
  options: ScoreAndRankOptions = {}
): ScoringEngineOutput {
  const normalized = venues.map((venue) =>
    normalizeVenueInput(venue, {
      now: options.now,
      config: options.normalization
    })
  );

  const scored = normalized.map((venue) =>
    scoreVenue(venue, {
      config: options.scoring
    })
  );

  const recommendations = rankRecommendations(scored, options.ranking);

  return {
    normalized,
    scored,
    recommendations
  };
}
