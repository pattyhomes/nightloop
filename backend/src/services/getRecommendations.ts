import {
  SCORE_FACTOR_KEYS,
  scoreAndRankVenues,
  type RankedRecommendation,
  type RawUserReportInput,
  type RawVenueScoringInput,
  type RawVenueSignalsInput,
  type ScoreFactorKey
} from "../scoring";
import { MOCK_REPORTS } from "../data/mockReports";
import { MOCK_SIGNALS } from "../data/mockSignals";
import { MOCK_VENUES } from "../data/mockVenues";

const FIXED_NOW = "2026-03-09T04:00:00.000Z";
const GENERATED_AT = "2026-03-09T04:00:00.000Z";

type SignalFactorKey = "crowdLevel" | "lineLengthMinutes" | "socialActivity" | "popularity";

const SIGNAL_TYPE_TO_FACTOR: Record<string, SignalFactorKey> = {
  crowd_level: "crowdLevel",
  line_length_minutes: "lineLengthMinutes",
  social_activity: "socialActivity",
  popularity: "popularity"
};

const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  crowdLevel: "Crowd level",
  lineLength: "Line length",
  socialActivity: "Social vibe",
  popularity: "Popularity",
  recency: "Fresh updates",
  confidence: "Signal confidence"
};

const VENUES_BY_ID = new Map(MOCK_VENUES.map((venue) => [venue.id, venue]));

export interface ScoredRecommendation {
  id: string;
  venueName: string;
  neighborhood: string;
  score: number;
  why: string;
  factors: string[];
  generatedAt: string;
}

export interface RecommendationsResponse {
  generatedAt: string;
  recommendations: ScoredRecommendation[];
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLatestTimestamp(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function getSignalsForVenue(venueId: string): RawVenueSignalsInput | undefined {
  const buckets: Partial<Record<SignalFactorKey, number[]>> = {};
  const confidenceValues: number[] = [];
  const observedAtValues: string[] = [];

  for (const signal of MOCK_SIGNALS) {
    if (signal.venueId !== venueId) continue;

    const factor = SIGNAL_TYPE_TO_FACTOR[signal.signalType];
    const signalValue = toNumber(signal.signalValue);

    if (factor && signalValue !== undefined) {
      const current = buckets[factor] ?? [];
      current.push(signalValue);
      buckets[factor] = current;
    }

    const confidence = toNumber(signal.confidence);
    if (confidence !== undefined) confidenceValues.push(confidence);
    observedAtValues.push(signal.observedAt);
  }

  if (Object.keys(buckets).length === 0 && confidenceValues.length === 0 && observedAtValues.length === 0) {
    return undefined;
  }

  return {
    venueId,
    crowdLevel: average(buckets.crowdLevel ?? []),
    lineLengthMinutes: average(buckets.lineLengthMinutes ?? []),
    socialActivity: average(buckets.socialActivity ?? []),
    popularity: average(buckets.popularity ?? []),
    confidence: average(confidenceValues),
    observedAt: getLatestTimestamp(observedAtValues)
  };
}

function getReportsForVenue(venueId: string): RawUserReportInput[] {
  return MOCK_REPORTS.filter((report) => report.venueId === venueId).map((report) => ({
    reportId: report.id,
    venueId: report.venueId,
    crowdLevel: toNumber(report.reportData.crowdLevel),
    lineLengthMinutes: toNumber(report.reportData.lineLengthMinutes),
    socialActivity: toNumber(report.reportData.socialActivity),
    popularity: toNumber(report.reportData.popularity),
    confidence: toNumber(report.reportData.confidence),
    reportedAt: report.reportedAt
  }));
}

function buildScoringInput(): RawVenueScoringInput[] {
  return MOCK_VENUES.map((venue) => ({
    venueId: venue.id,
    signals: getSignalsForVenue(venue.id),
    reports: getReportsForVenue(venue.id)
  }));
}

function toFactors(recommendation: RankedRecommendation): string[] {
  return [...SCORE_FACTOR_KEYS]
    .sort((a, b) => recommendation.weightedContributions[b] - recommendation.weightedContributions[a])
    .slice(0, 3)
    .map((factor) => FACTOR_LABELS[factor]);
}

function toWhySentence(recommendation: RankedRecommendation, factors: string[]): string {
  const score = recommendation.score;
  const tone = score >= 0.75 ? "Great pick tonight" : score >= 0.6 ? "Solid option tonight" : "Worth checking out";
  return `${tone} because of ${factors.slice(0, 2).join(" and ")}.`;
}

export function getRecommendations(): RecommendationsResponse {
  const engineOutput = scoreAndRankVenues(buildScoringInput(), {
    now: FIXED_NOW,
    ranking: { limit: 8, minScore: 0 }
  });

  const recommendations: ScoredRecommendation[] = [];

  for (const recommendation of engineOutput.recommendations) {
    const venue = VENUES_BY_ID.get(recommendation.venueId);
    if (!venue) continue;

    const factors = toFactors(recommendation);

    recommendations.push({
      id: `rec-${recommendation.rank}-${venue.id}`,
      venueName: venue.name,
      neighborhood: venue.neighborhood,
      score: recommendation.score,
      why: toWhySentence(recommendation, factors),
      factors,
      generatedAt: GENERATED_AT
    });
  }

  return {
    generatedAt: GENERATED_AT,
    recommendations
  };
}
