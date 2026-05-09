import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import {
  normalizeSfNeighborhoodName,
  resolveSfNeighborhoodFromFeatures,
  type GeoJsonPolygon,
  type NeighborhoodFeature
} from "../services/v1/sfNeighborhoods";

type Args = {
  apply: boolean;
  market: string;
  limit: number;
  noFetch: boolean;
};

type VenueRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
};

const DATASF_ANALYSIS_NEIGHBORHOODS_GEOJSON_URLS = [
  // p5b7-5n3h is the public map wrapper. j2bu-swwd is the underlying GeoJSON source dataset.
  "https://data.sfgov.org/api/geospatial/j2bu-swwd?method=export&format=GeoJSON",
  "https://data.sfgov.org/api/geospatial/p5b7-5n3h?method=export&format=GeoJSON"
];

const fallbackNightlifePolygons: NeighborhoodFeature[] = [
  box("SoMa", -122.421, 37.769, -122.387, 37.789),
  box("Mission", -122.431, 37.748, -122.405, 37.773),
  box("Castro", -122.445, 37.758, -122.426, 37.772),
  box("North Beach", -122.414, 37.795, -122.397, 37.809),
  box("Marina", -122.449, 37.796, -122.425, 37.807),
  box("Hayes Valley", -122.432, 37.771, -122.416, 37.783),
  box("Lower Nob Hill/Polk", -122.424, 37.786, -122.409, 37.800),
  box("Tenderloin", -122.421, 37.779, -122.409, 37.789),
  box("Dogpatch", -122.397, 37.753, -122.382, 37.768),
  box("Financial District", -122.407, 37.787, -122.392, 37.798),
  box("Fillmore", -122.440, 37.779, -122.425, 37.792)
];

function box(name: string, minLng: number, minLat: number, maxLng: number, maxLat: number): NeighborhoodFeature {
  return {
    display_name: name,
    polygon: {
      type: "Polygon",
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat]
      ]]
    }
  };
}

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes("--apply"),
    noFetch: argv.includes("--no-fetch"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "500")
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

async function fetchDataSfFeatures(): Promise<NeighborhoodFeature[]> {
  let lastError: unknown = null;
  for (const url of DATASF_ANALYSIS_NEIGHBORHOODS_GEOJSON_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`DataSF neighborhoods fetch failed: ${response.status}`);
      const payload = await response.json() as {
        features?: Array<{
          properties?: Record<string, unknown>;
          geometry?: GeoJsonPolygon;
        }>;
      };
      const features = dataSfPayloadToFeatures(payload);
      if (features.length > 0) return features;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DataSF neighborhoods fetch produced no features");
}

function dataSfPayloadToFeatures(payload: {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: GeoJsonPolygon;
  }>;
}): NeighborhoodFeature[] {
  return (payload.features ?? [])
    .map((feature) => {
      const properties = feature.properties ?? {};
      const displayName = [
        properties.nhood,
        properties.neighborhood,
        properties.analysis_neighborhood,
        properties.name,
        properties.mapblklot
      ].find((value) => typeof value === "string" && value.trim().length > 0);
      if (!displayName || !feature.geometry) return null;
      return {
        display_name: normalizeSfNeighborhoodName(String(displayName)),
        polygon: feature.geometry
      };
    })
    .filter((feature): feature is NeighborhoodFeature => Boolean(feature));
}

async function loadCandidates(marketId: string, limit: number): Promise<VenueRow[]> {
  const result = await dbQuery<VenueRow>(
    `
      SELECT
        id,
        name,
        latitude,
        longitude,
        COALESCE(metadata->>'neighborhood', metadata->>'district') AS neighborhood
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
        AND COALESCE(source, '') <> 'phase2-test'
        AND COALESCE(metadata->>'fixture', 'false') <> 'true'
        AND COALESCE(metadata->>'test_run_id', '') = ''
        AND name NOT ILIKE 'Phase 2 %'
        AND (
          COALESCE(metadata->>'neighborhood', metadata->>'district') IS NULL
          OR COALESCE(metadata->>'neighborhood', metadata->>'district') IN ('', 'Unknown', 'SOMA')
        )
      ORDER BY name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(1000, Math.floor(limit)))]
  );
  return result.rows;
}

async function applyNeighborhood(venue: VenueRow, neighborhood: string | null, featureSource: string): Promise<void> {
  const patch = neighborhood
    ? {
        neighborhood,
        neighborhood_source: featureSource === "datasf_analysis_neighborhoods"
          ? "datasf_analysis_neighborhoods"
          : "coordinate_polygon_fallback",
        neighborhood_checked_at: new Date().toISOString()
      }
    : {
        neighborhood_review_status: "needs_ops_review",
        neighborhood_checked_at: new Date().toISOString()
      };
  await dbQuery(
    `
      UPDATE venues
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [venue.id, JSON.stringify(patch)]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const candidates = await loadCandidates(marketId, args.limit);
  let features: NeighborhoodFeature[] = [];
  let featureSource = "fallback";
  if (!args.noFetch) {
    try {
      features = await fetchDataSfFeatures();
      featureSource = features.length > 0 ? "datasf_analysis_neighborhoods" : "fallback";
    } catch {
      features = [];
    }
  }
  if (features.length === 0) features = fallbackNightlifePolygons;

  const plans = candidates.map((venue) => ({
    venue_id: venue.id,
    venue_name: venue.name,
    previous_neighborhood: normalizeSfNeighborhoodName(venue.neighborhood),
    planned_neighborhood: resolveSfNeighborhoodFromFeatures({
      latitude: Number(venue.latitude),
      longitude: Number(venue.longitude)
    }, features),
    latitude: Number(venue.latitude),
    longitude: Number(venue.longitude)
  }));

  if (args.apply) {
    for (const plan of plans) {
      await applyNeighborhood({
        id: plan.venue_id,
        name: plan.venue_name,
        latitude: plan.latitude,
        longitude: plan.longitude,
        neighborhood: plan.previous_neighborhood
      }, plan.planned_neighborhood, featureSource);
    }
  }

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    feature_source: featureSource,
    feature_count: features.length,
    candidates: candidates.length,
    resolved: plans.filter((plan) => plan.planned_neighborhood).length,
    unresolved: plans.filter((plan) => !plan.planned_neighborhood).length,
    writes_completed: args.apply ? plans.length : 0,
    plans
  }, null, 2));
}

main().catch((error) => {
  console.error("[sf-neighborhoods] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
