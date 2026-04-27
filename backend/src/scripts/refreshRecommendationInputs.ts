import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";

type Args = {
  market: string;
  dryRun: boolean;
  limit: number;
};

type VenueInputRow = {
  id: string;
  market_id: string;
  name: string;
  source: string | null;
  canonical_type: string | null;
  metadata: Record<string, unknown>;
  provider_count: string;
  approved_asset_count: string;
  approved_event_count: string;
  schedule_status: string | null;
  schedule_source: string | null;
  schedule_confidence: string | null;
  manual_quality_score: string | null;
};

function parseArgs(argv: string[]): Args {
  return {
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "0")
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function numberFromMetadata(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceQuality(row: VenueInputRow): number {
  const metadata = row.metadata ?? {};
  const type = row.canonical_type ?? String(metadata.category ?? "");
  const manualQuality = row.manual_quality_score ?? numberFromMetadata(metadata.manual_quality_score);
  if (manualQuality != null && Number.isFinite(Number(manualQuality))) return clamp(Number(manualQuality));

  let score = row.source?.startsWith("curated:") ? 0.78 : 0.58;
  if (metadata.google_place_id) score += 0.12;
  if (metadata.datasf_poe_record_id) score += 0.08;
  if (metadata.foursquare_id) score += 0.05;
  if (Number(row.provider_count) >= 2) score += 0.08;
  if (Number(row.approved_asset_count) > 0) score += 0.04;
  if (["club", "lounge", "live_music", "karaoke", "bar"].includes(type)) score += 0.04;
  return clamp(score);
}

function sourceConfidence(row: VenueInputRow): number {
  const metadata = row.metadata ?? {};
  let score = 0.42;
  if (row.source?.startsWith("curated:")) score += 0.14;
  if (metadata.google_place_id || row.schedule_source === "provider:google_places") score += 0.20;
  if (metadata.datasf_poe_record_id) score += 0.12;
  if (metadata.foursquare_id) score += 0.08;
  if (Number(row.provider_count) >= 2) score += 0.10;
  return clamp(score);
}

function hoursConfidence(row: VenueInputRow): number {
  if (row.schedule_status === "verified_hours") return clamp(Math.max(Number(row.schedule_confidence ?? 0.78), 0.78));
  if (row.schedule_status === "temporarily_closed") return 0.2;
  if (row.schedule_status === "manual_hold") return 0.12;
  return 0.08;
}

function eventReadiness(row: VenueInputRow): number {
  const metadata = row.metadata ?? {};
  let score = Number(row.approved_event_count) > 0 ? 0.75 : 0.08;
  if (metadata.event_ready === true || metadata.event_readiness === "ready") score += 0.18;
  return clamp(score);
}

function buildInput(row: VenueInputRow) {
  const venueQuality = sourceQuality(row);
  const source = sourceConfidence(row);
  const hours = hoursConfidence(row);
  const event = eventReadiness(row);
  const baseline = clamp(venueQuality * 0.42 + source * 0.28 + hours * 0.22 + event * 0.08);

  return {
    venue_id: row.id,
    market_id: row.market_id,
    name: row.name,
    venue_quality_score: venueQuality,
    source_confidence_score: source,
    event_score: event,
    hours_confidence_score: hours,
    baseline_score: baseline,
    source_summary: {
      source: row.source,
      provider_count: Number(row.provider_count),
      approved_asset_count: Number(row.approved_asset_count),
      approved_event_count: Number(row.approved_event_count),
      schedule_status: row.schedule_status ?? "missing",
      schedule_source: row.schedule_source ?? "missing",
      has_google_place_id: Boolean(row.metadata?.google_place_id),
      has_datasf_evidence: Boolean(row.metadata?.datasf_poe_record_id),
      has_foursquare_id: Boolean(row.metadata?.foursquare_id)
    }
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

async function loadRows(marketId: string, limit: number): Promise<VenueInputRow[]> {
  const result = await dbQuery<VenueInputRow>(
    `
      SELECT
        v.id,
        v.market_id,
        v.name,
        v.source,
        v.canonical_type,
        COALESCE(v.metadata, '{}'::jsonb) AS metadata,
        COALESCE(provider_pack.provider_count, 0)::text AS provider_count,
        COALESCE(asset_pack.approved_asset_count, 0)::text AS approved_asset_count,
        COALESCE(event_pack.approved_event_count, 0)::text AS approved_event_count,
        schedule_pack.status AS schedule_status,
        schedule_pack.source AS schedule_source,
        schedule_pack.confidence::text AS schedule_confidence,
        (v.metadata->>'nightloop_quality_score') AS manual_quality_score
      FROM venues v
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS provider_count
        FROM provider_records pr
        WHERE pr.venue_id = v.id
      ) provider_pack ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS approved_asset_count
        FROM venue_assets va
        WHERE va.venue_id = v.id
          AND va.is_approved = true
      ) asset_pack ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS approved_event_count
        FROM events e
        WHERE e.venue_id = v.id
          AND e.is_approved = true
          AND e.starts_at >= NOW() - INTERVAL '6 hours'
      ) event_pack ON true
      LEFT JOIN LATERAL (
        SELECT status, source, confidence
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) schedule_pack ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
      ORDER BY v.name ASC
      LIMIT CASE WHEN $2::int > 0 THEN $2::int ELSE 100000 END
    `,
    [marketId, Math.floor(limit)]
  );
  return result.rows;
}

async function applyInput(input: ReturnType<typeof buildInput>): Promise<void> {
  await dbQuery(
    `
      INSERT INTO venue_recommendation_inputs (
        venue_id,
        market_id,
        venue_quality_score,
        source_confidence_score,
        event_score,
        hours_confidence_score,
        baseline_score,
        source_summary,
        computed_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, NOW())
      ON CONFLICT (venue_id) DO UPDATE SET
        market_id = EXCLUDED.market_id,
        venue_quality_score = EXCLUDED.venue_quality_score,
        source_confidence_score = EXCLUDED.source_confidence_score,
        event_score = EXCLUDED.event_score,
        hours_confidence_score = EXCLUDED.hours_confidence_score,
        baseline_score = EXCLUDED.baseline_score,
        source_summary = EXCLUDED.source_summary,
        computed_at = EXCLUDED.computed_at,
        updated_at = NOW()
    `,
    [
      input.venue_id,
      input.market_id,
      input.venue_quality_score,
      input.source_confidence_score,
      input.event_score,
      input.hours_confidence_score,
      input.baseline_score,
      JSON.stringify(input.source_summary)
    ]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const rows = await loadRows(marketId, args.limit);
  const inputs = rows.map(buildInput);

  if (!args.dryRun) {
    for (const input of inputs) await applyInput(input);
  }

  const sorted = [...inputs].sort((left, right) => right.baseline_score - left.baseline_score);
  console.log(JSON.stringify({
    mode: args.dryRun ? "dry-run" : "apply",
    market_id: marketId,
    approved_venue_count: rows.length,
    writes_completed: args.dryRun ? 0 : inputs.length,
    missing_hours_count: inputs.filter((input) => input.source_summary.schedule_status === "missing").length,
    top_baseline: sorted.slice(0, 25)
  }, null, 2));
}

main().catch((error) => {
  console.error("[recommendations:refresh-inputs] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
