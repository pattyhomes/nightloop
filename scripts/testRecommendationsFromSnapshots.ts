import { randomUUID } from "crypto";
import { setDBClient, type QueryResult } from "../backend/src/lib/db";
import { ingestSignal } from "../backend/src/services/signalIngestionService";
import { listLatestRecommendationSnapshots } from "../backend/src/dataAccess/recommendationSnapshotRepository";
import { getRecommendations } from "../backend/src/services/getRecommendations";

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

    if (normalized.includes("with latest_per_venue as") && normalized.includes("from latest_per_venue")) {
      const limit = typeof params[0] === "number" ? params[0] : 8;
      const latestMap = new Map<string, SnapshotRow>();

      for (const row of this.snapshots) {
        const existing = latestMap.get(row.venue_id);
        if (!existing) {
          latestMap.set(row.venue_id, row);
          continue;
        }

        const rowTs = Date.parse(row.generated_at);
        const existingTs = Date.parse(existing.generated_at);
        if (rowTs > existingTs || (rowTs === existingTs && Date.parse(row.created_at) > Date.parse(existing.created_at))) {
          latestMap.set(row.venue_id, row);
        }
      }

      const rows = [...latestMap.values()]
        .sort((left, right) => right.score - left.score || Date.parse(right.generated_at) - Date.parse(left.generated_at))
        .slice(0, limit);

      return { rows: rows as T[], rowCount: rows.length };
    }

    throw new Error(`Unsupported query in recommendations snapshot test client: ${normalized}`);
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}

async function main(): Promise<void> {
  const db = new InMemoryDBClient();
  setDBClient(db);

  await ingestSignal({
    venue_id: "venue-audio",
    signal_type: "crowd_report",
    signal_strength: 0.9,
    source: "user"
  });

  await ingestSignal({
    venue_id: "venue-audio",
    signal_type: "event_report",
    signal_strength: 0.8,
    source: "manual"
  });

  await ingestSignal({
    venue_id: "venue-halcyon",
    signal_type: "line_report",
    signal_strength: 0.4,
    source: "scraper"
  });

  const snapshots = await listLatestRecommendationSnapshots(10);
  if (snapshots.length < 2) {
    throw new Error(`Expected at least 2 latest snapshots, got ${snapshots.length}.`);
  }

  const recommendations = await getRecommendations();
  if (recommendations.recommendations.length === 0) {
    throw new Error("Expected snapshot-backed recommendations, got empty response.");
  }

  const first = recommendations.recommendations[0];
  if (!first.venueName || !first.neighborhood || typeof first.score !== "number" || !first.generatedAt) {
    throw new Error("Recommendation shape is missing required snapshot-backed fields.");
  }

  const hasSnapshotWhy = recommendations.recommendations.some((item) =>
    item.why.toLowerCase().includes("signal snapshot updated")
  );

  if (!hasSnapshotWhy) {
    throw new Error("Expected recommendation rationale to come from snapshot rows.");
  }

  console.log("Recommendations snapshot test passed.");
  console.log(`snapshot_rows=${db.getSnapshotCount()}`);
  console.log(`latest_rows=${snapshots.length}`);
  console.log(`recommendations_rows=${recommendations.recommendations.length}`);
  console.log(`top_recommendation=${first.venueName}|${first.neighborhood}|${first.score}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Recommendations snapshot test failed: ${message}`);
  process.exit(1);
});
