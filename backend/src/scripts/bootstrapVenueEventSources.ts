import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";

type Args = {
  apply: boolean;
  market: string;
  limit: number;
  trustStatus: "trusted" | "review_required";
};

type VenueWebsiteRow = {
  id: string;
  name: string;
  market_id: string;
  website_url: string;
};

function parseArgs(argv: string[]): Args {
  const trust = argv.find((arg) => arg.startsWith("--trust="))?.slice("--trust=".length);
  return {
    apply: argv.includes("--apply"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "50"),
    trustStatus: trust === "trusted" ? "trusted" : "review_required"
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

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function loadCandidates(marketId: string, limit: number): Promise<VenueWebsiteRow[]> {
  const result = await dbQuery<VenueWebsiteRow>(
    `
      WITH website_candidates AS (
        SELECT
          v.id,
          v.name,
          v.market_id,
          COALESCE(
            v.metadata->>'website',
            v.metadata->>'website_url',
            v.metadata->>'foursquare_website'
          ) AS website_url
        FROM venues v
        WHERE v.market_id = $1::uuid
          AND v.is_active = true
          AND v.admin_status = 'approved'
          ${PUBLIC_VENUE_SQL}
          AND NOT EXISTS (
            SELECT 1
            FROM venue_event_sources ves
            WHERE ves.venue_id = v.id
              AND ves.source_type = 'venue_json_ld'
          )
      )
      SELECT *
      FROM website_candidates
      WHERE website_url IS NOT NULL
      ORDER BY name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows
    .map((row) => ({ ...row, website_url: normalizeUrl(row.website_url) ?? "" }))
    .filter((row) => row.website_url.length > 0);
}

async function applySource(candidate: VenueWebsiteRow, trustStatus: Args["trustStatus"]): Promise<void> {
  await dbQuery(
    `
      INSERT INTO venue_event_sources (
        venue_id,
        market_id,
        source_type,
        source_url,
        trust_status,
        robots_status,
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'venue_json_ld',
        $3,
        $4,
        'unchecked',
        $5::jsonb
      )
      ON CONFLICT DO NOTHING
    `,
    [
      candidate.id,
      candidate.market_id,
      candidate.website_url,
      trustStatus,
      JSON.stringify({
        discovered_by: "events:bootstrap-websites",
        source_kind: "venue_homepage_json_ld"
      })
    ]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const candidates = await loadCandidates(marketId, args.limit);

  if (args.apply) {
    for (const candidate of candidates) await applySource(candidate, args.trustStatus);
  }

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    source_type: "venue_json_ld",
    trust_status: args.trustStatus,
    candidates: candidates.length,
    writes_completed: args.apply ? candidates.length : 0,
    sources: candidates.map((candidate) => ({
      venue_id: candidate.id,
      venue_name: candidate.name,
      source_url: candidate.website_url
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error("[events:bootstrap-websites] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
