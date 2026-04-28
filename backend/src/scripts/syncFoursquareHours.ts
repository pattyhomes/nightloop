import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { loadConfig } from "../lib/config";
import { FOURSQUARE_PLACES_API_BASE_URL, foursquareHeaders } from "../lib/foursquareHttp";
import {
  normalizeFoursquarePlaceHours,
  type FoursquarePlaceHours,
  type ProviderSchedulePlan
} from "../services/v1/providerHours";

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
  latitude: number;
  longitude: number;
};

type FoursquareSearchResponse = {
  results?: FoursquarePlaceHours[];
};

const FSQ_BASE = FOURSQUARE_PLACES_API_BASE_URL;
const FSQ_DETAIL_FIELDS = "fsq_place_id,name,timezone,verified,popularity,price,rating,closed_bucket,hours,hours_popular,location";

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

async function loadCandidates(marketId: string, limit: number): Promise<VenueCandidate[]> {
  const result = await dbQuery<VenueCandidate>(
    `
      SELECT
        v.id,
        v.name,
        v.market_id,
        m.timezone,
        v.latitude,
        v.longitude
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      LEFT JOIN LATERAL (
        SELECT status, expires_at
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
          AND vs.source = 'provider:google_places'
        ORDER BY COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) google_hours ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        AND COALESCE(v.source, '') <> 'phase2-test'
        AND COALESCE(v.metadata->>'fixture', 'false') <> 'true'
        AND COALESCE(v.metadata->>'test_run_id', '') = ''
        AND v.name NOT ILIKE 'Phase 2 %'
        AND (
          google_hours.status IS NULL
          OR google_hours.status = 'unknown'
          OR google_hours.expires_at <= NOW()
        )
      ORDER BY
        CASE WHEN v.metadata->>'foursquare_id' IS NULL THEN 0 ELSE 1 END,
        v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function candidateScore(venueName: string, fsqName: string | undefined): number {
  if (!fsqName) return 0;
  const left = normalizeName(venueName);
  const right = normalizeName(fsqName);
  if (left === right) return 0.95;
  if (left.replace(/\s/g, "") === right.replace(/\s/g, "")) return 0.82;
  if (left.includes(right) || right.includes(left)) return 0.65;
  return 0;
}

async function fsqFetch<T>(pathName: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FSQ_BASE}${pathName}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: foursquareHeaders(apiKey)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Foursquare request failed before response: ${message}`);
  }
  if (!response.ok) {
    const body = await response.text();
    const authHint = response.status === 401 ? " Check that FOURSQUARE_API_KEY is a current Places API service key." : "";
    throw new Error(`Foursquare API returned ${response.status}: ${body.slice(0, 220)}${authHint}`);
  }
  return response.json() as Promise<T>;
}

async function fetchFoursquareHours(candidate: VenueCandidate, apiKey: string): Promise<FoursquarePlaceHours | null> {
  const search = await fsqFetch<FoursquareSearchResponse>("/places/search", apiKey, {
    query: candidate.name,
    ll: `${candidate.latitude},${candidate.longitude}`,
    radius: "300",
    limit: "5",
    fields: "fsq_place_id,name,location"
  });
  const best = (search.results ?? [])
    .map((place) => ({ place, score: candidateScore(candidate.name, place.name) }))
    .sort((left, right) => right.score - left.score)[0];
  const fsqPlaceId = best?.place.fsq_place_id ?? best?.place.fsq_id;
  if (!best || best.score < 0.55 || !fsqPlaceId) return null;
  return fsqFetch<FoursquarePlaceHours>(`/places/${fsqPlaceId}`, apiKey, {
    fields: FSQ_DETAIL_FIELDS
  });
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
        confidence,
        verified_at,
        fetched_at,
        expires_at,
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'provider:foursquare',
        $3,
        $4,
        $5::jsonb,
        $6,
        CASE WHEN $3 = 'verified_hours' THEN NOW() ELSE NULL END,
        NOW(),
        $7::timestamptz,
        $8::jsonb
      )
      ON CONFLICT (venue_id, source) DO UPDATE SET
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        weekly_hours = EXCLUDED.weekly_hours,
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
      plan.status,
      plan.timezone,
      JSON.stringify(plan.weekly_hours),
      plan.confidence,
      plan.expires_at,
      JSON.stringify(plan.metadata)
    ]
  );

  await dbQuery(
    `
      UPDATE venues
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [
      candidate.id,
      JSON.stringify({
        foursquare_id: plan.metadata.fsq_id,
        foursquare_verified: plan.metadata.foursquare_verified,
        foursquare_popularity: plan.metadata.popularity,
        foursquare_price: plan.metadata.price,
        foursquare_checked_at: new Date().toISOString()
      })
    ]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const marketId = await getMarketId(args.market);
  const candidates = await loadCandidates(marketId, args.limit);
  const shouldFetch = args.apply || args.fetchDryRun;

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    fallback_candidates: candidates.length,
    planned_foursquare_requests: shouldFetch ? candidates.length * 2 : 0,
    writes_planned: args.apply ? candidates.length : 0,
    missing_foursquare_api_key: !config.foursquareApiKey
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not call Foursquare. Pass --fetch-dry-run to validate response shape without writing.",
      candidates: candidates.map((candidate) => ({
        venue_id: candidate.id,
        venue_name: candidate.name
      }))
    }, null, 2));
    return;
  }

  if (!config.foursquareApiKey) {
    throw new Error("FOURSQUARE_API_KEY is required for --apply or --fetch-dry-run.");
  }

  const plans: ProviderSchedulePlan[] = [];
  const unmatched: Array<{ venue_id: string; venue_name: string }> = [];
  const fetchErrors: Array<{ venue_id: string; venue_name: string; error: string }> = [];
  for (const candidate of candidates) {
    let place: FoursquarePlaceHours | null = null;
    try {
      place = await fetchFoursquareHours(candidate, config.foursquareApiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fetchErrors.push({ venue_id: candidate.id, venue_name: candidate.name, error: message });
      if (/401|Invalid request token/i.test(message)) break;
      continue;
    }
    if (!place) {
      unmatched.push({ venue_id: candidate.id, venue_name: candidate.name });
      continue;
    }
    const plan = normalizeFoursquarePlaceHours(candidate, place);
    plans.push(plan);
    if (args.apply) await applySchedule(candidate, plan);
  }

  console.log(JSON.stringify({
    ...summary,
    writes_completed: args.apply ? plans.length : 0,
    statuses: plans.reduce<Record<string, number>>((acc, plan) => {
      acc[plan.status] = (acc[plan.status] ?? 0) + 1;
      return acc;
    }, {}),
    unmatched_count: unmatched.length,
    fetch_errors_count: fetchErrors.length,
    unmatched: args.summaryOnly ? undefined : unmatched,
    fetch_errors: args.summaryOnly ? undefined : fetchErrors,
    plans: args.summaryOnly ? undefined : plans
  }, null, 2));

  if (shouldFetch && fetchErrors.length > 0 && plans.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[foursquare-hours] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
