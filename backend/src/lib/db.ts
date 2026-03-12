import { randomUUID } from "crypto";
import { Pool, type QueryResult as PgQueryResult, type QueryResultRow } from "pg";

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DBClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close?(): Promise<void>;
}

class PgDBClient implements DBClient {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result: PgQueryResult<QueryResultRow> = await this.pool.query(text, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

type SignalRow = {
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
};

type RecommendationSnapshotRow = {
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
};

class InMemoryDBClient implements DBClient {
  private readonly signals: SignalRow[] = [];
  private readonly recommendationSnapshots: RecommendationSnapshotRow[] = [];

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

      const row: RecommendationSnapshotRow = {
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

      this.recommendationSnapshots.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    if (normalized.includes("from recommendation_snapshots") && normalized.includes("where snapshot_id = $1")) {
      const snapshotId = String(params[0]);
      const rows = this.recommendationSnapshots
        .filter((snapshot) => snapshot.snapshot_id === snapshotId)
        .sort((left, right) => {
          const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
          const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return right.score - left.score;
        });

      return { rows: rows as T[], rowCount: rows.length };
    }

    if (normalized.includes("with latest_per_venue as")) {
      const limit = typeof params[0] === "number" ? params[0] : 8;
      const latestByVenue = new Map<string, RecommendationSnapshotRow>();

      for (const row of this.recommendationSnapshots) {
        const current = latestByVenue.get(row.venue_id);
        if (!current) {
          latestByVenue.set(row.venue_id, row);
          continue;
        }

        const rowGenerated = Date.parse(row.generated_at);
        const currentGenerated = Date.parse(current.generated_at);
        if (rowGenerated > currentGenerated) {
          latestByVenue.set(row.venue_id, row);
          continue;
        }

        if (rowGenerated === currentGenerated && Date.parse(row.created_at) > Date.parse(current.created_at)) {
          latestByVenue.set(row.venue_id, row);
        }
      }

      const rows = [...latestByVenue.values()]
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return Date.parse(right.generated_at) - Date.parse(left.generated_at);
        })
        .slice(0, Math.max(1, Math.floor(limit)));

      return { rows: rows as T[], rowCount: rows.length };
    }

    throw new Error(`Unsupported in-memory query. Set DATABASE_URL for full SQL support. Query: ${normalized}`);
  }
}

let client: DBClient;

if (process.env.DATABASE_URL) {
  client = new PgDBClient(process.env.DATABASE_URL);
} else {
  console.warn("[db] DATABASE_URL is not set; using in-memory DB client for local development.");
  client = new InMemoryDBClient();
}

export function setDBClient(nextClient: DBClient): void {
  client = nextClient;
}

export function getDBClient(): DBClient {
  return client;
}

export async function dbQuery<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}
