import { readFile } from "fs/promises";
import path from "path";
import { ingestSignal, type IngestSignalResult, type SignalEventInput, type SignalType, type SignalSource } from "./signalIngestionService";

const ALLOWED_SIGNAL_TYPES = new Set(["crowd_report", "line_report", "event_report"]);
const ALLOWED_SOURCES = new Set(["user", "scraper", "manual"]);

const DEFAULT_SIGNAL_FILE = path.resolve(process.cwd(), "data/signals/sample_event_signals.json");

interface ValidationFailure {
  index: number;
  reason: string;
}

export interface EventSignalImportResult {
  filePath: string;
  totalRecords: number;
  importedCount: number;
  invalidRecords: ValidationFailure[];
  ingested: IngestSignalResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSignalRecord(value: unknown, index: number): { valid: true; record: SignalEventInput } | { valid: false; failure: ValidationFailure } {
  if (!isRecord(value)) {
    return { valid: false, failure: { index, reason: "Record must be an object." } };
  }

  const venueId = value.venue_id;
  const signalType = value.signal_type;
  const signalStrength = value.signal_strength;
  const source = value.source;
  const metadata = value.metadata;
  const observedAt = value.observed_at;
  const confidence = value.confidence;

  if (typeof venueId !== "string" || venueId.trim().length === 0) {
    return { valid: false, failure: { index, reason: "venue_id must be a non-empty string." } };
  }

  if (typeof signalType !== "string" || !ALLOWED_SIGNAL_TYPES.has(signalType)) {
    return { valid: false, failure: { index, reason: "signal_type must be crowd_report, line_report, or event_report." } };
  }

  if (typeof signalStrength !== "number" || !Number.isFinite(signalStrength)) {
    return { valid: false, failure: { index, reason: "signal_strength must be a finite number." } };
  }

  if (typeof source !== "string" || !ALLOWED_SOURCES.has(source)) {
    return { valid: false, failure: { index, reason: "source must be user, scraper, or manual." } };
  }

  if (metadata !== undefined && !isRecord(metadata)) {
    return { valid: false, failure: { index, reason: "metadata must be an object when provided." } };
  }

  if (observedAt !== undefined) {
    if (typeof observedAt !== "string" || Number.isNaN(Date.parse(observedAt))) {
      return { valid: false, failure: { index, reason: "observed_at must be a valid ISO timestamp when provided." } };
    }
  }

  if (confidence !== undefined && confidence !== null) {
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { valid: false, failure: { index, reason: "confidence must be a number between 0 and 1 when provided." } };
    }
  }

  return {
    valid: true,
    record: {
      venue_id: venueId,
      signal_type: signalType as SignalType,
      signal_strength: signalStrength,
      source: source as SignalSource,
      metadata: metadata as Record<string, unknown> | undefined,
      observed_at: observedAt as string | undefined,
      confidence: confidence as number | null | undefined
    }
  };
}

export async function importEventSignalsFromFile(filePath: string = DEFAULT_SIGNAL_FILE): Promise<EventSignalImportResult> {
  const resolvedPath = path.resolve(filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Event signal import file must contain a JSON array of records.");
  }

  const invalidRecords: ValidationFailure[] = [];
  const validRecords: SignalEventInput[] = [];

  parsed.forEach((entry, index) => {
    const result = validateSignalRecord(entry, index);
    if (result.valid) {
      validRecords.push(result.record);
      return;
    }
    invalidRecords.push(result.failure);
  });

  const ingested: IngestSignalResult[] = [];
  for (const record of validRecords) {
    const outcome = await ingestSignal(record);
    ingested.push(outcome);
  }

  return {
    filePath: resolvedPath,
    totalRecords: parsed.length,
    importedCount: ingested.length,
    invalidRecords,
    ingested
  };
}
