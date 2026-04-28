import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import { loadConfig } from "../lib/config";
import { FOURSQUARE_PLACES_API_BASE_URL, foursquareHeaders } from "../lib/foursquareHttp";
import {
  FOURSQUARE_EVIDENCE_DETAIL_FIELDS,
  FOURSQUARE_EVIDENCE_SEARCH_FIELDS,
  buildFoursquareEvidencePatch,
  scoreFoursquareEvidenceCandidate,
  type FoursquareEvidencePlace
} from "../services/v1/foursquareEvidence";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";

type Args = {
  apply: boolean;
  fetchDryRun: boolean;
  market: string;
  limit: number;
  summaryOnly: boolean;
  refreshExisting: boolean;
};

type VenueCandidate = {
  id: string;
  name: string;
  market_id: string;
  latitude: number;
  longitude: number;
  canonical_type: string | null;
  metadata: Record<string, unknown>;
};

type FoursquareSearchResponse = {
  results?: FoursquareEvidencePlace[];
};

type EvidencePlan = {
  candidate: VenueCandidate;
  detail: FoursquareEvidencePlace;
  metadata_patch: Record<string, unknown>;
  match: ReturnType<typeof scoreFoursquareEvidenceCandidate>;
};

const FSQ_BASE = FOURSQUARE_PLACES_API_BASE_URL;

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    fetchDryRun: argv.includes("--fetch-dry-run"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? (apply ? "25" : "50")),
    summaryOnly: argv.includes("--summary"),
    refreshExisting: argv.includes("--refresh-existing")
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

function hasWebsite(metadata: Record<string, unknown>): boolean {
  return ["website", "website_url", "foursquare_website"].some((key) => {
    const value = metadata[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

async function loadCandidates(marketId: string, limit: number, refreshExisting: boolean): Promise<VenueCandidate[]> {
  const result = await dbQuery<VenueCandidate>(
    `
      SELECT
        v.id,
        v.name,
        v.market_id,
        v.latitude,
        v.longitude,
        v.canonical_type,
        COALESCE(v.metadata, '{}'::jsonb) AS metadata
      FROM venues v
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
        AND (
          $3::boolean = true
          OR (
            COALESCE(v.metadata->>'website', '') = ''
            AND COALESCE(v.metadata->>'website_url', '') = ''
            AND COALESCE(v.metadata->>'foursquare_website', '') = ''
          )
        )
      ORDER BY
        CASE WHEN v.metadata->>'foursquare_id' IS NULL THEN 0 ELSE 1 END,
        v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit))), refreshExisting]
  );
  return result.rows;
}

async function fsqFetch<T>(pathName: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FSQ_BASE}${pathName}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: foursquareHeaders(apiKey)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const authHint = response.status === 401 ? " Check that FOURSQUARE_API_KEY is a current Places API service key." : "";
    throw new Error(`Foursquare API returned ${response.status}: ${body.slice(0, 220)}${authHint}`);
  }
  return response.json() as Promise<T>;
}

function typeKeyword(candidate: VenueCandidate): string {
  const type = candidate.canonical_type ?? String(candidate.metadata.category ?? "");
  if (/club|dance/i.test(type)) return "nightclub";
  if (/karaoke/i.test(type)) return "karaoke bar";
  if (/live|music/i.test(type)) return "music venue";
  if (/lounge/i.test(type)) return "lounge";
  return "bar";
}

async function searchFoursquare(candidate: VenueCandidate, apiKey: string): Promise<FoursquareEvidencePlace[]> {
  const searches: Array<Record<string, string>> = [
    {
      query: candidate.name,
      ll: `${candidate.latitude},${candidate.longitude}`,
      radius: "300",
      limit: "5",
      fields: FOURSQUARE_EVIDENCE_SEARCH_FIELDS
    },
    {
      query: `${candidate.name} ${typeKeyword(candidate)}`,
      near: "San Francisco, CA",
      limit: "8",
      fields: FOURSQUARE_EVIDENCE_SEARCH_FIELDS
    }
  ];
  const seen = new Set<string>();
  const results: FoursquareEvidencePlace[] = [];
  for (const params of searches) {
    const search = await fsqFetch<FoursquareSearchResponse>("/places/search", apiKey, params);
    for (const place of search.results ?? []) {
      const id = place.fsq_place_id ?? place.fsq_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      results.push(place);
    }
  }
  return results;
}

async function fetchEvidence(candidate: VenueCandidate, apiKey: string): Promise<EvidencePlan | null> {
  const searchResults = await searchFoursquare(candidate, apiKey);
  const best = searchResults
    .map((place) => ({
      place,
      match: scoreFoursquareEvidenceCandidate({
        venueName: candidate.name,
        venueLatitude: Number(candidate.latitude),
        venueLongitude: Number(candidate.longitude),
        place
      })
    }))
    .sort((left, right) => right.match.score - left.match.score)[0];
  const fsqPlaceId = best?.place.fsq_place_id ?? best?.place.fsq_id;
  if (!best || best.match.score < 0.55 || !fsqPlaceId) return null;

  const detail = await fsqFetch<FoursquareEvidencePlace>(`/places/${fsqPlaceId}`, apiKey, {
    fields: FOURSQUARE_EVIDENCE_DETAIL_FIELDS
  });
  const metadataPatch = buildFoursquareEvidencePatch(detail);
  if (hasWebsite(candidate.metadata) && metadataPatch.website) {
    delete metadataPatch.website;
  }
  return {
    candidate,
    detail,
    metadata_patch: metadataPatch,
    match: best.match
  };
}

async function applyEvidence(plan: EvidencePlan): Promise<void> {
  await dbQuery(
    `
      UPDATE venues
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [plan.candidate.id, JSON.stringify(plan.metadata_patch)]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const marketId = await getMarketId(args.market);
  const candidates = await loadCandidates(marketId, args.limit, args.refreshExisting);
  const shouldFetch = args.apply || args.fetchDryRun;
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    candidates: candidates.length,
    planned_foursquare_requests: shouldFetch ? candidates.length * 3 : 0,
    writes_planned: args.apply ? "matched-evidence-only" : 0,
    missing_foursquare_api_key: !config.foursquareApiKey
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not call Foursquare. Pass --fetch-dry-run to validate Pro evidence matches without writing.",
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

  const plans: EvidencePlan[] = [];
  const unmatched: Array<{ venue_id: string; venue_name: string }> = [];
  const errors: Array<{ venue_id: string; venue_name: string; error: string }> = [];
  for (const candidate of candidates) {
    try {
      const plan = await fetchEvidence(candidate, config.foursquareApiKey);
      if (!plan) {
        unmatched.push({ venue_id: candidate.id, venue_name: candidate.name });
        continue;
      }
      plans.push(plan);
      if (args.apply) await applyEvidence(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ venue_id: candidate.id, venue_name: candidate.name, error: message });
      if (/401|Invalid request token/i.test(message)) break;
    }
  }

  console.log(JSON.stringify({
    ...summary,
    matched: plans.length,
    with_website: plans.filter((plan) => typeof plan.metadata_patch.foursquare_website === "string").length,
    writes_completed: args.apply ? plans.length : 0,
    unmatched_count: unmatched.length,
    errors_count: errors.length,
    plans: args.summaryOnly ? undefined : plans.map((plan) => ({
      venue_id: plan.candidate.id,
      venue_name: plan.candidate.name,
      fsq_id: plan.metadata_patch.foursquare_id,
      fsq_name: plan.metadata_patch.foursquare_name,
      match_score: plan.match.score,
      distance_meters: plan.match.distance_meters,
      website: plan.metadata_patch.foursquare_website ?? null,
      phone_present: typeof plan.metadata_patch.foursquare_phone === "string",
      instagram: plan.metadata_patch.foursquare_instagram ?? null,
      categories: plan.metadata_patch.foursquare_category_names ?? []
    })),
    unmatched: args.summaryOnly ? undefined : unmatched,
    errors: args.summaryOnly ? undefined : errors
  }, null, 2));
}

main().catch((error) => {
  console.error("[foursquare-evidence] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
