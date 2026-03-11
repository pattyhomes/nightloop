import { randomUUID } from "crypto";
import {
  insertSignal,
  listSignalsForVenue,
  type CreateSignalInput
} from "../dataAccess/signalRepository";
import { insertRecommendationSnapshot } from "../dataAccess/recommendationSnapshotRepository";
import type { RecommendationSnapshot } from "../types/recommendationSnapshot";
import type { Signal } from "../types/signal";

const ALLOWED_SIGNAL_TYPES = new Set(["crowd_report", "line_report", "event_report"]);
const ALLOWED_SOURCES = new Set(["user", "scraper", "manual"]);

const SNAPSHOT_SCALE = 0.25;

export type SignalType = "crowd_report" | "line_report" | "event_report";
export type SignalSource = "user" | "scraper" | "manual";

export interface SignalEventInput {
  venue_id: string;
  signal_type: SignalType;
  signal_strength: number;
  source: SignalSource;
  metadata?: Record<string, unknown>;
  observed_at?: string;
  confidence?: number | null;
}

export interface IngestSignalResult {
  signal: Signal;
  snapshot: RecommendationSnapshot;
}

interface SnapshotMetrics {
  popularity: number;
  wait_time: number;
  activity: number;
  score: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeStrength(value: number): number {
  const positive = Math.max(0, value);
  if (positive <= 1) {
    return positive * 100;
  }
  return Math.min(positive, 100);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function validateSignalEvent(input: SignalEventInput): void {
  if (typeof input.venue_id !== "string" || input.venue_id.trim().length === 0) {
    throw new Error("Invalid signal event: venue_id must be a non-empty string.");
  }

  if (!ALLOWED_SIGNAL_TYPES.has(input.signal_type)) {
    throw new Error(
      "Invalid signal event: signal_type must be one of crowd_report, line_report, event_report."
    );
  }

  if (typeof input.signal_strength !== "number" || !Number.isFinite(input.signal_strength)) {
    throw new Error("Invalid signal event: signal_strength must be a finite number.");
  }

  if (!ALLOWED_SOURCES.has(input.source)) {
    throw new Error("Invalid signal event: source must be one of user, scraper, manual.");
  }

  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    throw new Error("Invalid signal event: metadata must be an object when provided.");
  }

  if (input.confidence !== undefined && input.confidence !== null) {
    if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) {
      throw new Error("Invalid signal event: confidence must be a finite number when provided.");
    }
    if (input.confidence < 0 || input.confidence > 1) {
      throw new Error("Invalid signal event: confidence must be between 0 and 1.");
    }
  }

  if (input.observed_at !== undefined && Number.isNaN(Date.parse(input.observed_at))) {
    throw new Error("Invalid signal event: observed_at must be a valid ISO timestamp when provided.");
  }
}

function computeMetrics(signals: Signal[]): SnapshotMetrics {
  let popularity = 0;
  let waitTime = 0;
  let activity = 0;

  for (const signal of signals) {
    const baseStrength = normalizeStrength(signal.signalValue ?? 0);
    const weightedStrength = baseStrength * SNAPSHOT_SCALE;

    if (signal.signalType === "crowd_report") {
      popularity = clamp(popularity + weightedStrength, 0, 100);
      continue;
    }

    if (signal.signalType === "line_report") {
      waitTime = clamp(waitTime + weightedStrength, 0, 100);
      continue;
    }

    if (signal.signalType === "event_report") {
      activity = clamp(activity + weightedStrength, 0, 100);
    }
  }

  const score = round5(clamp((popularity * 0.45 + activity * 0.35 + (100 - waitTime) * 0.2) / 100, 0, 1));

  return {
    popularity: round2(popularity),
    wait_time: round2(waitTime),
    activity: round2(activity),
    score
  };
}

function toCreateSignalInput(input: SignalEventInput, observedAt: string): CreateSignalInput {
  return {
    venueId: input.venue_id,
    signalType: input.signal_type,
    signalValue: input.signal_strength,
    confidence: input.confidence ?? null,
    observedAt,
    source: input.source,
    payload: input.metadata ?? {}
  };
}

export async function ingestSignal(signalEvent: SignalEventInput): Promise<IngestSignalResult> {
  validateSignalEvent(signalEvent);

  const observedAt = signalEvent.observed_at ?? new Date().toISOString();

  const signal = await insertSignal(toCreateSignalInput(signalEvent, observedAt));
  const recentSignals = await listSignalsForVenue(signalEvent.venue_id, 200);
  const metrics = computeMetrics(recentSignals);
  const generatedAt = new Date().toISOString();

  const snapshot = await insertRecommendationSnapshot({
    snapshotId: randomUUID(),
    venueId: signalEvent.venue_id,
    score: metrics.score,
    rationale: `Signal snapshot updated from ${recentSignals.length} recent signal(s).`,
    factors: [
      { factor: "popularity", value: metrics.popularity, sourceSignalType: "crowd_report" },
      { factor: "wait_time", value: metrics.wait_time, sourceSignalType: "line_report" },
      { factor: "activity", value: metrics.activity, sourceSignalType: "event_report" }
    ],
    recommendationData: {
      venue_id: signalEvent.venue_id,
      popularity: metrics.popularity,
      wait_time: metrics.wait_time,
      activity: metrics.activity,
      last_signal_type: signalEvent.signal_type,
      signal_count: recentSignals.length
    },
    generatedAt
  });

  return { signal, snapshot };
}
