import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";

type Args = {
  apply: boolean;
  market: string;
  limit: number;
};

type MissingHoursVenue = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
};

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes("--apply"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "50")
  };
}

async function getMarketId(market: string): Promise<string> {
  const result = await dbQuery<{ id: string }>(
    "SELECT id FROM markets WHERE id::text = $1 OR slug = $1 LIMIT 1",
    [market]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Market not found: ${market}`);
  return row.id;
}

async function loadMissingHoursVenues(marketId: string, limit: number): Promise<MissingHoursVenue[]> {
  const result = await dbQuery<MissingHoursVenue>(
    `
      SELECT
        v.id,
        v.name,
        v.market_id,
        m.timezone
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
        AND NOT EXISTS (
          SELECT 1
          FROM venue_schedules vs
          WHERE vs.venue_id = v.id
        )
      ORDER BY v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows;
}

async function applyUnknownSchedule(venue: MissingHoursVenue): Promise<void> {
  await dbQuery(
    `
      INSERT INTO venue_schedules (
        venue_id,
        market_id,
        source,
        status,
        timezone,
        weekly_hours,
        confidence,
        fetched_at,
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'unknown',
        'unknown',
        $3,
        '[]'::jsonb,
        0.08,
        NOW(),
        $4::jsonb
      )
      ON CONFLICT (venue_id, source) DO UPDATE SET
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        weekly_hours = EXCLUDED.weekly_hours,
        confidence = EXCLUDED.confidence,
        fetched_at = EXCLUDED.fetched_at,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `,
    [
      venue.id,
      venue.market_id,
      venue.timezone,
      JSON.stringify({
        source_provider: "unknown",
        reason: "no_provider_or_manual_hours_evidence",
        public_claim_allowed: false
      })
    ]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const venues = await loadMissingHoursVenues(marketId, args.limit);

  if (args.apply) {
    for (const venue of venues) await applyUnknownSchedule(venue);
  }

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    candidates: venues.length,
    writes_completed: args.apply ? venues.length : 0,
    venues: venues.map((venue) => ({
      venue_id: venue.id,
      venue_name: venue.name
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error("[hours:mark-unknown] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
