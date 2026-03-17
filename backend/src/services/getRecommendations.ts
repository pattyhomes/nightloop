import {
  SCORE_FACTOR_KEYS,
  scoreAndRankVenues,
  type RankedRecommendation,
  type RawUserReportInput,
  type RawVenueScoringInput,
  type RawVenueSignalsInput,
  type ScoreFactorKey
} from "../scoring";
import { blendWithBaseline } from "../scoring/baselineSignal";
import { MOCK_REPORTS } from "../data/mockReports";
import { MOCK_SIGNALS } from "../data/mockSignals";
import { MOCK_VENUES } from "../data/mockVenues";
import { listLatestRecommendationSnapshots } from "../dataAccess/recommendationSnapshotRepository";
import { listSignalsForVenue } from "../dataAccess/signalRepository";
import type { Signal } from "../types/signal";

// Override via NIGHTLOOP_FIXED_NOW env var (dev/test only, off by default).
function getNow(): string {
  return process.env.NIGHTLOOP_FIXED_NOW ?? new Date().toISOString();
}

const RECOMMENDATION_LIMIT = 8;
const TOP_FACTOR_COUNT = 3;
const RECENT_SIGNAL_WINDOW_MINUTES = 180;
const RECENT_ACTIVITY_LIMIT = 6;
const ENTRY_MINUTES_PRESSURE_CAP = 60;

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

const ENERGY_SIGNAL_TYPES = new Set([
  "event_report",
  "social_activity",
  "popularity",
  "crowd_report",
  "crowd_level"
]);

const ENTRY_SIGNAL_TYPES = new Set(["line_report", "line_length_minutes"]);

// Keyed on mock string IDs (e.g. "venue-audio"). DB-backed snapshots store UUID venue_id;
// lookups against this map will miss until a UUID→mock-ID index is built using
// metadata->>'seed_id' from seed_venues.sql, or venue data is fetched directly from DB.
const VENUES_BY_ID = new Map(MOCK_VENUES.map((venue) => [venue.id, venue]));

export interface RecommendationFactor {
  factor: ScoreFactorKey;
  label: string;
  contribution: number;
  detail: string;
}

export interface RecentSignalActivity {
  signalType: string;
  timestamp: string;
  minutesAgo: number;
}

export type EnergyStatus = "High Energy" | "Steady Energy" | "Low-Key Energy";
export type EntryStatus = "Easy Entry" | "Manageable Line" | "Long Line";
export type TrendStatus = "Rising" | "Steady" | "Cooling";

export interface RecommendationStatuses {
  energyStatus: EnergyStatus;
  entryStatus: EntryStatus;
  trendStatus: TrendStatus;
}

export interface ScoredRecommendation extends RecommendationStatuses {
  id: string;
  venueId: string;
  venueName: string;
  neighborhood: string;
  category: string;
  score: number;
  why: string;
  factors: string[];
  topFactors: RecommendationFactor[];
  explanation: string;
  generatedAt: string;
  lastSignalType: string | null;
  signalCount: number;
  recentSignalCount: number;
  pulseLevel: 1 | 2 | 3;
  confidenceLabel: "Low" | "Medium" | "High";
  sourceSummary: string;
  userSignalCount: number;
  platformSignalCount: number;
  lastUpdatedAgoMinutes: number;
  recentActivity: RecentSignalActivity[];
  latitude: number;
  longitude: number;
  /**
   * Optional time-of-week context note, populated only when the baseline
   * is actively contributing to the score (recentSignalCount ≤ 2, non-off
   * time window). Absent when live signals dominate or when the current
   * time window has no useful baseline context.
   */
  baselineNote?: string;
}

export interface RecommendationsResponse {
  generatedAt: string;
  recommendations: ScoredRecommendation[];
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  const numeric = toNumber(value);
  if (numeric === undefined) return undefined;
  return Math.max(0, Math.round(numeric));
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function getLatestTimestamp(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function toMinutesAgo(timestamp: string | null | undefined, nowMs = Date.now()): number {
  if (!timestamp) return 0;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((nowMs - parsed) / 60_000));
}

function buildRecentActivity(
  signals: Signal[],
  nowMs = Date.now(),
  limit = RECENT_ACTIVITY_LIMIT
): RecentSignalActivity[] {
  return [...signals]
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))
    .slice(0, limit)
    .map((signal) => ({
      signalType: signal.signalType,
      timestamp: signal.observedAt,
      minutesAgo: toMinutesAgo(signal.observedAt, nowMs)
    }));
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
  if (factor === "crowdLevel") return adjustedValue >= 0.6 ? "Easier crowd flow right now" : "Moderate crowd pressure";
  if (factor === "lineLength") return adjustedValue >= 0.6 ? "Shorter wait to get in" : "Wait time is a bit longer";
  if (factor === "socialActivity") return adjustedValue >= 0.65 ? "Strong social energy" : "Steady social vibe";
  if (factor === "popularity") return adjustedValue >= 0.65 ? "High buzz tonight" : "Consistent local interest";
  if (factor === "recency") return adjustedValue >= 0.7 ? "Very recent check-ins" : "Mostly recent check-ins";
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

function toWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

function toTitleCase(value: string): string {
  const words = toWords(value).map((part) => part.toLowerCase());
  if (words.length === 0) return value.trim();

  return words
    .map((part, index) => {
      if (index > 0 && ["and", "or", "of", "to", "in"].includes(part)) {
        return part;
      }

      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function normalizeSource(value: unknown): string {
  const text = toText(value);
  if (!text) return "unknown";
  return text.toLowerCase();
}

function formatFactorValue(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;

  if (value >= 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
  }

  if (Math.abs(value) >= 100) {
    return `${Math.round(value)}`;
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

function cleanFactorDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, " ").replace(/_/g, " ").trim();
  if (!compact) return detail;
  return `${compact.charAt(0).toUpperCase()}${compact.slice(1)}`;
}

function formatFactorEntry(factor: unknown): string | undefined {
  if (typeof factor === "string") {
    const detail = toText(factor);
    return detail ? cleanFactorDetail(detail) : undefined;
  }

  if (!factor || typeof factor !== "object") return undefined;

  const factorRecord = factor as Record<string, unknown>;
  const detail = toText(factorRecord.detail);
  if (detail) return cleanFactorDetail(detail);

  const factorName =
    toText(factorRecord.label) ?? toText(factorRecord.factor) ?? toText(factorRecord.name) ?? "Signal";
  const scoreValue =
    factorRecord.contribution ?? factorRecord.value ?? factorRecord.score ?? factorRecord.signal_value;
  const signalType =
    toText(factorRecord.source_signal_type) ??
    toText(factorRecord.sourceSignalType) ??
    toText(factorRecord.signalType);
  const formattedValue = formatFactorValue(scoreValue);
  const formattedName = toTitleCase(factorName);
  const sourceSuffix = signalType ? ` from ${humanizeSignalType(signalType)}` : "";

  if (formattedValue) {
    return `${formattedName}: ${formattedValue}${sourceSuffix}`;
  }

  return `${formattedName}${sourceSuffix}`;
}

function summarizeSourceMix(signals: Signal[]): { userSignalCount: number; platformSignalCount: number } {
  let userSignalCount = 0;
  let platformSignalCount = 0;

  for (const signal of signals) {
    if (normalizeSource(signal.source) === "user") {
      userSignalCount += 1;
    } else {
      platformSignalCount += 1;
    }
  }

  return { userSignalCount, platformSignalCount };
}

function buildSignalMixWhy(
  venueName: string,
  signalCount: number,
  recentSignalCount: number,
  userSignalCount: number,
  platformSignalCount: number,
  lastSignalType: string | null,
  confidenceLabel: "Low" | "Medium" | "High",
  fallbackRationale: string | null
): string {
  if (signalCount <= 0 && userSignalCount <= 0 && platformSignalCount <= 0) {
    return fallbackRationale ?? `${venueName} surfaced from the latest recommendation snapshot.`;
  }

  const mixParts: string[] = [];
  if (userSignalCount > 0) {
    mixParts.push(formatCount(userSignalCount, "user report"));
  }
  if (platformSignalCount > 0) {
    mixParts.push(formatCount(platformSignalCount, "platform signal"));
  }

  const mixLabel = mixParts.length > 0 ? mixParts.join(" and ") : formatCount(signalCount, "signal");
  const recentLabel = recentSignalCount > 0 ? formatCount(recentSignalCount, "recent signal") : "limited recent updates";
  const signalTypeLabel = humanizeSignalType(lastSignalType);
  const activityClause = signalTypeLabel ? ` with ${signalTypeLabel} activity` : "";
  const baseSentence = `${venueName} is trending from ${mixLabel} (${recentLabel})${activityClause}.`;
  const confidenceSentence = `${confidenceLabel} confidence from current signal quality.`;

  if (!fallbackRationale) {
    return `${baseSentence} ${confidenceSentence}`;
  }

  return `${baseSentence} ${confidenceSentence} ${fallbackRationale}`;
}

function normalizePulseLevel(value: unknown): 1 | 2 | 3 | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 3) return 3;
    if (value >= 2) return 2;
    if (value >= 1) return 1;
    return undefined;
  }

  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return undefined;
}

function scoreToPulseLevel(score: number): 1 | 2 | 3 {
  if (score >= 0.7) return 3;
  if (score >= 0.4) return 2;
  return 1;
}

function normalizeConfidenceLabel(value: unknown): "Low" | "Medium" | "High" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "high confidence" || normalized === "high") return "High";
  if (normalized === "medium confidence" || normalized === "medium") return "Medium";
  if (normalized === "low confidence" || normalized === "low") return "Low";
  return undefined;
}

function countRecentSignals(signals: Signal[], nowMs = Date.now()): number {
  return signals.reduce((count, signal) => {
    const observedMs = Date.parse(signal.observedAt);
    if (Number.isNaN(observedMs)) return count;
    const ageMinutes = Math.max(0, (nowMs - observedMs) / 60_000);
    return ageMinutes <= RECENT_SIGNAL_WINDOW_MINUTES ? count + 1 : count;
  }, 0);
}

function getFallbackConfidenceLabel(
  signalCount: number,
  recentSignalCount: number
): "Low" | "Medium" | "High" {
  if (recentSignalCount >= 8 || (recentSignalCount >= 5 && signalCount >= 8)) {
    return "High";
  }
  if (recentSignalCount >= 3 || signalCount >= 5) {
    return "Medium";
  }
  return "Low";
}

interface RecommendationStatusInput {
  recommendationData: Record<string, unknown>;
  signals: Signal[];
  score: number;
  pulseLevel: 1 | 2 | 3;
  signalCount: number;
  recentSignalCount: number;
  lastUpdatedAgoMinutes: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSignalStrength(value: number): number {
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  return clamp(value, 0, 100);
}

function toMinutesPressure(value: number): number {
  return clamp((Math.max(0, value) / ENTRY_MINUTES_PRESSURE_CAP) * 100, 0, 100);
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => value !== undefined);
  return average(numbers);
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toNumber(source[key]);
    if (value !== undefined) return value;
  }

  return undefined;
}

function getAverageEnergyFromSignals(signals: Signal[]): number | undefined {
  const values: number[] = [];

  for (const signal of signals) {
    if (!ENERGY_SIGNAL_TYPES.has(signal.signalType)) continue;
    const signalValue = toNumber(signal.signalValue);
    if (signalValue === undefined) continue;
    values.push(normalizeSignalStrength(signalValue));
  }

  return average(values);
}

function getAverageEntryPressureFromSignals(signals: Signal[]): number | undefined {
  const values: number[] = [];

  for (const signal of signals) {
    if (!ENTRY_SIGNAL_TYPES.has(signal.signalType)) continue;
    const signalValue = toNumber(signal.signalValue);
    if (signalValue === undefined) continue;

    if (signal.signalType === "line_length_minutes") {
      values.push(toMinutesPressure(signalValue));
      continue;
    }

    values.push(normalizeSignalStrength(signalValue));
  }

  return average(values);
}

function deriveEnergyStatus(input: RecommendationStatusInput): EnergyStatus {
  const activityScore = pickNumber(input.recommendationData, ["activity"]);
  const socialScore = pickNumber(input.recommendationData, ["social_activity", "socialActivity"]);
  const popularityScore = pickNumber(input.recommendationData, ["popularity"]);
  const dataEnergyScore = averageDefined(
    [activityScore, socialScore, popularityScore].map((value) =>
      value === undefined ? undefined : normalizeSignalStrength(value)
    )
  );
  const signalEnergyScore = getAverageEnergyFromSignals(input.signals);
  const fallbackEnergyScore = averageDefined([
    input.pulseLevel === 3 ? 82 : input.pulseLevel === 2 ? 58 : 34,
    normalizeSignalStrength(input.score)
  ]);
  const energyScore = dataEnergyScore ?? signalEnergyScore ?? fallbackEnergyScore ?? 0;

  if (energyScore >= 70) return "High Energy";
  if (energyScore >= 45) return "Steady Energy";
  return "Low-Key Energy";
}

function deriveEntryStatus(input: RecommendationStatusInput): EntryStatus {
  const waitTimeScore = pickNumber(input.recommendationData, ["wait_time", "waitTime"]);
  const lineLengthMinutes = pickNumber(input.recommendationData, [
    "line_length_minutes",
    "lineLengthMinutes"
  ]);
  const dataEntryPressure =
    (waitTimeScore !== undefined ? normalizeSignalStrength(waitTimeScore) : undefined) ??
    (lineLengthMinutes !== undefined ? toMinutesPressure(lineLengthMinutes) : undefined);
  const signalEntryPressure = getAverageEntryPressureFromSignals(input.signals);
  const fallbackEntryPressure = averageDefined([
    input.pulseLevel === 3 ? 35 : input.pulseLevel === 2 ? 50 : 65,
    100 - normalizeSignalStrength(input.score)
  ]);
  const entryPressure = dataEntryPressure ?? signalEntryPressure ?? fallbackEntryPressure ?? 0;

  if (entryPressure <= 35) return "Easy Entry";
  if (entryPressure <= 65) return "Manageable Line";
  return "Long Line";
}

function deriveTrendStatus(input: RecommendationStatusInput): TrendStatus {
  if (input.signalCount <= 0) return "Cooling";

  const recentRatio = input.recentSignalCount / Math.max(1, input.signalCount);
  const isFresh = input.lastUpdatedAgoMinutes <= 20;

  if (
    input.recentSignalCount >= 5 &&
    recentRatio >= 0.5 &&
    isFresh &&
    input.pulseLevel >= 2
  ) {
    return "Rising";
  }

  if (
    (input.recentSignalCount >= 2 && recentRatio >= 0.25 && input.lastUpdatedAgoMinutes <= 90) ||
    isFresh
  ) {
    return "Steady";
  }

  return "Cooling";
}

function deriveRecommendationStatuses(input: RecommendationStatusInput): RecommendationStatuses {
  return {
    energyStatus: deriveEnergyStatus(input),
    entryStatus: deriveEntryStatus(input),
    trendStatus: deriveTrendStatus(input)
  };
}

function fallbackMockRecommendations(): RecommendationsResponse {
  const scoringInput = buildScoringInput();
  const now = getNow();
  const engineOutput = scoreAndRankVenues(scoringInput, {
    now,
    ranking: { limit: RECOMMENDATION_LIMIT, minScore: 0 }
  });

  const recommendations: ScoredRecommendation[] = [];
  const nowMs = Date.parse(now);

  for (const recommendation of engineOutput.recommendations) {
    const venue = VENUES_BY_ID.get(recommendation.venueId);
    if (!venue) continue;

    const topFactors = buildTopFactors(recommendation);
    const fallbackRationale = buildWhySentence(venue.name, topFactors);
    const mockSignals = MOCK_SIGNALS.filter((signal) => signal.venueId === venue.id);
    const userSignalCount = getReportsForVenue(venue.id).length;
    const platformSignalCount = mockSignals.length;
    const signalCount = userSignalCount + platformSignalCount;
    const recentSignalCount = countRecentSignals(mockSignals, nowMs) + userSignalCount;
    const confidenceLabel = getFallbackConfidenceLabel(signalCount, recentSignalCount);
    const lastSignalType = mockSignals[0]?.signalType ?? null;

    // Blend the raw scoring-engine score with the time-of-week baseline.
    // When mock signals are recent, baselineWeight approaches 0 and live data
    // fully dominates. The baseline only lifts rankings during sparse windows.
    const baselineResult = blendWithBaseline(
      recommendation.score,
      venue.category,
      recentSignalCount,
      new Date(now)
    );

    const pulseLevel = scoreToPulseLevel(baselineResult.score);
    const lastUpdatedAgoMinutes = toMinutesAgo(
      getLatestTimestamp(mockSignals.map((signal) => signal.observedAt)) ?? now,
      nowMs
    );
    const statuses = deriveRecommendationStatuses({
      recommendationData: {},
      signals: mockSignals,
      score: baselineResult.score,
      pulseLevel,
      signalCount,
      recentSignalCount,
      lastUpdatedAgoMinutes
    });
    const why = buildSignalMixWhy(
      venue.name,
      signalCount,
      recentSignalCount,
      userSignalCount,
      platformSignalCount,
      lastSignalType,
      confidenceLabel,
      fallbackRationale
    );

    recommendations.push({
      id: `rec-${recommendation.rank}-${venue.id}`,
      venueId: venue.id,
      venueName: venue.name,
      neighborhood: venue.neighborhood,
      category: venue.category,
      score: baselineResult.score,
      why,
      factors: topFactors.map((factor) => factor.detail),
      topFactors,
      explanation: why,
      generatedAt: now,
      lastSignalType,
      signalCount,
      recentSignalCount,
      pulseLevel,
      confidenceLabel,
      sourceSummary: buildSourceSummary(
        mockSignals,
        signalCount,
        lastSignalType,
        userSignalCount,
        platformSignalCount
      ),
      userSignalCount,
      platformSignalCount,
      lastUpdatedAgoMinutes,
      ...statuses,
      recentActivity: buildRecentActivity(mockSignals, nowMs),
      latitude: venue.latitude,
      longitude: venue.longitude,
      baselineNote: baselineResult.baselineNote
    });
  }

  return { generatedAt: now, recommendations };
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isPlaceholderVenueName(value: string | undefined): boolean {
  if (!value) return false;
  return /^Venue\s+v-\d+$/i.test(value.trim());
}

function isPlaceholderNeighborhood(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().toLowerCase() === "unknown";
}

function chooseVenueName(...candidates: Array<string | undefined>): string | undefined {
  const nonPlaceholder = candidates.find((candidate) => candidate && !isPlaceholderVenueName(candidate));
  return nonPlaceholder ?? candidates.find(Boolean);
}

function chooseNeighborhood(...candidates: Array<string | undefined>): string | undefined {
  const nonPlaceholder = candidates.find((candidate) => candidate && !isPlaceholderNeighborhood(candidate));
  return nonPlaceholder ?? candidates.find(Boolean);
}

function humanizeSignalType(signalType: string | null): string | null {
  if (!signalType) return null;
  return signalType.replace(/_/g, " ");
}

function buildSourceSummary(
  signals: Signal[],
  fallbackSignalCount: number,
  lastSignalType: string | null,
  userSignalCount: number,
  platformSignalCount: number
): string {
  if (signals.length === 0 && fallbackSignalCount <= 0 && userSignalCount <= 0 && platformSignalCount <= 0) {
    return "No recent signal provenance found.";
  }

  const typeLabel = humanizeSignalType(lastSignalType);
  const mixParts: string[] = [];
  if (userSignalCount > 0) {
    mixParts.push(formatCount(userSignalCount, "user report"));
  }
  if (platformSignalCount > 0) {
    mixParts.push(formatCount(platformSignalCount, "platform signal"));
  }

  if (signals.length === 0) {
    const fallbackCount = Math.max(fallbackSignalCount, userSignalCount + platformSignalCount);
    const fallbackMix = mixParts.length > 0 ? mixParts.join(", ") : formatCount(fallbackCount, "signal");
    return typeLabel
      ? `Signal mix: ${fallbackMix}; latest ${typeLabel}.`
      : `Signal mix: ${fallbackMix}; source breakdown unavailable.`;
  }

  const countsBySource = new Map<string, number>();
  for (const signal of signals) {
    const source = normalizeSource(signal.source);
    countsBySource.set(source, (countsBySource.get(source) ?? 0) + 1);
  }

  const sourceParts = [...countsBySource.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([source, count]) => `${formatCount(count, source === "user" ? "user report" : `${source} signal`)}`);
  const mixLabel = mixParts.length > 0 ? mixParts.join(", ") : sourceParts.join(", ");
  const sourcesSuffix = sourceParts.length > 0 ? ` Sources: ${sourceParts.join(", ")}.` : "";

  return typeLabel
    ? `Signal mix: ${mixLabel}; latest ${typeLabel}.${sourcesSuffix}`
    : `Signal mix: ${mixLabel}.${sourcesSuffix}`;
}

function compareRecommendations(left: ScoredRecommendation, right: ScoredRecommendation): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const rightGeneratedAt = Date.parse(right.generatedAt);
  const leftGeneratedAt = Date.parse(left.generatedAt);
  const rightTime = Number.isNaN(rightGeneratedAt) ? 0 : rightGeneratedAt;
  const leftTime = Number.isNaN(leftGeneratedAt) ? 0 : leftGeneratedAt;
  return rightTime - leftTime;
}

export async function getRecommendations(): Promise<RecommendationsResponse> {
  let snapshots: Awaited<ReturnType<typeof listLatestRecommendationSnapshots>>;

  try {
    snapshots = await listLatestRecommendationSnapshots(RECOMMENDATION_LIMIT);
  } catch (error) {
    console.warn("[recommendations] Falling back to mock recommendations:", error);
    return fallbackMockRecommendations();
  }

  if (snapshots.length === 0) {
    return fallbackMockRecommendations();
  }

  const recommendations: ScoredRecommendation[] = await Promise.all(
    snapshots.map(async (snapshot, index) => {
      const recommendationData = snapshot.recommendationData ?? {};
      const venue = VENUES_BY_ID.get(snapshot.venueId);
      const metadataVenue =
        recommendationData.venue && typeof recommendationData.venue === "object"
          ? (recommendationData.venue as Record<string, unknown>)
          : undefined;
      const venueName =
        chooseVenueName(
          toText(metadataVenue?.name),
          venue?.name,
          toText(recommendationData.venue_name),
          toText(recommendationData.venueName),
          toText(recommendationData.name)
        ) ?? `Venue ${snapshot.venueId.slice(0, 8)}`;
      const neighborhood =
        chooseNeighborhood(
          toText(metadataVenue?.neighborhood),
          venue?.neighborhood,
          toText(recommendationData.neighborhood),
          toText(recommendationData.venue_neighborhood),
          toText(recommendationData.venueNeighborhood)
        ) ?? "Unknown";
      const snapshotRationale = toText(snapshot.rationale) ?? null;
      const factorDetails = Array.isArray(snapshot.factors)
        ? snapshot.factors.map(formatFactorEntry).filter((value): value is string => Boolean(value))
        : [];

      const signalCountFromSnapshot =
        toPositiveInt(recommendationData.signal_count) ?? toPositiveInt(recommendationData.signalCount) ?? 0;
      const provenanceLimit = signalCountFromSnapshot > 0 ? Math.min(signalCountFromSnapshot, 200) : 50;
      const signalsForSummary = await listSignalsForVenue(snapshot.venueId, provenanceLimit).catch((error) => {
        console.warn("[recommendations] Failed to load signal provenance; continuing without it:", error);
        return [];
      });
      const sourceMix = summarizeSourceMix(signalsForSummary);
      const userSignalCount =
        toPositiveInt(recommendationData.user_signal_count) ??
        toPositiveInt(recommendationData.userSignalCount) ??
        sourceMix.userSignalCount;
      const platformSignalCount =
        toPositiveInt(recommendationData.platform_signal_count) ??
        toPositiveInt(recommendationData.platformSignalCount) ??
        (signalsForSummary.length > 0
          ? sourceMix.platformSignalCount
          : Math.max(0, signalCountFromSnapshot - userSignalCount));
      const signalCount = Math.max(signalCountFromSnapshot, userSignalCount + platformSignalCount);
      const lastSignalType =
        toText(recommendationData.last_signal_type) ??
        toText(recommendationData.lastSignalType) ??
        toText(signalsForSummary[0]?.signalType) ??
        null;
      const recentSignalCount =
        toPositiveInt(recommendationData.recent_signal_count) ??
        toPositiveInt(recommendationData.recentSignalCount) ??
        countRecentSignals(signalsForSummary);
      const pulseLevel =
        normalizePulseLevel(recommendationData.pulse_level) ??
        normalizePulseLevel(recommendationData.pulseLevel) ??
        scoreToPulseLevel(snapshot.score);
      const confidenceLabel =
        normalizeConfidenceLabel(recommendationData.confidence_label) ??
        normalizeConfidenceLabel(recommendationData.confidenceLabel) ??
        getFallbackConfidenceLabel(signalCount, recentSignalCount);
      const why = buildSignalMixWhy(
        venueName,
        signalCount,
        recentSignalCount,
        userSignalCount,
        platformSignalCount,
        lastSignalType,
        confidenceLabel,
        snapshotRationale
      );
      const latestSignalObservedAt = getLatestTimestamp(signalsForSummary.map((signal) => signal.observedAt));
      const lastUpdatedAgoMinutes =
        toPositiveInt(recommendationData.last_updated_ago_minutes) ??
        toPositiveInt(recommendationData.lastUpdatedAgoMinutes) ??
        toMinutesAgo(latestSignalObservedAt ?? snapshot.generatedAt);
      const statuses = deriveRecommendationStatuses({
        recommendationData,
        signals: signalsForSummary,
        score: snapshot.score,
        pulseLevel,
        signalCount,
        recentSignalCount,
        lastUpdatedAgoMinutes
      });
      const sourceSummary =
        toText(recommendationData.source_summary) ??
        toText(recommendationData.sourceSummary) ??
        buildSourceSummary(signalsForSummary, signalCount, lastSignalType, userSignalCount, platformSignalCount);
      const recentActivity = buildRecentActivity(signalsForSummary);

      // Category: prefer recommendationData (populated by DB JOIN in repository),
      // then fall back to mock venue lookup.
      const resolvedCategory = toText(recommendationData.category) ?? venue?.category ?? "";

      // Blend the snapshot score with the time-of-week baseline.
      // When recentSignalCount is 0 (no live signals for this venue), the baseline
      // contributes up to 30% of the final score, keeping rankings sensible.
      const baselineResult = blendWithBaseline(snapshot.score, resolvedCategory, recentSignalCount);

      // Coordinates: prefer recommendationData (populated by DB JOIN in repository),
      // then fall back to mock venue lookup, then log a warning if genuinely missing.
      // The mock venue map is keyed by slug IDs and will miss when snapshot.venueId is a UUID.
      const resolvedLatitude = toNumber(recommendationData.latitude) ?? venue?.latitude;
      const resolvedLongitude = toNumber(recommendationData.longitude) ?? venue?.longitude;
      if (resolvedLatitude == null || resolvedLongitude == null) {
        console.warn(
          `[recommendations] No coordinates for venue ${snapshot.venueId} — ` +
          "UUID/mock-ID mismatch. Map marker will render at (0, 0) and should be filtered by the client."
        );
      }

      return {
        id: `rec-snapshot-${index + 1}-${snapshot.id}`,
        venueId: snapshot.venueId,
        venueName,
        neighborhood,
        category: resolvedCategory,
        score: baselineResult.score,
        why,
        factors: factorDetails,
        topFactors: [],
        explanation: why,
        generatedAt: snapshot.generatedAt,
        lastSignalType,
        signalCount,
        recentSignalCount,
        pulseLevel,
        confidenceLabel,
        sourceSummary,
        userSignalCount,
        platformSignalCount,
        lastUpdatedAgoMinutes,
        ...statuses,
        recentActivity,
        latitude: resolvedLatitude ?? 0,
        longitude: resolvedLongitude ?? 0,
        baselineNote: baselineResult.baselineNote
      };
    })
  );

  if (recommendations.length >= RECOMMENDATION_LIMIT) {
    recommendations.sort(compareRecommendations);
    return {
      generatedAt: getLatestTimestamp(recommendations.map((item) => item.generatedAt)) ?? new Date().toISOString(),
      recommendations
    };
  }

  // Snapshot rows are often written per-venue after user signals; merge into baseline instead of replacing the list.
  const baseline = fallbackMockRecommendations();
  const snapshotByVenueId = new Map(recommendations.map((item) => [item.venueId, item]));
  const mergedRecommendations = baseline.recommendations.map(
    (item) => snapshotByVenueId.get(item.venueId) ?? item
  );
  mergedRecommendations.sort(compareRecommendations);

  return {
    generatedAt:
      getLatestTimestamp(mergedRecommendations.map((item) => item.generatedAt)) ?? baseline.generatedAt,
    recommendations: mergedRecommendations
  };
}
