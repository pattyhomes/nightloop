import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";

type Args = {
  json: boolean;
  market: string;
  fixNeighborhoods: boolean;
  top: number;
};

function parseArgs(argv: string[]): Args {
  return {
    json: argv.includes("--json"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    fixNeighborhoods: argv.includes("--fix-neighborhoods"),
    top: Number(argv.find((arg) => arg.startsWith("--top="))?.slice("--top=".length) ?? "20")
  };
}

function normalizedNeighborhood(value: string | null): string {
  if (!value || value.trim().length === 0) return "Unknown";
  if (value.trim().toUpperCase() === "SOMA") return "SoMa";
  return value.trim();
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

async function fixNeighborhoods(marketId: string): Promise<number> {
  const result = await dbQuery(
    `
      UPDATE venues
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{neighborhood}', '"SoMa"'::jsonb, true),
          updated_at = NOW()
      WHERE market_id = $1::uuid
        AND metadata->>'neighborhood' = 'SOMA'
    `,
    [marketId]
  );
  return result.rowCount;
}

async function loadAudit(args: Args) {
  const marketId = await getMarketId(args.market);
  const fixedNeighborhoods = args.fixNeighborhoods ? await fixNeighborhoods(marketId) : 0;

  const coverage = await dbQuery<{
    neighborhood: string | null;
    category: string | null;
    source: string | null;
    count: string;
  }>(
    `
      SELECT
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        v.source,
        COUNT(*)::text AS count
      FROM venues v
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
      GROUP BY 1, 2, 3
      ORDER BY COUNT(*) DESC, 1 ASC, 2 ASC
    `,
    [marketId]
  );

  const unknownNeighborhoods = await dbQuery<{
    id: string;
    name: string;
    neighborhood: string | null;
    source: string | null;
    metadata: Record<string, unknown>;
  }>(
    `
      SELECT id, name, COALESCE(metadata->>'neighborhood', metadata->>'district') AS neighborhood, source, metadata
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
        AND (
          COALESCE(metadata->>'neighborhood', metadata->>'district') IS NULL
          OR COALESCE(metadata->>'neighborhood', metadata->>'district') IN ('', 'Unknown', 'SOMA')
        )
      ORDER BY name ASC
      LIMIT 80
    `,
    [marketId]
  );

  const dataSfBuckets = await dbQuery<{ bucket: string | null; count: string }>(
    `
      SELECT
        COALESCE(vri.proposed_changes #>> '{review_context,action_bucket}', pr.match_status, 'unknown') AS bucket,
        COUNT(*)::text AS count
      FROM provider_records pr
      LEFT JOIN venue_review_items vri ON vri.provider_record_id = pr.id
      WHERE pr.market_id = $1::uuid
        AND pr.provider = 'datasf_poe'
      GROUP BY 1
      ORDER BY COUNT(*) DESC, 1 ASC
    `,
    [marketId]
  );

  const hoursCoverage = await dbQuery<{
    status: string | null;
    source: string | null;
    fresh: string;
    stale_or_unknown: string;
    count: string;
  }>(
    `
      WITH approved AS (
        SELECT id
        FROM venues
        WHERE market_id = $1::uuid
          AND is_active = true
          AND admin_status = 'approved'
      ),
      latest AS (
        SELECT DISTINCT ON (vs.venue_id)
          vs.venue_id,
          vs.status,
          vs.source,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) AS checked_at
        FROM venue_schedules vs
        JOIN approved a ON a.id = vs.venue_id
        ORDER BY vs.venue_id,
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
      )
      SELECT
        COALESCE(latest.status, 'missing') AS status,
        COALESCE(latest.source, 'missing') AS source,
        COUNT(*) FILTER (WHERE latest.checked_at >= NOW() - INTERVAL '30 days')::text AS fresh,
        COUNT(*) FILTER (WHERE latest.checked_at IS NULL OR latest.checked_at < NOW() - INTERVAL '30 days')::text AS stale_or_unknown,
        COUNT(*)::text AS count
      FROM approved a
      LEFT JOIN latest ON latest.venue_id = a.id
      GROUP BY 1, 2
      ORDER BY COUNT(*) DESC, 1 ASC, 2 ASC
    `,
    [marketId]
  );

  const recommendationCoverage = await dbQuery<{
    total_approved: string;
    with_inputs: string;
    missing_inputs: string;
    average_baseline: string | null;
  }>(
    `
      SELECT
        COUNT(*)::text AS total_approved,
        COUNT(vri.venue_id)::text AS with_inputs,
        (COUNT(*) - COUNT(vri.venue_id))::text AS missing_inputs,
        ROUND(AVG(vri.baseline_score), 4)::text AS average_baseline
      FROM venues v
      LEFT JOIN venue_recommendation_inputs vri ON vri.venue_id = v.id
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
    `,
    [marketId]
  );

  const topRecommendations = await dbQuery<{
    id: string;
    name: string;
    neighborhood: string | null;
    category: string | null;
    venue_quality_score: string | null;
    source_confidence_score: string | null;
    hours_confidence_score: string | null;
    baseline_score: string | null;
    schedule_status: string | null;
    live_signals: string;
    unique_users: string;
  }>(
    `
      SELECT
        v.id,
        v.name,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        vri.venue_quality_score::text,
        vri.source_confidence_score::text,
        vri.hours_confidence_score::text,
        vri.baseline_score::text,
        latest_schedule.status AS schedule_status,
        COALESCE(signal_pack.live_signals, 0)::text AS live_signals,
        COALESCE(signal_pack.unique_users, 0)::text AS unique_users
      FROM venues v
      LEFT JOIN venue_recommendation_inputs vri ON vri.venue_id = v.id
      LEFT JOIN LATERAL (
        SELECT status
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) latest_schedule ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS live_signals, COUNT(DISTINCT user_id)::int AS unique_users
        FROM signals s
        WHERE s.venue_id = v.id
          AND s.kind IS NOT NULL
          AND s.expires_at > NOW()
      ) signal_pack ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
      ORDER BY COALESCE(vri.baseline_score, 0) DESC, COALESCE(vri.venue_quality_score, 0) DESC, v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(100, args.top))]
  );

  const signalIntegrity = await dbQuery<{
    venue_id: string;
    venue_name: string;
    live_signals: string;
    unique_users: string;
    repeated_user_count: string;
    schedule_status: string | null;
    issue: string;
  }>(
    `
      WITH recent AS (
        SELECT venue_id, user_id, COUNT(*) AS user_signal_count
        FROM signals
        WHERE kind IS NOT NULL
          AND expires_at > NOW()
        GROUP BY venue_id, user_id
      ),
      venue_rollup AS (
        SELECT
          venue_id,
          SUM(user_signal_count)::int AS live_signals,
          COUNT(*)::int AS unique_users,
          COUNT(*) FILTER (WHERE user_signal_count > 1)::int AS repeated_user_count
        FROM recent
        GROUP BY venue_id
      )
      SELECT
        v.id AS venue_id,
        v.name AS venue_name,
        COALESCE(vr.live_signals, 0)::text AS live_signals,
        COALESCE(vr.unique_users, 0)::text AS unique_users,
        COALESCE(vr.repeated_user_count, 0)::text AS repeated_user_count,
        latest_schedule.status AS schedule_status,
        CASE
          WHEN COALESCE(vr.live_signals, 0) >= 3 AND COALESCE(vr.unique_users, 0) < 2 THEN 'sparse_unique_users'
          WHEN COALESCE(vr.live_signals, 0) >= 3 AND latest_schedule.status IS DISTINCT FROM 'verified_hours' THEN 'signals_without_verified_hours'
          WHEN COALESCE(vr.repeated_user_count, 0) > 0 THEN 'repeated_user_signals'
          ELSE 'ok'
        END AS issue
      FROM venues v
      LEFT JOIN venue_rollup vr ON vr.venue_id = v.id
      LEFT JOIN LATERAL (
        SELECT status
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) latest_schedule ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        AND COALESCE(vr.live_signals, 0) > 0
      ORDER BY
        CASE
          WHEN COALESCE(vr.live_signals, 0) >= 3 AND COALESCE(vr.unique_users, 0) < 2 THEN 0
          WHEN COALESCE(vr.live_signals, 0) >= 3 AND latest_schedule.status IS DISTINCT FROM 'verified_hours' THEN 1
          WHEN COALESCE(vr.repeated_user_count, 0) > 0 THEN 2
          ELSE 3
        END,
        COALESCE(vr.live_signals, 0) DESC,
        v.name ASC
      LIMIT 100
    `,
    [marketId]
  );

  const normalizedCoverage = coverage.rows.map((row) => ({
    neighborhood: normalizedNeighborhood(row.neighborhood),
    category: row.category ?? "unknown",
    source: row.source ?? "unknown",
    count: Number(row.count)
  }));

  return {
    generated_at: new Date().toISOString(),
    market_id: marketId,
    fixed_neighborhood_rows: fixedNeighborhoods,
    coverage: normalizedCoverage,
    unknown_neighborhood_cleanup: unknownNeighborhoods.rows.map((row) => ({
      id: row.id,
      name: row.name,
      neighborhood: normalizedNeighborhood(row.neighborhood),
      source: row.source ?? "unknown"
    })),
    datasf_candidate_buckets: dataSfBuckets.rows.map((row) => ({
      bucket: row.bucket ?? "unknown",
      count: Number(row.count)
    })),
    hours_coverage: hoursCoverage.rows.map((row) => ({
      status: row.status ?? "missing",
      source: row.source ?? "missing",
      fresh: Number(row.fresh),
      stale_or_unknown: Number(row.stale_or_unknown),
      count: Number(row.count)
    })),
    recommendation_input_coverage: {
      total_approved: Number(recommendationCoverage.rows[0]?.total_approved ?? 0),
      with_inputs: Number(recommendationCoverage.rows[0]?.with_inputs ?? 0),
      missing_inputs: Number(recommendationCoverage.rows[0]?.missing_inputs ?? 0),
      average_baseline: recommendationCoverage.rows[0]?.average_baseline == null
        ? null
        : Number(recommendationCoverage.rows[0].average_baseline)
    },
    recommendation_top_n: topRecommendations.rows.map((row) => ({
      ...row,
      neighborhood: normalizedNeighborhood(row.neighborhood),
      venue_quality_score: row.venue_quality_score == null ? null : Number(row.venue_quality_score),
      source_confidence_score: row.source_confidence_score == null ? null : Number(row.source_confidence_score),
      hours_confidence_score: row.hours_confidence_score == null ? null : Number(row.hours_confidence_score),
      baseline_score: row.baseline_score == null ? null : Number(row.baseline_score),
      live_signals: Number(row.live_signals),
      unique_users: Number(row.unique_users)
    })),
    signal_integrity: signalIntegrity.rows.map((row) => ({
      ...row,
      live_signals: Number(row.live_signals),
      unique_users: Number(row.unique_users),
      repeated_user_count: Number(row.repeated_user_count)
    }))
  };
}

function printAudit(audit: Awaited<ReturnType<typeof loadAudit>>): void {
  console.log("Nightloop SF trust audit");
  console.log(`Generated: ${audit.generated_at}`);
  console.log(`Market: ${audit.market_id}`);
  if (audit.fixed_neighborhood_rows > 0) {
    console.log(`Fixed SOMA -> SoMa rows: ${audit.fixed_neighborhood_rows}`);
  }

  console.log("\nCoverage by neighborhood/type/source");
  console.table(audit.coverage.slice(0, 30));

  console.log("\nUnknown/SOMA neighborhood cleanup candidates");
  console.table(audit.unknown_neighborhood_cleanup.slice(0, 30));

  console.log("\nDataSF candidate buckets");
  console.table(audit.datasf_candidate_buckets);

  console.log("\nHours coverage/freshness");
  console.table(audit.hours_coverage);

  console.log("\nRecommendation input coverage");
  console.table([audit.recommendation_input_coverage]);

  console.log("\nRecommendation top-N factor audit");
  console.table(audit.recommendation_top_n);

  console.log("\nSignal integrity");
  console.table(audit.signal_integrity);
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

  const args = parseArgs(process.argv.slice(2));
  const audit = await loadAudit(args);
  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    printAudit(audit);
  }
}

main().catch((error) => {
  console.error("[audit:sf-trust] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
