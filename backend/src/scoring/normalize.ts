import type {
  NormalizationConfig,
  NormalizationOptions,
  NormalizedUserReport,
  NormalizedVenueInput,
  PartialNormalizationConfig,
  RawUserReportInput,
  RawVenueScoringInput
} from "./types";

const MINUTES_TO_MS = 60_000;

export const DEFAULT_NORMALIZATION_CONFIG: NormalizationConfig = {
  crowdLevel: { min: 0, max: 100 },
  lineLengthMinutes: { min: 0, max: 90 },
  socialActivity: { min: 0, max: 100 },
  popularity: { min: 0, max: 100 },
  confidence: { min: 0, max: 1 },
  freshnessHalfLifeMinutes: 180,
  reportBlendWeight: 0.35,
  missingFactorDefault: 0.5,
  missingRecencyDefault: 0,
  missingConfidenceDefault: 0.5
};

export function clamp01(value: number): number {
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

export function resolveNormalizationConfig(overrides: PartialNormalizationConfig = {}): NormalizationConfig {
  return {
    ...DEFAULT_NORMALIZATION_CONFIG,
    ...overrides,
    crowdLevel: { ...DEFAULT_NORMALIZATION_CONFIG.crowdLevel, ...overrides.crowdLevel },
    lineLengthMinutes: { ...DEFAULT_NORMALIZATION_CONFIG.lineLengthMinutes, ...overrides.lineLengthMinutes },
    socialActivity: { ...DEFAULT_NORMALIZATION_CONFIG.socialActivity, ...overrides.socialActivity },
    popularity: { ...DEFAULT_NORMALIZATION_CONFIG.popularity, ...overrides.popularity },
    confidence: { ...DEFAULT_NORMALIZATION_CONFIG.confidence, ...overrides.confidence }
  };
}

export function normalizeToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }

  return clamp01((value - min) / (max - min));
}

function normalizeOptionalValue(value: number | null | undefined, min: number, max: number): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return normalizeToRange(value, min, max);
}

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

export function computeFreshness(
  observedAt: Date | string | null | undefined,
  now: Date,
  halfLifeMinutes: number
): number {
  const parsedObservedAt = toDate(observedAt);

  if (!parsedObservedAt || halfLifeMinutes <= 0) {
    return 0;
  }

  const ageMinutes = Math.max(0, (now.getTime() - parsedObservedAt.getTime()) / MINUTES_TO_MS);
  const freshness = Math.pow(0.5, ageMinutes / halfLifeMinutes);

  return clamp01(freshness);
}

function average(values: Array<number | undefined>): number | undefined {
  let sum = 0;
  let count = 0;

  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }

    sum += value;
    count += 1;
  }

  return count > 0 ? sum / count : undefined;
}

function countDefined(values: Array<number | undefined>): number {
  let count = 0;

  for (const value of values) {
    if (value !== undefined) {
      count += 1;
    }
  }

  return count;
}

function blend(primary: number | undefined, secondary: number | undefined, secondaryWeight: number): number | undefined {
  const boundedSecondaryWeight = clamp01(secondaryWeight);

  if (primary === undefined && secondary === undefined) {
    return undefined;
  }

  if (primary === undefined) {
    return secondary;
  }

  if (secondary === undefined) {
    return primary;
  }

  const primaryWeight = 1 - boundedSecondaryWeight;
  return primary * primaryWeight + secondary * boundedSecondaryWeight;
}

export function normalizeUserReport(
  venueId: string,
  report: RawUserReportInput,
  now: Date,
  config: NormalizationConfig
): NormalizedUserReport {
  const crowdLevel = normalizeOptionalValue(report.crowdLevel, config.crowdLevel.min, config.crowdLevel.max);
  const lineLength = normalizeOptionalValue(
    report.lineLengthMinutes,
    config.lineLengthMinutes.min,
    config.lineLengthMinutes.max
  );
  const socialActivity = normalizeOptionalValue(
    report.socialActivity,
    config.socialActivity.min,
    config.socialActivity.max
  );
  const popularity = normalizeOptionalValue(report.popularity, config.popularity.min, config.popularity.max);
  const confidence = normalizeOptionalValue(report.confidence, config.confidence.min, config.confidence.max);
  const recency = computeFreshness(report.reportedAt, now, config.freshnessHalfLifeMinutes);

  return {
    reportId: report.reportId,
    venueId: report.venueId ?? venueId,
    reportedAt: toDate(report.reportedAt)?.toISOString() ?? null,
    factors: {
      crowdLevel,
      lineLength,
      socialActivity,
      popularity
    },
    recency,
    confidence: confidence ?? config.missingConfidenceDefault
  };
}

export function normalizeVenueInput(
  input: RawVenueScoringInput,
  options: NormalizationOptions = {}
): NormalizedVenueInput {
  const now = toDate(options.now) ?? new Date();
  const config = resolveNormalizationConfig(options.config);
  const signals = input.signals ?? undefined;

  const signalCrowdLevel = normalizeOptionalValue(signals?.crowdLevel, config.crowdLevel.min, config.crowdLevel.max);
  const signalLineLength = normalizeOptionalValue(
    signals?.lineLengthMinutes,
    config.lineLengthMinutes.min,
    config.lineLengthMinutes.max
  );
  const signalSocialActivity = normalizeOptionalValue(
    signals?.socialActivity,
    config.socialActivity.min,
    config.socialActivity.max
  );
  const signalPopularity = normalizeOptionalValue(signals?.popularity, config.popularity.min, config.popularity.max);
  const signalRecency = computeFreshness(signals?.observedAt, now, config.freshnessHalfLifeMinutes);
  const signalConfidence = normalizeOptionalValue(signals?.confidence, config.confidence.min, config.confidence.max);

  const reports = (input.reports ?? []).map((report) => normalizeUserReport(input.venueId, report, now, config));

  const reportCrowdLevel = average(reports.map((report) => report.factors.crowdLevel));
  const reportLineLength = average(reports.map((report) => report.factors.lineLength));
  const reportSocialActivity = average(reports.map((report) => report.factors.socialActivity));
  const reportPopularity = average(reports.map((report) => report.factors.popularity));
  const reportRecency = average(reports.map((report) => report.recency));
  const reportConfidence = average(reports.map((report) => report.confidence));

  const crowdLevel = blend(signalCrowdLevel, reportCrowdLevel, config.reportBlendWeight);
  const lineLength = blend(signalLineLength, reportLineLength, config.reportBlendWeight);
  const socialActivity = blend(signalSocialActivity, reportSocialActivity, config.reportBlendWeight);
  const popularity = blend(signalPopularity, reportPopularity, config.reportBlendWeight);
  const recency = blend(signalRecency, reportRecency, config.reportBlendWeight);
  const confidence = blend(signalConfidence, reportConfidence, config.reportBlendWeight);

  return {
    venueId: input.venueId,
    factors: {
      crowdLevel: crowdLevel ?? config.missingFactorDefault,
      lineLength: lineLength ?? config.missingFactorDefault,
      socialActivity: socialActivity ?? config.missingFactorDefault,
      popularity: popularity ?? config.missingFactorDefault,
      recency: recency ?? config.missingRecencyDefault,
      confidence: confidence ?? config.missingConfidenceDefault
    },
    reports,
    sourceCoverage: {
      signalFactors: countDefined([
        signalCrowdLevel,
        signalLineLength,
        signalSocialActivity,
        signalPopularity,
        signalConfidence
      ]),
      reportFactors:
        countDefined([reportCrowdLevel, reportLineLength, reportSocialActivity, reportPopularity]) +
        (reportConfidence === undefined ? 0 : 1),
      reportCount: reports.length
    }
  };
}
