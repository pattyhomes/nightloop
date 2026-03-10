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
const TOP_FACTOR_COUNT = 3;

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
  socialActivity: "Social energy",
  popularity: "Buzz",
  recency: "Fresh updates",
  confidence: "Reliable check-ins"
};

const VENUES_BY_ID = new Map(MOCK_VENUES.map((venue) => [venue.id, venue]));

export interface RecommendationFactor {
  factor: ScoreFactorKey;
  label: string;
  contribution: number;
  detail: string;
}

export interface ScoredRecommendation {
  id: string;
  venueName: string;
  neighborhood: string;
  score: number;
  why: string;
  factors: string[];
  topFactors: RecommendationFactor[];
  explanation: string;
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
  if (values.length === 0) {
    return undefined;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function getLatestTimestamp(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((latest, value) => {
    if (Date.parse(value) > Date.parse(latest)) {
      return value;
    }

    return latest;
  });
}

function getSignalsForVenue(venueId: string): RawVenueSignalsInput | undefined {
  const buckets: Partial<Record<SignalFactorKey, number[]>> = {};
  const confidenceValues: number[] = [];
  const observedAtValues: string[] = [];

  for (const signal of MOCK_SIGNALS) {
    if (signal.venueId !== venueId) {
      continue;
    }

    const factor = SIGNAL_TYPE_TO_FACTOR[signal.signalType];
    const signalValue = toNumber(signal.signalValue);

    if (factor && signalValue !== undefined) {
      const current = buckets[factor] ?? [];
      current.push(signalValue);
      buckets[factor] = current;
    }

    const confidence = toNumber(signal.confidence);
    if (confidence !== undefined) {
      confidenceValues.push(confidence);
    }

    observedAtValues.push(signal.observedAt);
  }

  if (
    Object.keys(buckets).length === 0 &&
    confidenceValues.length === 0 &&
    observedAtValues.length === 0
  ) {
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
  return MOCK_REPORTS.filter((report) => report.venueId === venueId).map((report) => {
    const reportData = report.reportData;

    return {
      reportId: report.id,
      venueId: report.venueId,
      crowdLevel: toNumber(reportData.crowdLevel),
      lineLengthMinutes: toNumber(reportData.lineLengthMinutes),
      socialActivity: toNumber(reportData.socialActivity),
      popularity: toNumber(reportData.popularity),
      confidence: toNumber(reportData.confidence),
      reportedAt: report.reportedAt
    };
  });
}

function buildScoringInput(): RawVenueScoringInput[] {
  return MOCK_VENUES.map((venue) => ({
    venueId: venue.id,
    signals: getSignalsForVenue(venue.id),
    reports: getReportsForVenue(venue.id)
  }));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function describeFactor(factor: ScoreFactorKey, adjustedValue: number): string {
  if (factor === "crowdLevel") {
    return adjustedValue >= 0.6 ? "Easier crowd flow right now" : "Moderate crowd pressure";
  }

  if (factor === "lineLength") {
    return adjustedValue >= 0.6 ? "Shorter wait to get in" : "Wait time is a bit longer";
  }

  if (factor === "socialActivity") {
    return adjustedValue >= 0.65 ? "Strong social energy" : "Steady social vibe";
  }

  if (factor === "popularity") {
    return adjustedValue >= 0.65 ? "High buzz tonight" : "Consistent local interest";
  }

  if (factor === "recency") {
    return adjustedValue >= 0.7 ? "Very recent check-ins" : "Mostly recent check-ins";
  }

  return adjustedValue >= 0.7 ? "Reliable signal quality" : "Mixed but usable signal quality";
}

function buildTopFactors(recommendation: RankedRecommendation): RecommendationFactor[] {
  return [...SCORE_FACTOR_KEYS]
    .map((factor) => ({
      factor,
      label: FACTOR_LABELS[factor],
      contribution: round4(recommendation.weightedContributions[factor]),
      detail: describeFactor(factor, recommendation.adjustedFactors[factor])
    }))
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, TOP_FACTOR_COUNT);
}

function buildWhySentence(venueName: string, topFactors: RecommendationFactor[]): string {
  const strongest = topFactors[0]?.detail?.toLowerCase() ?? "a strong overall vibe";
  return `${venueName} is recommended because it has ${strongest}.`;
}

export function getRecommendations(): RecommendationsResponse {
  const scoringInput = buildScoringInput();
  const engineOutput = scoreAndRankVenues(scoringInput, {
    now: FIXED_NOW,
    ranking: {
      limit: 8,
      minScore: 0
    }
  });

  const recommendations: ScoredRecommendation[] = [];

  for (const recommendation of engineOutput.recommendations) {
    const venue = VENUES_BY_ID.get(recommendation.venueId);

    if (!venue) {
      continue;
    }

    const topFactors = buildTopFactors(recommendation);
    const why = buildWhySentence(venue.name, topFactors);

    recommendations.push({
      id: `rec-${recommendation.rank}-${venue.id}`,
      venueName: venue.name,
      neighborhood: venue.neighborhood,
      score: recommendation.score,
      why,
      factors: topFactors.map((factor) => factor.detail),
      topFactors,
      explanation: why,
      generatedAt: GENERATED_AT
    });
  }

  return {
    generatedAt: GENERATED_AT,
    recommendations
  };
}
