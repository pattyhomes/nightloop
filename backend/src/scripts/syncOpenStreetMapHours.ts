import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import {
  normalizeOpenStreetMapHours,
  type OpenStreetMapHoursPlace,
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
  latitude: number;
  longitude: number;
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OsmResponse = {
  elements?: OsmElement[];
};

type Match = {
  candidate: VenueCandidate;
  place: OpenStreetMapHoursPlace;
  match_confidence: number;
  distance_meters: number;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SF_BBOX = {
  south: 37.69,
  west: -122.52,
  north: 37.84,
  east: -122.35
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
        SELECT status
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
          AND vs.source = 'provider:openstreetmap'
        LIMIT 1
      ) osm_hours ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
        AND osm_hours.status IS NULL
      ORDER BY v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function nameScore(venueName: string, osmName: string): number {
  const left = normalizeName(venueName);
  const right = normalizeName(osmName);
  if (!left || !right) return 0;
  if (left === right) return 0.9;
  if (left.replace(/\s/g, "") === right.replace(/\s/g, "")) return 0.78;
  if (left.includes(right) || right.includes(left)) return 0.62;
  return 0;
}

function distanceMeters(a: Pick<VenueCandidate, "latitude" | "longitude">, b: { lat: number; lon: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(b.lat - Number(a.latitude));
  const dLon = toRad(b.lon - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildOverpassQuery(): string {
  const bbox = `${SF_BBOX.south},${SF_BBOX.west},${SF_BBOX.north},${SF_BBOX.east}`;
  const nightlifeFilter = `["opening_hours"]["name"]["amenity"~"^(bar|pub|nightclub|music_venue|karaoke_box|restaurant)$"]`;
  return `
[out:json][timeout:25];
(
  node${nightlifeFilter}(${bbox});
  way${nightlifeFilter}(${bbox});
  relation${nightlifeFilter}(${bbox});
);
out tags center;
`;
}

async function fetchOsmPlaces(): Promise<OpenStreetMapHoursPlace[]> {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "NightloopBot/0.1 (+https://nightloop.local)"
    },
    body: new URLSearchParams({ data: buildOverpassQuery() })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Overpass request failed: ${response.status} ${body.slice(0, 220)}`);
  }
  const payload = (await response.json()) as OsmResponse;
  return (payload.elements ?? [])
    .map((element): OpenStreetMapHoursPlace | null => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const name = element.tags?.name;
      const openingHours = element.tags?.opening_hours;
      if (!name || !openingHours || lat == null || lon == null) return null;
      return {
        osm_type: element.type,
        osm_id: element.id,
        name,
        opening_hours: openingHours,
        lat,
        lon
      };
    })
    .filter((place): place is OpenStreetMapHoursPlace => place !== null);
}

function matchCandidates(candidates: VenueCandidate[], places: OpenStreetMapHoursPlace[]): Match[] {
  const matches: Match[] = [];
  for (const candidate of candidates) {
    const best = places
      .map((place) => {
        const distance = distanceMeters(candidate, { lat: Number(place.lat), lon: Number(place.lon) });
        const score = nameScore(candidate.name, place.name ?? "");
        const distanceScore = distance <= 60 ? 0.1 : distance <= 120 ? 0.06 : distance <= 180 ? 0.02 : -0.2;
        return { place, distance, confidence: score + distanceScore };
      })
      .filter((match) => match.distance <= 220)
      .sort((left, right) => right.confidence - left.confidence)[0];
    if (best && best.confidence >= 0.72) {
      matches.push({
        candidate,
        place: best.place,
        match_confidence: Math.min(0.98, best.confidence),
        distance_meters: Math.round(best.distance)
      });
    }
  }
  return matches;
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
      String(plan.metadata.source_url ?? ""),
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
    planned_overpass_requests: shouldFetch ? 1 : 0,
    writes_planned: args.apply ? "matched-only" : 0
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not call Overpass. Pass --fetch-dry-run to validate OSM matches without writing.",
      candidates: candidates.map((candidate) => ({ venue_id: candidate.id, venue_name: candidate.name }))
    }, null, 2));
    return;
  }

  const places = await fetchOsmPlaces();
  const matches = matchCandidates(candidates, places);
  const plans = matches.map((match) => ({
    match,
    plan: normalizeOpenStreetMapHours(match.candidate, match.place)
  }));
  if (args.apply) {
    for (const item of plans) await applySchedule(item.match.candidate, item.plan);
  }

  console.log(JSON.stringify({
    ...summary,
    osm_places: places.length,
    matches: matches.length,
    writes_completed: args.apply ? plans.length : 0,
    plans: args.summaryOnly ? undefined : plans.map((item) => ({
      venue_id: item.match.candidate.id,
      venue_name: item.match.candidate.name,
      osm_name: item.match.place.name,
      match_confidence: item.match.match_confidence,
      distance_meters: item.match.distance_meters,
      status: item.plan.status,
      source_url: item.plan.metadata.source_url
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error("[osm-hours] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
