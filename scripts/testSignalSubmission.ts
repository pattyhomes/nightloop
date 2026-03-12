import { randomUUID } from "crypto";
import { createServer } from "net";
import { setDBClient, type QueryResult } from "../backend/src/lib/db";

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

interface SignalSubmissionPayload {
  venue_id: string;
  signal_type: "crowd_report" | "line_report" | "event_report";
  signal_strength: number;
  source?: "user" | "manual";
  metadata?: Record<string, unknown>;
}

interface SignalSubmissionConfirmation {
  signalId: string;
  venueId: string;
  snapshotScore: number;
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
      const limit = typeof params[1] === "number" ? params[1] : 200;
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

    throw new Error(`Unsupported query in signal submission test client: ${normalized}`);
  }

  getSignalCount(): number {
    return this.signals.length;
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  getLatestSnapshotScoreForVenue(venueId: string): number | null {
    const rows = this.snapshots.filter((snapshot) => snapshot.venue_id === venueId);
    if (rows.length === 0) {
      return null;
    }

    return rows[rows.length - 1]?.score ?? null;
  }
}

function assertConfirmation(value: unknown): asserts value is SignalSubmissionConfirmation {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected signal submission response to be an object.");
  }

  const candidate = value as Partial<SignalSubmissionConfirmation>;

  if (typeof candidate.signalId !== "string" || candidate.signalId.length === 0) {
    throw new Error("Expected signal submission response.signalId to be a non-empty string.");
  }

  if (typeof candidate.venueId !== "string" || candidate.venueId.length === 0) {
    throw new Error("Expected signal submission response.venueId to be a non-empty string.");
  }

  if (typeof candidate.snapshotScore !== "number" || !Number.isFinite(candidate.snapshotScore)) {
    throw new Error("Expected signal submission response.snapshotScore to be a finite number.");
  }
}

async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();

    probe.once("error", reject);

    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => {
          reject(new Error("Failed to get free TCP port."));
        });
        return;
      }

      const port = address.port;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string, attempts = 40): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be booting.
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Timed out waiting for backend health endpoint.");
}

async function postSignal(
  baseUrl: string,
  payload: SignalSubmissionPayload
): Promise<SignalSubmissionConfirmation> {
  const response = await fetch(`${baseUrl}/api/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = (await response.json()) as unknown;

  if (response.status !== 201) {
    throw new Error(`Expected 201 from /api/signals, got ${response.status} with body ${JSON.stringify(body)}.`);
  }

  assertConfirmation(body);
  return body;
}

async function main(): Promise<void> {
  const db = new InMemoryDBClient();
  setDBClient(db);

  const port = await findFreePort();
  process.env.NODE_ENV = "test";
  process.env.PORT = String(port);

  await import("../backend/src/server");

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  const venueId = "11111111-1111-4111-8111-111111111111";
  const submissions: SignalSubmissionPayload[] = [
    {
      venue_id: venueId,
      signal_type: "crowd_report",
      signal_strength: 0.9,
      metadata: { note: "Crowd getting dense" }
    },
    {
      venue_id: venueId,
      signal_type: "line_report",
      signal_strength: 0.5,
      source: "manual",
      metadata: { wait_minutes: 20 }
    },
    {
      venue_id: venueId,
      signal_type: "event_report",
      signal_strength: 0.8,
      metadata: { event: "Live set started" }
    }
  ];

  const confirmations: SignalSubmissionConfirmation[] = [];
  for (const payload of submissions) {
    confirmations.push(await postSignal(baseUrl, payload));
  }

  if (db.getSignalCount() !== submissions.length) {
    throw new Error(`Expected ${submissions.length} stored signals, got ${db.getSignalCount()}.`);
  }

  if (db.getSnapshotCount() !== submissions.length) {
    throw new Error(`Expected ${submissions.length} stored snapshots, got ${db.getSnapshotCount()}.`);
  }

  if (confirmations.some((entry) => entry.venueId !== venueId)) {
    throw new Error("Expected all confirmation payloads to match submitted venue_id.");
  }

  const latestSnapshotScore = db.getLatestSnapshotScoreForVenue(venueId);
  const latestResponseScore = confirmations[confirmations.length - 1]?.snapshotScore;

  if (latestSnapshotScore === null || latestResponseScore === undefined) {
    throw new Error("Expected latest snapshot score to be present.");
  }

  if (Math.abs(latestSnapshotScore - latestResponseScore) > 1e-9) {
    throw new Error(
      `Expected latest snapshot score ${latestSnapshotScore} to match API response ${latestResponseScore}.`
    );
  }

  const distinctScores = new Set(confirmations.map((entry) => entry.snapshotScore.toFixed(5)));
  if (distinctScores.size < 2) {
    throw new Error("Expected snapshot score to update across multiple submissions.");
  }

  console.log("Signal submission API test passed.");
  console.log(`signals_submitted=${submissions.length}`);
  console.log(`signals_stored=${db.getSignalCount()}`);
  console.log(`snapshots_stored=${db.getSnapshotCount()}`);
  console.log(`latest_snapshot_score=${latestSnapshotScore}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Signal submission API test failed: ${message}`);
    process.exit(1);
  });
