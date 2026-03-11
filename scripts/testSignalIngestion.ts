import { randomUUID } from "crypto";
import { setDBClient, type QueryResult } from "../backend/src/lib/db";
import { ingestSignal } from "../backend/src/services/signalIngestionService";

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

interface SnapshotRow {
  id: string;
  snapshot_id: string;
  venue_id: string;
  report_id: string | null;
  rank: number | null;
  score: number;
  rationale: string | null;
  factors: unknown[];
  recommendation_data: Record<string, unknown>;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

class InMemoryDBClient {
  private signals: SignalRow[] = [];
  private snapshots: SnapshotRow[] = [];

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into signals")) {
      const now = new Date().toISOString();
      const payloadParam = params[6];
      const payload =
        typeof payloadParam === "string" ? (JSON.parse(payloadParam) as Record<string, unknown>) : {};

      const row: SignalRow = {
        id: randomUUID(),
        venue_id: String(params[0]),
        signal_type: String(params[1]),
        signal_value: typeof params[2] === "number" ? params[2] : null,
        confidence: typeof params[3] === "number" ? params[3] : null,
        observed_at: String(params[4]),
        source: params[5] == null ? null : String(params[5]),
        payload,
        created_at: now,
        updated_at: now
      };

      this.signals.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    if (normalized.includes("from signals") && normalized.includes("where venue_id = $1")) {
      const venueId = String(params[0]);
      const limit = typeof params[1] === "number" ? params[1] : 50;
      const rows = this.signals
        .filter((signal) => signal.venue_id === venueId)
        .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at))
        .slice(0, limit);

      return { rows: rows as T[], rowCount: rows.length };
    }

    if (normalized.startsWith("insert into recommendation_snapshots")) {
      const now = new Date().toISOString();
      const factorsParam = params[6];
      const recommendationDataParam = params[7];
      const factors = typeof factorsParam === "string" ? (JSON.parse(factorsParam) as unknown[]) : [];
      const recommendationData =
        typeof recommendationDataParam === "string"
          ? (JSON.parse(recommendationDataParam) as Record<string, unknown>)
          : {};

      const row: SnapshotRow = {
        id: randomUUID(),
        snapshot_id: String(params[0]),
        venue_id: String(params[1]),
        report_id: params[2] == null ? null : String(params[2]),
        rank: typeof params[3] === "number" ? params[3] : null,
        score: Number(params[4]),
        rationale: params[5] == null ? null : String(params[5]),
        factors,
        recommendation_data: recommendationData,
        generated_at: String(params[8]),
        expires_at: params[9] == null ? null : String(params[9]),
        created_at: now,
        updated_at: now
      };

      this.snapshots.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    throw new Error(`Unsupported query in test client: ${normalized}`);
  }

  getSignalCount(): number {
    return this.signals.length;
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}

async function main(): Promise<void> {
  const db = new InMemoryDBClient();
  setDBClient(db);

  const venueId = "11111111-1111-4111-8111-111111111111";

  await ingestSignal({
    venue_id: venueId,
    signal_type: "crowd_report",
    signal_strength: 0.8,
    source: "user",
    metadata: { note: "Crowd picking up" }
  });

  await ingestSignal({
    venue_id: venueId,
    signal_type: "line_report",
    signal_strength: 0.6,
    source: "scraper",
    metadata: { est_wait_minutes: 22 }
  });

  const result = await ingestSignal({
    venue_id: venueId,
    signal_type: "event_report",
    signal_strength: 0.9,
    source: "manual",
    metadata: { event: "DJ set started" }
  });

  const recommendationData = result.snapshot.recommendationData;
  const popularity = Number(recommendationData.popularity ?? 0);
  const waitTime = Number(recommendationData.wait_time ?? 0);
  const activity = Number(recommendationData.activity ?? 0);

  if (popularity <= 0 || waitTime <= 0 || activity <= 0) {
    throw new Error("Expected popularity, wait_time, and activity to be raised by their signal types.");
  }

  console.log("Signal ingestion test passed.");
  console.log(`signals_stored=${db.getSignalCount()}`);
  console.log(`snapshots_stored=${db.getSnapshotCount()}`);
  console.log(`latest_score=${result.snapshot.score}`);
  console.log(`latest_recommendation_data=${JSON.stringify(recommendationData)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Signal ingestion test failed: ${message}`);
  process.exit(1);
});
