import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { robotsAllowsPath } from "../services/v1/eventIngestionService";
import {
  normalizeVenueWebsiteHours,
  parseVenueWebsiteHoursFromHtml,
  type ProviderSchedulePlan
} from "../services/v1/providerHours";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";

type Args = {
  apply: boolean;
  fetchDryRun: boolean;
  market: string;
  limit: number;
  summaryOnly: boolean;
};

type VenueCandidate = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
  website_url: string;
};

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    fetchDryRun: argv.includes("--fetch-dry-run"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? (apply ? "25" : "50")),
    summaryOnly: argv.includes("--summary")
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

async function loadCandidates(marketId: string, limit: number): Promise<VenueCandidate[]> {
  const result = await dbQuery<VenueCandidate>(
    `
      WITH website_candidates AS (
        SELECT
          v.id,
          v.name,
          v.market_id,
          m.timezone,
          COALESCE(
            v.metadata->>'website',
            v.metadata->>'website_url',
            v.metadata->>'foursquare_website',
            provider_payload.normalized_payload->>'website',
            provider_payload.normalized_payload->>'websiteUri'
          ) AS website_url
        FROM venues v
        JOIN markets m ON m.id = v.market_id
        LEFT JOIN LATERAL (
          SELECT normalized_payload
          FROM provider_records pr
          WHERE pr.venue_id = v.id
            AND pr.provider IN ('foursquare', 'google_places')
            AND (
              pr.normalized_payload ? 'website'
              OR pr.normalized_payload ? 'websiteUri'
            )
          ORDER BY pr.updated_at DESC
          LIMIT 1
        ) provider_payload ON true
        LEFT JOIN LATERAL (
          SELECT status, expires_at
          FROM venue_schedules vs
          WHERE vs.venue_id = v.id
            AND vs.source = 'venue_website'
          ORDER BY COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
          LIMIT 1
        ) website_hours ON true
        WHERE v.market_id = $1::uuid
          AND v.is_active = true
          AND v.admin_status = 'approved'
          ${PUBLIC_VENUE_SQL}
          AND (
            website_hours.status IS NULL
            OR website_hours.expires_at IS NULL
            OR website_hours.expires_at <= NOW()
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/ld+json;q=0.9,*/*;q=0.5",
      "User-Agent": "NightloopBot/0.1 (+https://nightloop.local)"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Website hours fetch failed: ${response.status} ${body.slice(0, 180)}`);
  }
  return response.text();
}

async function robotsAllowed(sourceUrl: string): Promise<{ allowed: boolean; status: string }> {
  const url = new URL(sourceUrl);
  try {
    const robotsUrl = `${url.origin}/robots.txt`;
    const robots = await fetchText(robotsUrl);
    const allowed = robotsAllowsPath(robots, url.pathname);
    return { allowed, status: allowed ? "allowed" : "disallowed" };
  } catch {
    return { allowed: true, status: "error" };
  }
}

async function applySchedule(candidate: VenueCandidate, plan: ProviderSchedulePlan): Promise<void> {
  await dbQuery(
    `
      INSERT INTO venue_schedules (
        venue_id,
        market_id,
        source,
        status,
        timezone,
        weekly_hours,
        source_url,
        confidence,
        verified_at,
        fetched_at,
        expires_at,
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7,
        $8,
        CASE WHEN $4 = 'verified_hours' THEN NOW() ELSE NULL END,
        NOW(),
        $9::timestamptz,
        $10::jsonb
      )
      ON CONFLICT (venue_id, source) DO UPDATE SET
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        weekly_hours = EXCLUDED.weekly_hours,
        source_url = EXCLUDED.source_url,
        confidence = EXCLUDED.confidence,
        verified_at = EXCLUDED.verified_at,
        fetched_at = EXCLUDED.fetched_at,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `,
    [
      candidate.id,
      candidate.market_id,
      plan.source,
      plan.status,
      plan.timezone,
      JSON.stringify(plan.weekly_hours),
      candidate.website_url,
      plan.confidence,
      plan.expires_at,
      JSON.stringify(plan.metadata)
    ]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const candidates = await loadCandidates(marketId, args.limit);
  const shouldFetch = args.apply || args.fetchDryRun;

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    candidates: candidates.length,
    planned_fetches: shouldFetch ? candidates.length : 0,
    writes_planned: args.apply ? "parsed-hours-only" : 0
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not fetch websites. Pass --fetch-dry-run to validate structured hours without writing.",
      candidates: candidates.map((candidate) => ({
        venue_id: candidate.id,
        venue_name: candidate.name,
        website_url: candidate.website_url
      }))
    }, null, 2));
    return;
  }

  const plans: Array<{ candidate: VenueCandidate; plan: ProviderSchedulePlan; robots_status: string }> = [];
  const errors: Array<{ venue_id: string; venue_name: string; website_url: string; error: string }> = [];
  for (const candidate of candidates) {
    try {
      const robots = await robotsAllowed(candidate.website_url);
      if (!robots.allowed) {
        errors.push({
          venue_id: candidate.id,
          venue_name: candidate.name,
          website_url: candidate.website_url,
          error: "robots disallowed"
        });
        continue;
      }
      const html = await fetchText(candidate.website_url);
      const parsed = parseVenueWebsiteHoursFromHtml(html, candidate.website_url);
      const plan = normalizeVenueWebsiteHours(candidate, {
        source_url: candidate.website_url,
        parsed
      });
      if (plan.status === "verified_hours") {
        plans.push({ candidate, plan, robots_status: robots.status });
        if (args.apply) await applySchedule(candidate, plan);
      }
    } catch (error) {
      errors.push({
        venue_id: candidate.id,
        venue_name: candidate.name,
        website_url: candidate.website_url,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log(JSON.stringify({
    ...summary,
    writes_completed: args.apply ? plans.length : 0,
    parsed: plans.length,
    errors_count: errors.length,
    plans: args.summaryOnly ? undefined : plans.map((item) => ({
      venue_id: item.candidate.id,
      venue_name: item.candidate.name,
      website_url: item.candidate.website_url,
      status: item.plan.status,
      expires_at: item.plan.expires_at,
      robots_status: item.robots_status
    })),
    errors: args.summaryOnly ? undefined : errors
  }, null, 2));
}

main().catch((error) => {
  console.error("[venue-website-hours] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
