import { mockReportsByVenueId } from "../data/mockReports";
import { mockSignalsByVenueId } from "../data/mockSignals";
import { mockVenues } from "../data/mockVenues";
import { scoreAndRankVenues, type ScoreFactorKey } from "../scoring";

export type RecommendationResponseItem = {
  id: string;
  venueName: string;
  neighborhood: string;
  score: number;
  topFactors: Array<{ factor: string; contribution: number }>;
  explanation: string;
  generatedAt: string;
};

const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  crowdLevel: "Low crowd level",
  lineLength: "Short line",
  socialActivity: "High social activity",
  popularity: "Strong popularity",
  recency: "Fresh signal data",
  confidence: "High confidence"
};

const DETERMINISTIC_NOW = new Date("2026-03-09T20:30:00.000Z");

export function getRecommendations(): RecommendationResponseItem[] {
  const inputs = mockVenues.map((venue) => ({
    venueId: venue.id,
    signals: mockSignalsByVenueId[venue.id],
    reports: mockReportsByVenueId[venue.id] ?? []
  }));

  const engine = scoreAndRankVenues(inputs, {
    now: DETERMINISTIC_NOW,
    ranking: { limit: 7 }
  });

  const scoreByVenueId = new Map(engine.scored.map((s) => [s.venueId, s]));

  return engine.recommendations.map((rec) => {
    const venue = mockVenues.find((v) => v.id === rec.venueId)!;
    const scored = scoreByVenueId.get(rec.venueId)!;

    const topFactors = Object.entries(scored.weightedContributions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([factor, contribution]) => ({
        factor: FACTOR_LABELS[factor as ScoreFactorKey],
        contribution: Math.round(contribution * 10000) / 10000
      }));

    return {
      id: venue.id,
      venueName: venue.name,
      neighborhood: venue.neighborhood,
      score: rec.score,
      topFactors,
      explanation: topFactors.map((f) => f.factor).join(", "),
      generatedAt: DETERMINISTIC_NOW.toISOString()
    };
  });
}
