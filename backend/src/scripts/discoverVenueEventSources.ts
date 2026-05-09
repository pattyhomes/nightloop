import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import {
  analyzeEventSourcesFromHtml,
  type DiscoveredEventSource,
  type EventSourceDiscoveryReport
} from "../services/v1/eventSourceDiscovery";
import { robotsAllowsPath } from "../services/v1/eventIngestionService";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";

type Args = {
  apply: boolean;
  fetchDryRun: boolean;
  market: string;
  limit: number;
  maxPerVenue: number;
  reportMode: boolean;
  trustStatus: "trusted" | "review_required";
  summaryOnly: boolean;
};

type VenueWebsiteRow = {
  id: string;
  name: string;
  market_id: string;
  website_url: string;
};

type DiscoveryPlan = {
  candidate: VenueWebsiteRow;
  robots_status: string;
  sources: DiscoveredEventSource[];
  report: EventSourceDiscoveryReport;
};

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const trust = argv.find((arg) => arg.startsWith("--trust="))?.slice("--trust=".length);
  return {
    apply,
    fetchDryRun: argv.includes("--fetch-dry-run"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? (apply ? "25" : "50")),
    maxPerVenue: Number(argv.find((arg) => arg.startsWith("--max-per-venue="))?.slice("--max-per-venue=".length) ?? "4"),
    reportMode: argv.includes("--report"),
    trustStatus: trust === "trusted" ? "trusted" : "review_required",
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
          AND (
            COALESCE(v.metadata->>'website', '') <> ''
            OR COALESCE(v.metadata->>'website_url', '') <> ''
            OR COALESCE(v.metadata->>'foursquare_website', '') <> ''
          )
      )
      SELECT *
      FROM website_candidates
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
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
      "User-Agent": "NightloopBot/0.1 (+https://nightloop.local)"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Event source discovery fetch failed: ${response.status} ${body.slice(0, 180)}`);
  }
  return response.text();
}

async function robotsAllowed(sourceUrl: string): Promise<{ allowed: boolean; status: string }> {
  const url = new URL(sourceUrl);
  try {
    const robots = await fetchText(`${url.origin}/robots.txt`);
    const allowed = robotsAllowsPath(robots, url.pathname);
    return { allowed, status: allowed ? "allowed" : "disallowed" };
  } catch {
    return { allowed: true, status: "error" };
  }
}

async function existingSourceKeys(venueId: string): Promise<Set<string>> {
  const result = await dbQuery<{ source_type: string; source_url: string | null; provider_id: string | null }>(
    `
      SELECT source_type, source_url, provider_id
      FROM venue_event_sources
      WHERE venue_id = $1::uuid
    `,
    [venueId]
  );
  return new Set(result.rows.map((row) => `${row.source_type}:${row.provider_id ?? row.source_url}`));
}

async function discover(candidate: VenueWebsiteRow, maxPerVenue: number): Promise<DiscoveryPlan> {
  const robots = await robotsAllowed(candidate.website_url);
  if (!robots.allowed) {
    return {
      candidate,
      robots_status: robots.status,
      sources: [],
      report: {
        durable_sources: [],
        detail_page_candidates: [],
        rejected_candidates: [],
        errored_candidates: []
      }
    };
  }
  const html = await fetchText(candidate.website_url);
  const existing = await existingSourceKeys(candidate.id);
  const report = analyzeEventSourcesFromHtml(html, candidate.website_url, maxPerVenue);
  const sources = report.durable_sources
    .filter((source) => !existing.has(`${source.source_type}:${source.provider_id ?? source.source_url}`));
  return { candidate, robots_status: robots.status, sources, report };
}

async function applySource(plan: DiscoveryPlan, source: DiscoveredEventSource, trustStatus: Args["trustStatus"]): Promise<void> {
  await dbQuery(
    `
      INSERT INTO venue_event_sources (
        venue_id,
        market_id,
        source_type,
        source_url,
        provider_id,
        trust_status,
        robots_status,
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb
      )
      ON CONFLICT DO NOTHING
    `,
    [
      plan.candidate.id,
      plan.candidate.market_id,
      source.source_type,
      source.source_url,
      source.provider_id,
      trustStatus,
      source.source_type.startsWith("eventbrite") ? "not_applicable" : plan.robots_status,
      JSON.stringify({
        discovered_by: "events:discover-sources",
        homepage_url: plan.candidate.website_url,
        label: source.label,
        discovery_score: source.score
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
  const shouldFetch = args.apply || args.fetchDryRun || args.reportMode;
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    candidates: candidates.length,
    planned_fetches: shouldFetch ? candidates.length : 0,
    writes_planned: args.apply ? "discovered-sources-only" : 0
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not fetch websites. Pass --fetch-dry-run to discover event links without writing.",
      candidates: candidates.map((candidate) => ({
        venue_id: candidate.id,
        venue_name: candidate.name,
        website_url: candidate.website_url
      }))
    }, null, 2));
    return;
  }

  const plans: DiscoveryPlan[] = [];
  const errors: Array<{ venue_id: string; venue_name: string; website_url: string; error: string }> = [];
  for (const candidate of candidates) {
    try {
      const plan = await discover(candidate, Math.max(1, Math.min(10, Math.floor(args.maxPerVenue))));
      plans.push(plan);
      if (args.apply) {
        for (const source of plan.sources) await applySource(plan, source, args.trustStatus);
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

  const sourceCount = plans.reduce((count, plan) => count + plan.sources.length, 0);
  const reportSummary = {
    durable_source_candidates: plans.reduce((count, plan) => count + plan.report.durable_sources.length, 0),
    new_durable_sources: sourceCount,
    detail_page_candidates: plans.reduce((count, plan) => count + plan.report.detail_page_candidates.length, 0),
    rejected_candidates: plans.reduce((count, plan) => count + plan.report.rejected_candidates.length, 0),
    errored_candidates: plans.reduce((count, plan) => count + plan.report.errored_candidates.length, 0)
  };
  console.log(JSON.stringify({
    ...summary,
    discovered_sources: sourceCount,
    writes_completed: args.apply ? sourceCount : 0,
    errors_count: errors.length,
    report_summary: args.reportMode ? reportSummary : undefined,
    plans: args.summaryOnly ? undefined : plans
      .filter((plan) => plan.sources.length > 0)
      .map((plan) => ({
        venue_id: plan.candidate.id,
        venue_name: plan.candidate.name,
        website_url: plan.candidate.website_url,
        robots_status: plan.robots_status,
        sources: plan.sources
      })),
    report: args.reportMode && !args.summaryOnly ? plans
      .map((plan) => ({
        venue_id: plan.candidate.id,
        venue_name: plan.candidate.name,
        website_url: plan.candidate.website_url,
        robots_status: plan.robots_status,
        durable_source_candidates: plan.report.durable_sources,
        new_durable_sources: plan.sources,
        detail_page_candidates: plan.report.detail_page_candidates,
        rejected_candidates: plan.report.rejected_candidates,
        errored_candidates: plan.report.errored_candidates
      }))
      .filter((plan) =>
        plan.durable_source_candidates.length > 0
        || plan.detail_page_candidates.length > 0
        || plan.rejected_candidates.length > 0
        || plan.errored_candidates.length > 0
      ) : undefined,
    errors: args.summaryOnly ? undefined : errors
  }, null, 2));
}

main().catch((error) => {
  console.error("[events:discover-sources] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
