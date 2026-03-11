import { dbQuery } from "../lib/db";
import type { Signal } from "../types/signal";

interface SignalRow {
  id: string;
  venue_id: string;
  signal_type: string;
  signal_value: number | null;
  confidence: number | null;
  observed_at: string;
  source: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSignalInput {
  venueId: string;
  signalType: string;
  signalValue?: number | null;
  confidence?: number | null;
  observedAt: string;
  source?: string | null;
  payload?: Record<string, unknown>;
}

function toSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    venueId: row.venue_id,
    signalType: row.signal_type,
    signalValue: row.signal_value,
    confidence: row.confidence,
    observedAt: row.observed_at,
    source: row.source,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function insertSignal(input: CreateSignalInput): Promise<Signal> {
  const result = await dbQuery<SignalRow>(
    `
      INSERT INTO signals (
        venue_id,
        signal_type,
        signal_value,
        confidence,
        observed_at,
        source,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)
      RETURNING
        id,
        venue_id,
        signal_type,
        signal_value,
        confidence,
        observed_at,
        source,
        payload,
        created_at,
        updated_at
    `,
    [
      input.venueId,
      input.signalType,
      input.signalValue ?? null,
      input.confidence ?? null,
      input.observedAt,
      input.source ?? null,
      JSON.stringify(input.payload ?? {})
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert signal");
  }

  return toSignal(row);
}

export async function listSignalsForVenue(venueId: string, limit = 50): Promise<Signal[]> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

  const result = await dbQuery<SignalRow>(
    `
      SELECT
        id,
        venue_id,
        signal_type,
        signal_value,
        confidence,
        observed_at,
        source,
        payload,
        created_at,
        updated_at
      FROM signals
      WHERE venue_id = $1
      ORDER BY observed_at DESC
      LIMIT $2
    `,
    [venueId, safeLimit]
  );

  return result.rows.map(toSignal);
}
