import { Router } from "express";
import { ingestSignal, type SignalType } from "../services/signalIngestionService";

const signalsRouter = Router();

type AllowedSource = "user" | "manual";

interface SignalSubmissionBody {
  venue_id: string;
  signal_type: SignalType;
  signal_strength: number;
  source?: AllowedSource;
  metadata?: Record<string, unknown>;
}

const ALLOWED_SIGNAL_TYPES = new Set<SignalType>(["crowd_report", "line_report", "event_report"]);
const ALLOWED_SOURCES = new Set<AllowedSource>(["user", "manual"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSignalSubmissionBody(input: unknown): SignalSubmissionBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be an object.");
  }

  const { venue_id, signal_type, signal_strength, source, metadata } = input;

  if (typeof venue_id !== "string" || venue_id.trim().length === 0) {
    throw new Error("venue_id must be a non-empty string.");
  }

  if (typeof signal_type !== "string" || !ALLOWED_SIGNAL_TYPES.has(signal_type as SignalType)) {
    throw new Error("signal_type must be one of crowd_report, line_report, event_report.");
  }

  if (typeof signal_strength !== "number" || !Number.isFinite(signal_strength)) {
    throw new Error("signal_strength must be a finite number.");
  }

  if (source !== undefined) {
    if (typeof source !== "string" || !ALLOWED_SOURCES.has(source as AllowedSource)) {
      throw new Error("source must be one of user, manual when provided.");
    }
  }

  if (metadata !== undefined && !isRecord(metadata)) {
    throw new Error("metadata must be an object when provided.");
  }

  return {
    venue_id: venue_id.trim(),
    signal_type: signal_type as SignalType,
    signal_strength,
    source: source as AllowedSource | undefined,
    metadata
  };
}

signalsRouter.post("/signals", async (req, res, next) => {
  let payload: SignalSubmissionBody;

  try {
    payload = parseSignalSubmissionBody(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    return res.status(400).json({ error: message });
  }

  try {
    const result = await ingestSignal({
      venue_id: payload.venue_id,
      signal_type: payload.signal_type,
      signal_strength: payload.signal_strength,
      source: payload.source ?? "user",
      metadata: payload.metadata
    });

    return res.status(201).json({
      signalId: result.signal.id,
      venueId: result.signal.venueId,
      snapshotScore: result.snapshot.score
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid signal event:")) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

export default signalsRouter;
