import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { loadConfig } from "../lib/config";

type Args = {
  apply: boolean;
  market: string;
  limit: number;
  fetchDryRun: boolean;
};

type VenueCandidate = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
  google_place_id: string;
};

type GooglePlaceHours = {
  id?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  regularOpeningHours?: {
    openNow?: boolean;
    periods?: unknown[];
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
    openNow?: boolean;
    periods?: unknown[];
    weekdayDescriptions?: string[];
  };
};

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? (apply ? "5" : "50")),
    fetchDryRun: argv.includes("--fetch-dry-run")
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
        COALESCE(
          v.metadata->>'google_place_id',
          google_record.provider_record_id,
          google_record.normalized_payload->>'place_id',
          google_record.normalized_payload->>'google_place_id'
        ) AS google_place_id
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      LEFT JOIN LATERAL (
        SELECT provider_record_id, normalized_payload
        FROM provider_records pr
        WHERE pr.venue_id = v.id
          AND pr.provider = 'google_places'
        ORDER BY pr.updated_at DESC
        LIMIT 1
      ) google_record ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        AND COALESCE(
          v.metadata->>'google_place_id',
          google_record.provider_record_id,
          google_record.normalized_payload->>'place_id',
          google_record.normalized_payload->>'google_place_id'
        ) IS NOT NULL
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM venue_schedules vs
            WHERE vs.venue_id = v.id
              AND vs.source = 'provider:google_places'
          ) THEN 1
          ELSE 0
        END,
        v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows;
}

async function fetchGoogleHours(placeId: string, apiKey: string): Promise<GooglePlaceHours> {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,businessStatus,utcOffsetMinutes,regularOpeningHours,currentOpeningHours"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Places hours fetch failed for ${placeId}: ${response.status} ${body.slice(0, 220)}`);
  }

  return (await response.json()) as GooglePlaceHours;
}

function plannedSchedule(candidate: VenueCandidate, place: GooglePlaceHours | null) {
  const regular = place?.regularOpeningHours;
  const current = place?.currentOpeningHours;
  const businessStatus = place?.businessStatus ?? "UNKNOWN";
  const hasHours = Boolean((regular?.periods?.length ?? 0) > 0 || (regular?.weekdayDescriptions?.length ?? 0) > 0);
  const status =
    businessStatus === "CLOSED_TEMPORARILY"
      ? "temporarily_closed"
      : hasHours
        ? "verified_hours"
        : "unknown";
  const openNow = current?.openNow ?? regular?.openNow ?? null;

  return {
    venue_id: candidate.id,
    venue_name: candidate.name,
    google_place_id: candidate.google_place_id,
    status,
    source: "provider:google_places",
    timezone: candidate.timezone,
    confidence: status === "verified_hours" ? 0.9 : status === "temporarily_closed" ? 0.85 : 0.25,
    weekly_hours: {
      regular_periods: regular?.periods ?? [],
      regular_weekday_descriptions: regular?.weekdayDescriptions ?? [],
      current_periods: current?.periods ?? [],
      current_weekday_descriptions: current?.weekdayDescriptions ?? []
    },
    metadata: {
      google_place_id: candidate.google_place_id,
      google_place_resource_id: place?.id ?? null,
      business_status: businessStatus,
      utc_offset_minutes: place?.utcOffsetMinutes ?? null,
      is_open_now: openNow,
      source_provider: "google_places",
      fetched_by: "syncGoogleHours"
    }
  };
}

async function applySchedule(candidate: VenueCandidate, plan: ReturnType<typeof plannedSchedule>): Promise<void> {
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
        metadata
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'provider:google_places',
        $3,
        $4,
        $5::jsonb,
        $6,
        CASE WHEN $3 = 'verified_hours' THEN NOW() ELSE NULL END,
        NOW(),
        $7::jsonb
      )
      ON CONFLICT (venue_id, source) DO UPDATE SET
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        weekly_hours = EXCLUDED.weekly_hours,
        confidence = EXCLUDED.confidence,
        verified_at = EXCLUDED.verified_at,
        fetched_at = EXCLUDED.fetched_at,
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
      JSON.stringify(plan.metadata)
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
    approved_venue_candidates: candidates.length,
    planned_google_requests: shouldFetch ? candidates.length : 0,
    estimated_request_units: candidates.length,
    writes_planned: args.apply ? candidates.length : 0,
    missing_google_places_api_key: !config.googlePlacesApiKey
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not call Google. Pass --fetch-dry-run to validate response shape without writing.",
      candidates: candidates.map((candidate) => ({
        venue_id: candidate.id,
        venue_name: candidate.name,
        google_place_id: candidate.google_place_id
      }))
    }, null, 2));
    return;
  }

  if (!config.googlePlacesApiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is required for --apply or --fetch-dry-run.");
  }

  const plans: Array<ReturnType<typeof plannedSchedule>> = [];
  for (const candidate of candidates) {
    const place = await fetchGoogleHours(candidate.google_place_id, config.googlePlacesApiKey);
    const plan = plannedSchedule(candidate, place);
    plans.push(plan);
    if (args.apply) await applySchedule(candidate, plan);
  }

  console.log(JSON.stringify({
    ...summary,
    writes_completed: args.apply ? plans.length : 0,
    plans
  }, null, 2));
}

main().catch((error) => {
  console.error("[google-hours] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
