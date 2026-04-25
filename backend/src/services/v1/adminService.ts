import { randomUUID } from "crypto";
import { ApiError, notFoundError, validationError } from "../../lib/apiError";
import type { AppConfig } from "../../lib/config";
import type { DBClient } from "../../lib/db";
import { dbQuery, dbTransaction } from "../../lib/db";
import { ensureAccountForAuthUser } from "./accountService";
import {
  findProviderDuplicateWarnings,
  hasFreshFoursquareMetadata,
  hasFreshGoogleMetadata,
  normalizeProviderName as normalizeName,
  providerProvenancePatch,
  scoreProviderName as scoreCandidate
} from "./providerDedupe";

type JsonRecord = Record<string, unknown>;

export type AdminUser = {
  id: string;
  auth_user_id: string;
  role: string;
  is_active: boolean;
  app_user_id: string;
};

export type AdminActor = {
  authUserId: string;
  userId: string;
  role: string;
};

type ProviderRunRow = {
  id: string;
  provider: "foursquare" | "google_places" | "resident_advisor" | "manual";
  market_id: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  mode: "fixture" | "dry_run" | "live";
  requested_by_user_id: string | null;
  capped_venue_count: number;
  summary: JsonRecord;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type VenueReviewRow = {
  id: string;
  provider_record_id: string;
  venue_id: string | null;
  market_id: string;
  status: "pending" | "approved" | "rejected";
  proposed_changes: JsonRecord;
  review_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  provider: string;
  provider_record_id_external: string;
  import_run_id: string | null;
  raw_payload: JsonRecord;
  normalized_payload: JsonRecord;
  venue_name: string | null;
};

type VenueAssetRow = {
  id: string;
  venue_id: string;
  market_id: string;
  asset_type: string;
  url: string;
  alt_text: string | null;
  credit_text: string;
  credit_url: string | null;
  license_name: string;
  license_url: string | null;
  rights_status: string;
  source: string;
  is_approved: boolean;
  sort_order: number;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  venue_id: string;
  market_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  source: string;
  source_event_id: string | null;
  url: string | null;
  is_approved: boolean;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

type ModerationReportRow = {
  id: string;
  reporter_user_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  details: JsonRecord;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type VenueRow = {
  id: string;
  name: string;
  market_id: string;
  canonical_type: string | null;
  latitude: number;
  longitude: number;
  metadata: JsonRecord;
};

type ApprovedVenueRow = {
  id: string;
  slug?: string | null;
  name: string;
  source?: string | null;
  canonical_type: string | null;
  is_active?: boolean;
  admin_status?: string;
  metadata: JsonRecord;
};

type MarketRow = {
  id: string;
  slug: string;
  display_name: string;
  short_label: string;
  country_code: string;
  center_latitude: number;
  center_longitude: number;
  bounds: JsonRecord;
};

type ProviderCandidatePayload = {
  providerRecordId: string;
  venueId: string | null;
  rawPayload: JsonRecord;
  normalizedPayload: JsonRecord;
  proposedChanges: JsonRecord;
  matchConfidence: number;
};

const FSQ_BASE_URL = "https://api.foursquare.com/v3";
const FSQ_SEARCH_RADIUS_METERS = 300;
const FSQ_DETAIL_FIELDS = "fsq_id,name,location,categories,hours,website,verified,geocodes";
const FSQ_DELAY_MS = 250;
const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.googleMapsUri";
const GOOGLE_DISCOVERY_TERMS = [
  "cocktail bars",
  "nightclubs",
  "dance clubs",
  "live music venues",
  "lounges",
  "gay bars",
  "karaoke bars",
  "late night bars"
];
const GOOGLE_DISCOVERY_NIGHTLIFE_TYPES = new Set([
  "bar",
  "night_club",
  "cocktail_bar",
  "lounge_bar",
  "karaoke",
  "karaoke_bar",
  "live_music_venue",
  "performing_arts_theater",
  "event_venue"
]);
const GOOGLE_DISCOVERY_REJECT_TYPES = new Set([
  "store",
  "hotel",
  "lodging",
  "gym",
  "fitness_center",
  "corporate_office"
]);
const DISCOVERY_DUPLICATE_RADIUS_METERS = 160;

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);

  return slug || "google-place";
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function numberValue(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProviderAuthError(error: unknown): boolean {
  return error instanceof Error && /Foursquare API returned 401|Invalid request token/i.test(error.message);
}

function serialize(value: JsonRecord | unknown[]): string {
  return JSON.stringify(value);
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

async function fetchFoursquare<T>(
  path: string,
  apiKey: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${FSQ_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: apiKey
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Foursquare API returned ${response.status}: ${body.slice(0, 160)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchGooglePlacesTextSearch(
  apiKey: string,
  body: JsonRecord
): Promise<GoogleTextSearchResponse> {
  const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Places API returned ${response.status}: ${text.slice(0, 160)}`);
  }

  return (await response.json()) as GoogleTextSearchResponse;
}

async function getVenueForAdmin(
  client: DBClient,
  venueId: string,
  expectedMarketId?: string
): Promise<VenueRow> {
  const result = await client.query<VenueRow>(
    `
      SELECT id, name, market_id, canonical_type, latitude, longitude, metadata
      FROM venues
      WHERE id = $1::uuid
    `,
    [venueId]
  );
  const venue = result.rows[0];
  if (!venue) {
    throw notFoundError("Venue was not found.");
  }
  if (expectedMarketId && venue.market_id !== expectedMarketId) {
    throw validationError("Venue does not belong to the requested market.", {
      venue_id: "Market mismatch"
    });
  }
  return venue;
}

async function getMarketForAdmin(client: DBClient, marketId: string): Promise<MarketRow> {
  const result = await client.query<MarketRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        short_label,
        country_code,
        center_latitude,
        center_longitude,
        bounds
      FROM markets
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [marketId]
  );
  const market = result.rows[0];
  if (!market) {
    throw notFoundError("Market was not found.");
  }
  return market;
}

async function getMarketNeighborhoodNames(client: DBClient, marketId: string): Promise<string[]> {
  const result = await client.query<{ display_name: string }>(
    `
      SELECT display_name
      FROM market_neighborhoods
      WHERE market_id = $1::uuid
      ORDER BY display_name ASC
    `,
    [marketId]
  );

  return result.rows.map((row) => row.display_name).filter(Boolean);
}

export async function getAdminForAuthUser(authUserId: string): Promise<AdminUser | null> {
  const result = await dbQuery<AdminUser>(
    `
      SELECT
        au.id,
        au.auth_user_id,
        au.role,
        au.is_active,
        u.id AS app_user_id
      FROM admin_users au
      JOIN users u ON u.auth_user_id = au.auth_user_id
      WHERE au.auth_user_id = $1::uuid
        AND au.is_active = true
      LIMIT 1
    `,
    [authUserId]
  );

  return result.rows[0] ?? null;
}

export async function bootstrapLocalAdmin(authUserId: string): Promise<AdminUser> {
  const result = await dbQuery<AdminUser>(
    `
      INSERT INTO admin_users (auth_user_id, role, is_active, notes)
      VALUES ($1::uuid, 'ops_admin', true, 'local bootstrap')
      ON CONFLICT (auth_user_id)
      DO UPDATE SET
        role = 'ops_admin',
        is_active = true,
        notes = COALESCE(admin_users.notes, 'local bootstrap'),
        updated_at = now()
      RETURNING
        id,
        auth_user_id,
        role,
        is_active,
        (
          SELECT id
          FROM users
          WHERE users.auth_user_id = admin_users.auth_user_id
          LIMIT 1
        ) AS app_user_id
    `,
    [authUserId]
  );

  const admin = result.rows[0];
  if (!admin) {
    throw new ApiError(500, "ADMIN_BOOTSTRAP_FAILED", "Failed to bootstrap local admin.");
  }

  return admin;
}

export async function listProviderImportRuns(limit = 30) {
  const result = await dbQuery<ProviderRunRow>(
    `
      SELECT *
      FROM provider_import_runs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(100, limit))]
  );

  return { items: result.rows };
}

export async function listAdminVenues(filters: { marketId?: string; q?: string; limit?: number }) {
  const result = await dbQuery(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        v.admin_status,
        v.is_active
      FROM venues v
      WHERE ($1::uuid IS NULL OR v.market_id = $1::uuid)
        AND (
          $2::text IS NULL
          OR v.name ILIKE '%' || $2 || '%'
          OR COALESCE(v.metadata->>'neighborhood', '') ILIKE '%' || $2 || '%'
        )
      ORDER BY v.name ASC
      LIMIT $3
    `,
    [
      filters.marketId ?? null,
      filters.q ?? null,
      Math.max(1, Math.min(200, filters.limit ?? 100))
    ]
  );

  return { items: result.rows };
}

export async function createProviderImportRun(input: {
  provider: "foursquare" | "google_places" | "resident_advisor" | "manual";
  marketId: string;
  mode: "fixture" | "dry_run" | "live";
  cappedVenueCount: number;
  summary?: JsonRecord;
  actor: AdminActor;
}) {
  if (input.provider === "resident_advisor") {
    throw new ApiError(
      409,
      "PROVIDER_DISABLED",
      "Resident Advisor imports are disabled until Nightloop has licensed access."
    );
  }

  if (input.provider === "foursquare" && input.cappedVenueCount > 20) {
    throw validationError("Foursquare live/provider runs are capped at 20 venues.", {
      capped_venue_count: "Foursquare cap is 20"
    });
  }

  if (input.provider === "google_places" && input.summary?.google_run_kind === "curated_qa" && input.cappedVenueCount > 50) {
    throw validationError("Google curated candidate QA runs are capped at 50 candidates.", {
      capped_venue_count: "Curated QA cap is 50"
    });
  }

  const result = await dbQuery<ProviderRunRow>(
    `
      INSERT INTO provider_import_runs (
        provider,
        market_id,
        mode,
        requested_by_user_id,
        capped_venue_count,
        summary
      )
      VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6::jsonb)
      RETURNING *
    `,
    [
      input.provider,
      input.marketId,
      input.mode,
      input.actor.userId,
      input.cappedVenueCount,
      serialize(input.summary ?? {})
    ]
  );

  return { run: result.rows[0] };
}

async function readProviderRun(client: DBClient, runId: string, lock = false): Promise<ProviderRunRow> {
  const result = await client.query<ProviderRunRow>(
    `
      SELECT *
      FROM provider_import_runs
      WHERE id = $1::uuid
      ${lock ? "FOR UPDATE" : ""}
    `,
    [runId]
  );

  const run = result.rows[0];
  if (!run) {
    throw notFoundError("Provider import run was not found.");
  }
  return run;
}

async function getMarketVenues(
  client: DBClient,
  marketId: string,
  limit: number,
  options: { prioritizeGoogleDiscoveryApproved?: boolean; prioritizeCuratedSfNotable?: boolean } = {}
): Promise<VenueRow[]> {
  const result = await client.query<VenueRow>(
    `
      SELECT id, name, market_id, canonical_type, latitude, longitude, metadata
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
      ORDER BY
        CASE
          WHEN $4::boolean = true
            AND source = 'curated:sf_notable'
            AND metadata ? 'google_place_id'
          THEN 0
          WHEN $3::boolean = true
            AND source = 'provider:google_places'
            AND metadata ? 'google_place_id'
          THEN 0
          ELSE 1
        END,
        created_at DESC,
        name ASC
      LIMIT $2
    `,
    [
      marketId,
      limit,
      options.prioritizeGoogleDiscoveryApproved ?? false,
      options.prioritizeCuratedSfNotable ?? false
    ]
  );
  return result.rows;
}

type FoursquarePlace = {
  fsq_id: string;
  name: string;
  location?: JsonRecord;
  categories?: Array<{ id: number; name: string }>;
  hours?: JsonRecord;
  website?: string;
  verified?: boolean;
  geocodes?: JsonRecord;
};

type FoursquareSearchResponse = {
  results?: FoursquarePlace[];
};

type GooglePlace = {
  id: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
};

type GoogleTextSearchResponse = {
  places?: GooglePlace[];
};

type CuratedCandidateReviewRow = {
  review_item_id: string;
  provider_record_id: string;
  market_id: string;
  proposed_changes: JsonRecord;
  normalized_payload: JsonRecord;
  created_at: string;
};

type GoogleRunKind = "existing_qa" | "discovery" | "curated_qa";

function googleRunKind(run: ProviderRunRow): GoogleRunKind {
  if (run.summary.google_run_kind === "discovery") return "discovery";
  if (run.summary.google_run_kind === "curated_qa") return "curated_qa";
  return "existing_qa";
}

function mapGoogleTypeToCanonicalType(place: GooglePlace, fallback?: string | null): string {
  const types = new Set([place.primaryType, ...(place.types ?? [])].filter(Boolean));
  if (types.has("night_club")) return "club";
  if (types.has("bar")) return "bar";
  if (types.has("performing_arts_theater")) return "live_music";
  if (types.has("event_venue")) return "live_music";
  return fallback ?? "bar";
}

function googlePlaceName(place: GooglePlace): string {
  return place.displayName?.text?.trim() || "Unnamed Google Place";
}

function googleNormalizedPayload(place: GooglePlace): JsonRecord {
  return {
    google_place_id: place.id,
    name: googlePlaceName(place),
    formatted_address: place.formattedAddress ?? null,
    location: place.location ?? null,
    types: place.types ?? [],
    primary_type: place.primaryType ?? null,
    business_status: place.businessStatus ?? null,
    google_maps_uri: place.googleMapsUri ?? null
  };
}

function googleMetadataPatch(place: GooglePlace, run?: ProviderRunRow, matchConfidence?: number): JsonRecord {
  return {
    google_place_id: place.id,
    google_formatted_address: place.formattedAddress ?? null,
    google_place_types: place.types ?? [],
    google_primary_type: place.primaryType ?? null,
    google_business_status: place.businessStatus ?? null,
    google_maps_uri: place.googleMapsUri ?? null,
    ...providerProvenancePatch({
      provider: "google_places",
      runId: run?.id,
      matchConfidence,
      fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "primaryType",
        "businessStatus",
        "googleMapsUri"
      ]
    })
  };
}

function googleExistingSearchBody(venue: VenueRow, market: MarketRow): JsonRecord {
  return {
    textQuery: `${venue.name} ${market.display_name}`,
    maxResultCount: 5,
    languageCode: "en",
    regionCode: market.country_code,
    locationBias: {
      circle: {
        center: {
          latitude: Number(venue.latitude),
          longitude: Number(venue.longitude)
        },
        radius: 500
      }
    }
  };
}

function googleDiscoverySearchBody(
  term: string,
  market: MarketRow,
  neighborhood?: string
): JsonRecord {
  return {
    textQuery: neighborhood
      ? `${term} in ${neighborhood}, ${market.display_name}`
      : `${term} in ${market.display_name}`,
    maxResultCount: 10,
    languageCode: "en",
    regionCode: market.country_code,
    locationBias: {
      circle: {
        center: {
          latitude: Number(market.center_latitude),
          longitude: Number(market.center_longitude)
        },
        radius: 12000
      }
    }
  };
}

function googleCuratedSearchBody(candidate: JsonRecord, market: MarketRow): JsonRecord {
  const name = textValue(candidate.name) ?? "Unnamed nightlife venue";
  const neighborhood = textValue(candidate.neighborhood);
  const latitude = numberValue(candidate.latitude);
  const longitude = numberValue(candidate.longitude);

  return {
    textQuery: neighborhood
      ? `${name} in ${neighborhood}, ${market.display_name}`
      : `${name} ${market.display_name}`,
    maxResultCount: 5,
    languageCode: "en",
    regionCode: market.country_code,
    locationBias: {
      circle: {
        center: {
          latitude: latitude ?? Number(market.center_latitude),
          longitude: longitude ?? Number(market.center_longitude)
        },
        radius: latitude == null || longitude == null ? 12000 : 600
      }
    }
  };
}

function googleDiscoveryTypeDecision(place: GooglePlace): { allowed: boolean; reason: string } {
  const types = new Set(
    [place.primaryType, ...(place.types ?? [])].filter((type): type is string => typeof type === "string")
  );
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
    return { allowed: false, reason: `business_status:${place.businessStatus}` };
  }
  for (const type of types) {
    if (GOOGLE_DISCOVERY_REJECT_TYPES.has(type)) {
      return { allowed: false, reason: `blocked_type:${type}` };
    }
  }
  for (const type of types) {
    if (GOOGLE_DISCOVERY_NIGHTLIFE_TYPES.has(type)) {
      return { allowed: true, reason: `nightlife_type:${type}` };
    }
  }

  return { allowed: false, reason: "not_nightlife_type" };
}

async function googleDiscoveryDuplicateWarnings(
  client: DBClient,
  marketId: string,
  place: GooglePlace,
  latitude: number,
  longitude: number
): Promise<string[]> {
  return (
    await findProviderDuplicateWarnings(client, {
      marketId,
      name: googlePlaceName(place),
      latitude,
      longitude,
      googlePlaceId: textValue(place.id),
      radiusMeters: DISCOVERY_DUPLICATE_RADIUS_METERS
    })
  ).warnings;
}

async function getFoursquarePayloadForVenue(
  venue: VenueRow,
  run: ProviderRunRow,
  config: AppConfig
): Promise<{
  providerRecordId: string;
  rawPayload: JsonRecord;
  normalizedPayload: JsonRecord;
  proposedChanges: JsonRecord;
  matchConfidence: number;
}> {
  const basePayload = {
    venue_id: venue.id,
    venue_name: venue.name,
    run_id: run.id,
    mode: run.mode,
    ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
  };

  if (run.mode !== "live") {
    return {
      providerRecordId: `fixture-${run.id}-${venue.id}`,
      rawPayload: {
        ...basePayload,
        fsq_id: `fixture-${venue.id}`,
        source: "fixture"
      },
      normalizedPayload: {
        name: venue.name,
        canonical_type: venue.canonical_type ?? "bar",
        source: "fixture"
      },
      proposedChanges: {
        ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
        canonical_type: venue.canonical_type ?? "bar",
        metadata_patch: {
          provider_hint: "foursquare_fixture"
        }
      },
      matchConfidence: 0.9
    };
  }

  if (!config.foursquareApiKey) {
    throw new ApiError(
      409,
      "PROVIDER_KEY_MISSING",
      "FOURSQUARE_API_KEY is required before running a capped live Foursquare import."
    );
  }

  const search = await fetchFoursquare<FoursquareSearchResponse>("/places/search", config.foursquareApiKey, {
    query: venue.name,
    ll: `${venue.latitude},${venue.longitude}`,
    radius: String(FSQ_SEARCH_RADIUS_METERS),
    limit: "5"
  });

  const candidates = (search.results ?? [])
    .map((place) => ({
      place,
      score: scoreCandidate(venue.name, place.name)
    }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];

  if (!best || best.score < 0.55) {
    return {
      providerRecordId: `unmatched-${run.id}-${venue.id}`,
      rawPayload: {
        ...basePayload,
        candidates: search.results ?? [],
        source: "foursquare_live",
        unmatched: true
      },
      normalizedPayload: {
        name: venue.name,
        source: "foursquare_live"
      },
      proposedChanges: {
        metadata_patch: {
          foursquare_match_status: "unmatched"
        }
      },
      matchConfidence: best?.score ?? 0
    };
  }

  await sleep(FSQ_DELAY_MS);
  const detail = await fetchFoursquare<FoursquarePlace>(
    `/places/${best.place.fsq_id}`,
    config.foursquareApiKey,
    { fields: FSQ_DETAIL_FIELDS }
  );

  const category = detail.categories?.[0]?.name;
  const metadataOnly =
    run.summary.enrichment_target === "google_discovery_approved"
    || run.summary.enrichment_target === "curated_sf_notable";
  const normalizedPayload = {
    fsq_id: detail.fsq_id,
    name: detail.name,
    categories: detail.categories ?? [],
    location: detail.location ?? {},
    hours: detail.hours ?? {},
    website: detail.website,
    verified: detail.verified ?? false
  };

  return {
    providerRecordId: detail.fsq_id,
    rawPayload: {
      ...basePayload,
      source: "foursquare_live",
      detail
    },
    normalizedPayload,
    proposedChanges: {
      ...(metadataOnly
        ? {}
        : {
            name: detail.name,
            canonical_type: venue.canonical_type ?? (category ? "bar" : undefined)
          }),
      metadata_patch: {
        foursquare_id: detail.fsq_id,
        foursquare_category: category,
        foursquare_verified: detail.verified ?? false,
        website: detail.website,
        ...providerProvenancePatch({
          provider: "foursquare",
          runId: run.id,
          matchConfidence: best.score,
          fields: ["fsq_id", "name", "location", "categories", "hours", "website", "verified", "geocodes"]
        })
      }
    },
    matchConfidence: best.score
  };
}

function getGoogleFixturePayloadForVenue(
  venue: VenueRow,
  run: ProviderRunRow
): ProviderCandidatePayload {
  const googlePlaceId = `fixture-google-${venue.id}`;
  const normalizedPayload = {
    google_place_id: googlePlaceId,
    name: venue.name,
    formatted_address: null,
    location: {
      latitude: Number(venue.latitude),
      longitude: Number(venue.longitude)
    },
    types: [venue.canonical_type ?? "bar"],
    primary_type: venue.canonical_type ?? "bar",
    business_status: "OPERATIONAL",
    google_maps_uri: null
  };

  return {
    providerRecordId: googlePlaceId,
    venueId: venue.id,
    rawPayload: {
      venue_id: venue.id,
      venue_name: venue.name,
      run_id: run.id,
      mode: run.mode,
      source: "fixture",
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
    },
    normalizedPayload,
    proposedChanges: {
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
      name: venue.name,
      canonical_type: venue.canonical_type ?? "bar",
      metadata_patch: {
        google_place_id: googlePlaceId,
        google_place_types: [venue.canonical_type ?? "bar"],
        google_business_status: "OPERATIONAL",
        provider_hint: "google_places_fixture"
      }
    },
    matchConfidence: 0.9
  };
}

function getGoogleFixtureDiscoveryPayload(
  market: MarketRow,
  term: string,
  index: number,
  run: ProviderRunRow
): ProviderCandidatePayload {
  const name = `Fixture ${term.replace(/\b\w/g, (letter) => letter.toUpperCase())} ${index + 1}`;
  const googlePlaceId = `fixture-google-discovery-${run.id}-${index}`;
  const latitude = Number(market.center_latitude) + index * 0.001;
  const longitude = Number(market.center_longitude) - index * 0.001;

  return {
    providerRecordId: googlePlaceId,
    venueId: null,
    rawPayload: {
      run_id: run.id,
      mode: run.mode,
      source: "fixture",
      search_term: term,
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
    },
    normalizedPayload: {
      google_place_id: googlePlaceId,
      name,
      formatted_address: `${index + 1} Fixture Way, ${market.display_name}`,
      location: { latitude, longitude },
      types: ["bar", "establishment"],
      primary_type: "bar",
      business_status: "OPERATIONAL",
      google_maps_uri: null
    },
    proposedChanges: {
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
      create_venue: {
        name,
        canonical_type: "bar",
        latitude,
        longitude,
        formatted_address: `${index + 1} Fixture Way, ${market.display_name}`,
        google_place_id: googlePlaceId,
        google_maps_uri: null,
        types: ["bar", "establishment"]
      },
      discovery_context: {
        provider: "google_places",
        google_run_kind: "discovery",
        search_term: term,
        neighborhood: null,
        primary_type: "bar",
        included_reason: "nightlife_type:bar"
      },
      duplicate_warnings: []
    },
    matchConfidence: 0.72
  };
}

async function getGooglePayloadForVenue(
  venue: VenueRow,
  market: MarketRow,
  run: ProviderRunRow,
  config: AppConfig
): Promise<ProviderCandidatePayload> {
  if (run.mode !== "live") {
    return getGoogleFixturePayloadForVenue(venue, run);
  }

  if (!config.googlePlacesApiKey) {
    throw new ApiError(
      409,
      "PROVIDER_KEY_MISSING",
      "GOOGLE_PLACES_API_KEY is required before running a capped live Google Places import."
    );
  }

  const searchBody = googleExistingSearchBody(venue, market);
  const search = await fetchGooglePlacesTextSearch(config.googlePlacesApiKey, searchBody);
  const candidates = (search.places ?? [])
    .map((place) => ({
      place,
      score: scoreCandidate(venue.name, googlePlaceName(place))
    }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];

  if (!best || best.score < 0.55) {
    return {
      providerRecordId: `unmatched-google-${run.id}-${venue.id}`,
      venueId: venue.id,
      rawPayload: {
        venue_id: venue.id,
        venue_name: venue.name,
        run_id: run.id,
        mode: run.mode,
        source: "google_places_live",
        search_body: searchBody,
        candidates: search.places ?? [],
        unmatched: true,
        ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
      },
      normalizedPayload: {
        name: venue.name,
        source: "google_places_live"
      },
      proposedChanges: {
        ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
        metadata_patch: {
          google_places_match_status: "unmatched"
        }
      },
      matchConfidence: best?.score ?? 0
    };
  }

  return {
    providerRecordId: best.place.id,
    venueId: venue.id,
    rawPayload: {
      venue_id: venue.id,
      venue_name: venue.name,
      run_id: run.id,
      mode: run.mode,
      source: "google_places_live",
      search_body: searchBody,
      place: best.place,
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
    },
    normalizedPayload: googleNormalizedPayload(best.place),
    proposedChanges: {
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
      name: googlePlaceName(best.place),
      canonical_type: mapGoogleTypeToCanonicalType(best.place, venue.canonical_type),
      metadata_patch: googleMetadataPatch(best.place, run, best.score)
    },
    matchConfidence: best.score
  };
}

async function getGoogleDiscoveryPayloads(
  client: DBClient,
  market: MarketRow,
  run: ProviderRunRow,
  config: AppConfig
): Promise<{
  payloads: ProviderCandidatePayload[];
  attemptedRequests: number;
  skippedDuplicates: number;
  skippedNonNightlife: number;
  discoveryTerms: string[];
}> {
  const cap = run.capped_venue_count;

  if (run.mode !== "live") {
    return {
      payloads: GOOGLE_DISCOVERY_TERMS.slice(0, cap).map((term, index) =>
        getGoogleFixtureDiscoveryPayload(market, term, index, run)
      ),
      attemptedRequests: Math.min(cap, GOOGLE_DISCOVERY_TERMS.length),
      skippedDuplicates: 0,
      skippedNonNightlife: 0,
      discoveryTerms: GOOGLE_DISCOVERY_TERMS
    };
  }

  if (!config.googlePlacesApiKey) {
    throw new ApiError(
      409,
      "PROVIDER_KEY_MISSING",
      "GOOGLE_PLACES_API_KEY is required before running a capped live Google Places import."
    );
  }

  const neighborhoods = await getMarketNeighborhoodNames(client, market.id);
  const queries = neighborhoods.length > 0
    ? neighborhoods.flatMap((neighborhood) => GOOGLE_DISCOVERY_TERMS.map((term) => ({ term, neighborhood })))
    : GOOGLE_DISCOVERY_TERMS.map((term) => ({ term, neighborhood: undefined as string | undefined }));
  const payloads: ProviderCandidatePayload[] = [];
  const seenPlaceIds = new Set<string>();
  let attemptedRequests = 0;
  let skippedDuplicates = 0;
  let skippedNonNightlife = 0;

  for (const query of queries) {
    if (payloads.length >= cap) break;

    const searchBody = googleDiscoverySearchBody(query.term, market, query.neighborhood);
    const search = await fetchGooglePlacesTextSearch(config.googlePlacesApiKey, searchBody);
    attemptedRequests += 1;

    for (const place of search.places ?? []) {
      if (payloads.length >= cap) break;
      if (!place.id || seenPlaceIds.has(place.id)) {
        skippedDuplicates += 1;
        continue;
      }
      seenPlaceIds.add(place.id);

      const latitude = numberValue(place.location?.latitude);
      const longitude = numberValue(place.location?.longitude);
      if (latitude == null || longitude == null) continue;

      const typeDecision = googleDiscoveryTypeDecision(place);
      if (!typeDecision.allowed) {
        skippedNonNightlife += 1;
        continue;
      }

      const duplicateWarnings = await googleDiscoveryDuplicateWarnings(client, market.id, place, latitude, longitude);
      if (duplicateWarnings.length > 0) {
        skippedDuplicates += 1;
        continue;
      }

      payloads.push({
        providerRecordId: place.id,
        venueId: null,
        rawPayload: {
          run_id: run.id,
          mode: run.mode,
          source: "google_places_live_discovery",
          search_body: searchBody,
          place,
          ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
        },
        normalizedPayload: googleNormalizedPayload(place),
        proposedChanges: {
          ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
          create_venue: {
            name: googlePlaceName(place),
            canonical_type: mapGoogleTypeToCanonicalType(place),
            latitude,
            longitude,
            formatted_address: place.formattedAddress ?? null,
            google_place_id: place.id,
            google_maps_uri: place.googleMapsUri ?? null,
            types: place.types ?? []
          },
          discovery_context: {
            provider: "google_places",
            google_run_kind: "discovery",
            search_term: query.term,
            neighborhood: query.neighborhood ?? null,
            primary_type: place.primaryType ?? null,
            included_reason: typeDecision.reason
          },
          duplicate_warnings: duplicateWarnings
        },
        matchConfidence: 0.72
      });
    }
  }

  return {
    payloads,
    attemptedRequests,
    skippedDuplicates,
    skippedNonNightlife,
    discoveryTerms: GOOGLE_DISCOVERY_TERMS
  };
}

async function getCuratedCandidateReviews(
  client: DBClient,
  marketId: string,
  limit: number,
  options: { testRunId?: string } = {}
): Promise<CuratedCandidateReviewRow[]> {
  const result = await client.query<CuratedCandidateReviewRow>(
    `
      SELECT
        vri.id AS review_item_id,
        vri.provider_record_id,
        vri.market_id,
        vri.proposed_changes,
        pr.normalized_payload,
        vri.created_at
      FROM venue_review_items vri
      JOIN provider_records pr ON pr.id = vri.provider_record_id
      WHERE vri.market_id = $1::uuid
        AND vri.status = 'pending'
        AND vri.venue_id IS NULL
        AND pr.provider = 'manual'
        AND vri.proposed_changes ? 'curated_candidate'
        AND ($3::text IS NULL OR vri.proposed_changes->>'test_run_id' = $3::text)
        AND NOT EXISTS (
          SELECT 1
          FROM provider_records google_pr
          WHERE google_pr.provider = 'google_places'
            AND google_pr.market_id = vri.market_id
            AND google_pr.raw_payload->>'curated_review_item_id' = vri.id::text
            AND google_pr.imported_at > now() - interval '30 days'
        )
      ORDER BY vri.created_at ASC
      LIMIT $2
    `,
    [marketId, limit, options.testRunId ?? null]
  );

  return result.rows;
}

function getGoogleFixturePayloadForCuratedCandidate(
  candidateReview: CuratedCandidateReviewRow,
  market: MarketRow,
  run: ProviderRunRow,
  index: number
): ProviderCandidatePayload {
  const curated = asRecord(candidateReview.proposed_changes.curated_candidate);
  const name = textValue(curated.name) ?? `Curated Venue ${index + 1}`;
  const latitude = numberValue(curated.latitude) ?? Number(market.center_latitude) + index * 0.001;
  const longitude = numberValue(curated.longitude) ?? Number(market.center_longitude) - index * 0.001;
  const googlePlaceId = `fixture-google-curated-${candidateReview.review_item_id}`;
  const canonicalType = textValue(curated.canonical_type) ?? "bar";

  return {
    providerRecordId: googlePlaceId,
    venueId: null,
    rawPayload: {
      run_id: run.id,
      mode: run.mode,
      source: "google_places_fixture_curated_qa",
      curated_review_item_id: candidateReview.review_item_id,
      curated_candidate: curated,
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
    },
    normalizedPayload: {
      google_place_id: googlePlaceId,
      name,
      formatted_address: null,
      location: { latitude, longitude },
      types: [canonicalType, "establishment"],
      primary_type: canonicalType,
      business_status: "OPERATIONAL",
      google_maps_uri: null
    },
    proposedChanges: {
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
      create_venue: {
        name,
        canonical_type: canonicalType,
        latitude,
        longitude,
        formatted_address: null,
        google_place_id: googlePlaceId,
        google_maps_uri: null,
        types: [canonicalType, "establishment"]
      },
      curated_candidate: curated,
      review_context: {
        action_bucket: "google_verified_curated_candidate",
        original_review_item_id: candidateReview.review_item_id,
        approval_default: "manual_hold_for_imperfect_matches"
      },
      duplicate_warnings: [],
      metadata_patch: {
        neighborhood: textValue(curated.neighborhood),
        notability_reason: textValue(curated.notability_reason),
        source_note: textValue(curated.source_note),
        provider: "manual_curated_google_verified",
        ...providerProvenancePatch({
          provider: "google_places",
          runId: run.id,
          matchConfidence: 0.9,
          fields: ["fixture"]
        })
      }
    },
    matchConfidence: 0.9
  };
}

async function getGooglePayloadForCuratedCandidate(
  client: DBClient,
  candidateReview: CuratedCandidateReviewRow,
  market: MarketRow,
  run: ProviderRunRow,
  config: AppConfig,
  index: number
): Promise<ProviderCandidatePayload> {
  if (run.mode !== "live") {
    return getGoogleFixturePayloadForCuratedCandidate(candidateReview, market, run, index);
  }

  if (!config.googlePlacesApiKey) {
    throw new ApiError(
      409,
      "PROVIDER_KEY_MISSING",
      "GOOGLE_PLACES_API_KEY is required before running a capped live Google Places import."
    );
  }

  const curated = asRecord(candidateReview.proposed_changes.curated_candidate);
  const curatedName = textValue(curated.name) ?? "Unnamed nightlife venue";
  const searchBody = googleCuratedSearchBody(curated, market);
  const search = await fetchGooglePlacesTextSearch(config.googlePlacesApiKey, searchBody);
  const candidates = (search.places ?? [])
    .map((place) => ({ place, score: scoreCandidate(curatedName, googlePlaceName(place)) }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const basePayload = {
    run_id: run.id,
    mode: run.mode,
    source: "google_places_live_curated_qa",
    curated_review_item_id: candidateReview.review_item_id,
    curated_candidate: curated,
    search_body: searchBody,
    ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {})
  };

  if (!best || best.score < 0.55) {
    return {
      providerRecordId: `unmatched-google-curated-${run.id}-${candidateReview.review_item_id}`,
      venueId: null,
      rawPayload: {
        ...basePayload,
        candidates: search.places ?? [],
        unmatched: true
      },
      normalizedPayload: {
        name: curatedName,
        source: "google_places_live_curated_qa"
      },
      proposedChanges: {
        curated_candidate: curated,
        review_context: {
          action_bucket: "hold_manual",
          hold_reason: "low_confidence_google_match",
          original_review_item_id: candidateReview.review_item_id
        },
        duplicate_warnings: [],
        metadata_patch: {
          google_places_match_status: "unmatched",
          ...providerProvenancePatch({
            provider: "google_places",
            runId: run.id,
            matchConfidence: best?.score ?? 0,
            fields: []
          })
        }
      },
      matchConfidence: best?.score ?? 0
    };
  }

  const place = best.place;
  const latitude = numberValue(place.location?.latitude);
  const longitude = numberValue(place.location?.longitude);
  const duplicateResult =
    latitude == null || longitude == null
      ? { warnings: ["missing_google_coordinates"], blockingDuplicate: false }
      : await findProviderDuplicateWarnings(client, {
          marketId: market.id,
          name: googlePlaceName(place),
          latitude,
          longitude,
          googlePlaceId: textValue(place.id),
          radiusMeters: DISCOVERY_DUPLICATE_RADIUS_METERS
        });
  const status = place.businessStatus ?? null;
  const shouldHold =
    status !== "OPERATIONAL" ||
    latitude == null ||
    longitude == null ||
    duplicateResult.warnings.length > 0;
  const canonicalType = textValue(curated.canonical_type) ?? mapGoogleTypeToCanonicalType(place);
  const metadataPatch = {
    neighborhood: textValue(curated.neighborhood),
    notability_reason: textValue(curated.notability_reason),
    source_note: textValue(curated.source_note),
    source_url: textValue(curated.source_url),
    alias_names: textValue(curated.alias_names),
    provider: "manual_curated_google_verified",
    ...googleMetadataPatch(place, run, best.score)
  };

  return {
    providerRecordId: place.id,
    venueId: null,
    rawPayload: {
      ...basePayload,
      place
    },
    normalizedPayload: googleNormalizedPayload(place),
    proposedChanges: {
      ...(typeof run.summary.test_run_id === "string" ? { test_run_id: run.summary.test_run_id } : {}),
      ...(shouldHold
        ? {}
        : {
            create_venue: {
              name: curatedName,
              provider_display_name: googlePlaceName(place),
              canonical_type: canonicalType,
              latitude,
              longitude,
              formatted_address: place.formattedAddress ?? null,
              google_place_id: place.id,
              google_maps_uri: place.googleMapsUri ?? null,
              types: place.types ?? []
            }
          }),
      curated_candidate: curated,
      review_context: {
        action_bucket: shouldHold ? "hold_manual" : "google_verified_curated_candidate",
        hold_reason:
          status !== "OPERATIONAL"
            ? `business_status:${status ?? "missing"}`
            : latitude == null || longitude == null
              ? "missing_google_coordinates"
              : duplicateResult.warnings.length > 0
                ? "duplicate_warning"
                : null,
        original_review_item_id: candidateReview.review_item_id,
        approval_default: "manual_hold_for_imperfect_matches",
        provider_display_name: googlePlaceName(place)
      },
      duplicate_warnings: duplicateResult.warnings,
      metadata_patch: metadataPatch
    },
    matchConfidence: best.score
  };
}

async function insertProviderCandidate(input: {
  client: DBClient;
  run: ProviderRunRow;
  provider: "foursquare" | "google_places";
  payload: ProviderCandidatePayload;
}) {
  const record = await input.client.query<{ id: string }>(
    `
      INSERT INTO provider_records (
        provider,
        provider_record_id,
        record_type,
        market_id,
        venue_id,
        import_run_id,
        raw_payload,
        normalized_payload,
        match_confidence,
        match_status,
        license,
        attribution
      )
      VALUES (
        $1,
        $2,
        'venue',
        $3::uuid,
        $4::uuid,
        $5::uuid,
        $6::jsonb,
        $7::jsonb,
        $8,
        'candidate',
        $9::jsonb,
        $10::jsonb
      )
      RETURNING id
    `,
    [
      input.provider,
      input.payload.providerRecordId,
      input.run.market_id,
      input.payload.venueId,
      input.run.id,
      serialize(input.payload.rawPayload),
      serialize(input.payload.normalizedPayload),
      input.payload.matchConfidence,
      serialize(
        input.provider === "google_places"
          ? {
              provider_terms: "Google Places API New",
              field_mask: GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK,
              enterprise_fields_used: false,
              photos_used: false,
              reviews_used: false
            }
          : {
              provider_terms: "Foursquare Places API",
              photos_used: false,
              tips_used: false
            }
      ),
      serialize(
        input.provider === "google_places"
          ? {
              provider: "Google Places",
              field_mask: GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK
            }
          : {
              provider: "Foursquare",
              visual_credit_required: true
            }
      )
    ]
  );

  await input.client.query(
    `
      INSERT INTO venue_review_items (
        provider_record_id,
        venue_id,
        market_id,
        proposed_changes
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb)
    `,
    [
      record.rows[0]?.id,
      input.payload.venueId,
      input.run.market_id,
      serialize(input.payload.proposedChanges)
    ]
  );
}

export async function runProviderImportRun(input: {
  config: AppConfig;
  runId: string;
  actor: AdminActor;
}) {
  return dbTransaction(async (client) => {
    const run = await readProviderRun(client, input.runId, true);

    if (run.provider === "resident_advisor") {
      await client.query(
        `
          UPDATE provider_import_runs
          SET status = 'blocked',
              error = 'Resident Advisor imports are disabled.',
              completed_at = now()
          WHERE id = $1::uuid
        `,
        [run.id]
      );
      throw new ApiError(
        409,
        "PROVIDER_DISABLED",
        "Resident Advisor imports are disabled until Nightloop has licensed access."
      );
    }

    if (run.provider !== "foursquare" && run.provider !== "google_places") {
      throw validationError("Only Foursquare and Google Places provider runs are supported.");
    }

    await client.query(
      `
        UPDATE provider_import_runs
        SET status = 'running',
            started_at = COALESCE(started_at, now()),
            error = NULL
        WHERE id = $1::uuid
      `,
      [run.id]
    );

    const market = await getMarketForAdmin(client, run.market_id);
    let providerRecordsCreated = 0;
    let reviewItemsCreated = 0;
    let attempted = 0;
    let skippedDuplicates = 0;
    let skippedNonNightlife = 0;
    let skippedFreshCache = 0;
    let discoveryTerms: string[] | undefined;
    const errors: Array<{ venue_id?: string; provider_record_id?: string; message: string }> = [];
    const forceRefresh = run.summary.force_refresh === true;
    const useFreshCache = run.mode === "live" && !forceRefresh;

    if (run.provider === "foursquare") {
      const venueCandidates = await getMarketVenues(client, run.market_id, run.capped_venue_count, {
        prioritizeGoogleDiscoveryApproved: run.summary.enrichment_target === "google_discovery_approved",
        prioritizeCuratedSfNotable: run.summary.enrichment_target === "curated_sf_notable"
      });
      const venues = useFreshCache
        ? venueCandidates.filter((venue) => {
            if (!hasFreshFoursquareMetadata(asRecord(venue.metadata))) return true;
            skippedFreshCache += 1;
            return false;
          })
        : venueCandidates;
      attempted = venues.length;

      for (const venue of venues) {
        try {
          const foursquarePayload = await getFoursquarePayloadForVenue(venue, run, input.config);
          await insertProviderCandidate({
            client,
            run,
            provider: "foursquare",
            payload: {
              ...foursquarePayload,
              venueId: venue.id
            }
          });
          providerRecordsCreated += 1;
          reviewItemsCreated += 1;
        } catch (error) {
          errors.push({
            venue_id: venue.id,
            message: error instanceof Error ? error.message : "Unknown provider import error."
          });
          if (isProviderAuthError(error)) {
            break;
          }
        }
      }
    } else {
      const kind = googleRunKind(run);
      let payloads: ProviderCandidatePayload[];
      if (kind === "discovery") {
        const discovery = await getGoogleDiscoveryPayloads(client, market, run, input.config);
        payloads = discovery.payloads;
        attempted = discovery.attemptedRequests;
        skippedDuplicates += discovery.skippedDuplicates;
        skippedNonNightlife = discovery.skippedNonNightlife;
        discoveryTerms = discovery.discoveryTerms;
      } else if (kind === "curated_qa") {
        const curatedCandidates = await getCuratedCandidateReviews(client, run.market_id, run.capped_venue_count, {
          testRunId: typeof run.summary.test_run_id === "string" ? run.summary.test_run_id : undefined
        });
        attempted = curatedCandidates.length;
        payloads = [];
        for (const [index, candidate] of curatedCandidates.entries()) {
          const previous = await client.query<{ exists: boolean }>(
            `
              SELECT EXISTS (
                SELECT 1
                FROM provider_records
                WHERE provider = 'google_places'
                  AND raw_payload->>'curated_review_item_id' = $1
                  AND market_id = $2::uuid
                  AND imported_at > now() - interval '30 days'
              ) AS exists
            `,
            [candidate.review_item_id, run.market_id]
          );
          if (useFreshCache && previous.rows[0]?.exists) {
            skippedFreshCache += 1;
            continue;
          }
          payloads.push(await getGooglePayloadForCuratedCandidate(client, candidate, market, run, input.config, index));
        }
      } else {
        const venueCandidates = await getMarketVenues(client, run.market_id, run.capped_venue_count);
        const venues = useFreshCache
          ? venueCandidates.filter((venue) => {
              if (!hasFreshGoogleMetadata(asRecord(venue.metadata))) return true;
              skippedFreshCache += 1;
              return false;
            })
          : venueCandidates;
        payloads = await Promise.all(venues.map((venue) => getGooglePayloadForVenue(venue, market, run, input.config)));
        attempted = venues.length;
      }

      for (const payload of payloads) {
        try {
          const duplicate = await client.query<{ exists: boolean }>(
            `
              SELECT EXISTS (
                SELECT 1 FROM provider_records
                WHERE provider = 'google_places'
                  AND provider_record_id = $1
                  AND market_id = $2::uuid
                  AND import_run_id <> $3::uuid
              ) AS exists
            `,
            [payload.providerRecordId, run.market_id, run.id]
          );
          if (duplicate.rows[0]?.exists) {
            skippedDuplicates += 1;
            continue;
          }

          await insertProviderCandidate({
            client,
            run,
            provider: "google_places",
            payload
          });
          providerRecordsCreated += 1;
          reviewItemsCreated += 1;
        } catch (error) {
          errors.push({
            venue_id: payload.venueId ?? undefined,
            provider_record_id: payload.providerRecordId,
            message: error instanceof Error ? error.message : "Unknown provider import error."
          });
        }
      }
    }

    const summary = {
      ...run.summary,
      provider: run.provider,
      google_run_kind: run.provider === "google_places" ? googleRunKind(run) : undefined,
      attempted_requests: attempted,
      attempted_venues: run.provider === "google_places" && googleRunKind(run) === "discovery" ? undefined : attempted,
      provider_records_created: providerRecordsCreated,
      review_items_created: reviewItemsCreated,
      skipped_duplicates: skippedDuplicates,
      skipped_non_nightlife: skippedNonNightlife,
      skipped_fresh_cache: skippedFreshCache,
      discovery_terms: discoveryTerms,
      errors
    };

    const updated = await client.query<ProviderRunRow>(
      `
        UPDATE provider_import_runs
        SET status = $2,
            summary = $3::jsonb,
            error = $4,
            completed_at = now()
        WHERE id = $1::uuid
        RETURNING *
      `,
      [
        run.id,
        errors.length > 0 && providerRecordsCreated === 0 ? "failed" : "completed",
        serialize(summary),
        errors.length > 0 ? "One or more venues failed during provider import." : null
      ]
    );

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, metadata)
        VALUES ($1::uuid, 'provider_import.run', $2::jsonb)
      `,
      [
        input.actor.userId,
        serialize({
          provider: run.provider,
          run_id: run.id,
          mode: run.mode,
          summary
        })
      ]
    );

    return { run: updated.rows[0], summary };
  });
}

export async function listProviderRecords(filters: { importRunId?: string; limit?: number }) {
  const result = await dbQuery(
    `
      SELECT
        pr.*,
        v.name AS venue_name,
        vri.status AS review_status
      FROM provider_records pr
      LEFT JOIN venues v ON v.id = pr.venue_id
      LEFT JOIN venue_review_items vri ON vri.provider_record_id = pr.id
      WHERE ($1::uuid IS NULL OR pr.import_run_id = $1::uuid)
      ORDER BY pr.created_at DESC
      LIMIT $2
    `,
    [filters.importRunId ?? null, Math.max(1, Math.min(100, filters.limit ?? 50))]
  );

  return { items: result.rows };
}

export async function listVenueReviewItems(filters: {
  status?: "pending" | "approved" | "rejected";
  importRunId?: string;
  limit?: number;
}) {
  const result = await dbQuery<VenueReviewRow>(
    `
      SELECT
        vri.*,
        pr.provider,
        pr.provider_record_id AS provider_record_id_external,
        pr.import_run_id,
        pr.raw_payload,
        pr.normalized_payload,
        v.name AS venue_name
      FROM venue_review_items vri
      JOIN provider_records pr ON pr.id = vri.provider_record_id
      LEFT JOIN venues v ON v.id = vri.venue_id
      WHERE ($1::text IS NULL OR vri.status = $1)
        AND ($2::uuid IS NULL OR pr.import_run_id = $2::uuid)
      ORDER BY vri.created_at DESC
      LIMIT $3
    `,
    [
      filters.status ?? null,
      filters.importRunId ?? null,
      Math.max(1, Math.min(100, filters.limit ?? 50))
    ]
  );

  return { items: result.rows };
}

function allowedVenuePatch(proposed: JsonRecord): {
  name: string | null;
  canonicalType: string | null;
  metadataPatch: JsonRecord | null;
} {
  const name = typeof proposed.name === "string" && proposed.name.trim() ? proposed.name.trim() : null;
  const canonicalType =
    typeof proposed.canonical_type === "string" && proposed.canonical_type.trim()
      ? proposed.canonical_type.trim()
      : null;
  const metadataPatch = asRecord(proposed.metadata_patch);
  return {
    name,
    canonicalType,
    metadataPatch: Object.keys(metadataPatch).length > 0 ? metadataPatch : null
  };
}

function discoveryVenueFromProposed(proposed: JsonRecord): {
  name: string;
  canonicalType: string;
  latitude: number;
  longitude: number;
  metadata: JsonRecord;
  source: string;
} | null {
  const createVenue = asRecord(proposed.create_venue);
  if (Object.keys(createVenue).length === 0) return null;

  const name = textValue(createVenue.name);
  const latitude = numberValue(createVenue.latitude);
  const longitude = numberValue(createVenue.longitude);
  if (!name || latitude == null || longitude == null) {
    throw validationError("Discovery review item is missing required venue creation fields.", {
      create_venue: "name, latitude, and longitude are required"
    });
  }

  const canonicalType = textValue(createVenue.canonical_type) ?? "bar";
  const metadataPatch = asRecord(proposed.metadata_patch);
  const metadata = {
    ...metadataPatch,
    ...(typeof proposed.test_run_id === "string" ? { test_run_id: proposed.test_run_id } : {}),
    ...(textValue(createVenue.google_place_id) ? { google_place_id: textValue(createVenue.google_place_id) } : {}),
    ...(textValue(createVenue.google_maps_uri) ? { google_maps_uri: textValue(createVenue.google_maps_uri) } : {}),
    ...(textValue(createVenue.formatted_address)
      ? { google_formatted_address: textValue(createVenue.formatted_address) }
      : {}),
    ...(Array.isArray(createVenue.types) ? { google_place_types: createVenue.types } : {}),
    provider: textValue(metadataPatch.provider) ?? "google_places",
    discovery_source: textValue(metadataPatch.provider) === "manual_curated_google_verified"
      ? "curated_ops_review"
      : "ops_review"
  };

  return {
    name,
    canonicalType,
    latitude,
    longitude,
    metadata,
    source: textValue(metadataPatch.provider) === "manual_curated_google_verified"
      ? "curated:sf_notable"
      : "provider:google_places"
  };
}

export async function approveVenueReviewItem(input: {
  reviewItemId: string;
  note?: string;
  actor: AdminActor;
}) {
  return dbTransaction(async (client) => {
    const reviewResult = await client.query<VenueReviewRow>(
      `
        SELECT
          vri.*,
          pr.provider,
          pr.provider_record_id AS provider_record_id_external,
          pr.import_run_id,
          pr.raw_payload,
          pr.normalized_payload,
          v.name AS venue_name
        FROM venue_review_items vri
        JOIN provider_records pr ON pr.id = vri.provider_record_id
        LEFT JOIN venues v ON v.id = vri.venue_id
        WHERE vri.id = $1::uuid
        FOR UPDATE OF vri
      `,
      [input.reviewItemId]
    );
    const review = reviewResult.rows[0];
    if (!review) {
      throw notFoundError("Venue review item was not found.");
    }
    if (review.status !== "pending") {
      throw new ApiError(409, "REVIEW_ITEM_ALREADY_DECIDED", "Review item has already been decided.");
    }
    let venue: { rows: ApprovedVenueRow[] };
    let approvedVenueId = review.venue_id;

    if (!review.venue_id) {
      const discoveryVenue = discoveryVenueFromProposed(review.proposed_changes);
      if (!discoveryVenue) {
        throw validationError("Review item is not attached to a canonical venue.");
      }
      const market = await getMarketForAdmin(client, review.market_id);
      const created = await client.query<ApprovedVenueRow>(
        `
          INSERT INTO venues (
            slug,
            name,
            city,
            country_code,
            latitude,
            longitude,
            source,
            metadata,
            market_id,
            canonical_type,
            is_active,
            admin_status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::jsonb,
            $9::uuid,
            $10,
            true,
            'approved'
          )
          RETURNING id, slug, name, source, canonical_type, is_active, admin_status, metadata
        `,
        [
          `${slugify(discoveryVenue.name)}-${randomUUID().slice(0, 8)}`,
          discoveryVenue.name,
          market.display_name,
          market.country_code,
          discoveryVenue.latitude,
          discoveryVenue.longitude,
          discoveryVenue.source,
          serialize(discoveryVenue.metadata),
          review.market_id,
          discoveryVenue.canonicalType
        ]
      );
      venue = created;
      approvedVenueId = created.rows[0]?.id as string | null;
    } else {
      const patch = allowedVenuePatch(review.proposed_changes);
      venue = await client.query<ApprovedVenueRow>(
        `
          UPDATE venues
          SET name = COALESCE($2, name),
              canonical_type = COALESCE($3, canonical_type),
              metadata = CASE
                WHEN $4::jsonb IS NULL THEN metadata
                ELSE metadata || $4::jsonb
              END
          WHERE id = $1::uuid
          RETURNING id, name, canonical_type, metadata
        `,
        [
          review.venue_id,
          patch.name,
          patch.canonicalType,
          patch.metadataPatch ? serialize(patch.metadataPatch) : null
        ]
      );
    }

    await client.query(
      `
        UPDATE venue_review_items
        SET status = 'approved',
            review_notes = $2,
            reviewed_by_user_id = $3::uuid,
            reviewed_at = now()
        WHERE id = $1::uuid
      `,
      [review.id, input.note ?? null, input.actor.userId]
    );

    await client.query(
      "UPDATE provider_records SET match_status = 'approved', venue_id = COALESCE($2::uuid, venue_id) WHERE id = $1::uuid",
      [review.provider_record_id, approvedVenueId]
    );

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, metadata)
        VALUES ($1::uuid, 'venue_review.approved', $2::jsonb)
      `,
      [
        input.actor.userId,
        serialize({
          review_item_id: review.id,
          provider_record_id: review.provider_record_id,
          venue_id: approvedVenueId,
          proposed_changes: review.proposed_changes,
          note: input.note ?? null
        })
      ]
    );

    return { review_item: { ...review, status: "approved", review_notes: input.note ?? null }, venue: venue.rows[0] };
  });
}

export async function rejectVenueReviewItem(input: {
  reviewItemId: string;
  reason: string;
  actor: AdminActor;
}) {
  return dbTransaction(async (client) => {
    const reviewResult = await client.query<VenueReviewRow>(
      `
        SELECT
          vri.*,
          pr.provider,
          pr.provider_record_id AS provider_record_id_external,
          pr.import_run_id,
          pr.raw_payload,
          pr.normalized_payload,
          v.name AS venue_name
        FROM venue_review_items vri
        JOIN provider_records pr ON pr.id = vri.provider_record_id
        LEFT JOIN venues v ON v.id = vri.venue_id
        WHERE vri.id = $1::uuid
        FOR UPDATE OF vri
      `,
      [input.reviewItemId]
    );
    const review = reviewResult.rows[0];
    if (!review) {
      throw notFoundError("Venue review item was not found.");
    }
    if (review.status !== "pending") {
      throw new ApiError(409, "REVIEW_ITEM_ALREADY_DECIDED", "Review item has already been decided.");
    }

    await client.query(
      `
        UPDATE venue_review_items
        SET status = 'rejected',
            review_notes = $2,
            reviewed_by_user_id = $3::uuid,
            reviewed_at = now()
        WHERE id = $1::uuid
      `,
      [review.id, input.reason, input.actor.userId]
    );

    await client.query(
      "UPDATE provider_records SET match_status = 'rejected' WHERE id = $1::uuid",
      [review.provider_record_id]
    );

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, metadata)
        VALUES ($1::uuid, 'venue_review.rejected', $2::jsonb)
      `,
      [
        input.actor.userId,
        serialize({
          review_item_id: review.id,
          provider_record_id: review.provider_record_id,
          venue_id: review.venue_id,
          reason: input.reason
        })
      ]
    );

    return { review_item: { ...review, status: "rejected", review_notes: input.reason } };
  });
}

export async function listVenueAssets(filters: { venueId?: string; limit?: number }) {
  const result = await dbQuery<VenueAssetRow>(
    `
      SELECT *
      FROM venue_assets
      WHERE ($1::uuid IS NULL OR venue_id = $1::uuid)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [filters.venueId ?? null, Math.max(1, Math.min(100, filters.limit ?? 50))]
  );
  return { items: result.rows };
}

export async function createVenueAsset(input: {
  venueId: string;
  assetType: "image";
  url: string;
  altText?: string;
  creditText: string;
  creditUrl?: string;
  licenseName: string;
  licenseUrl?: string;
  rightsStatus: "licensed" | "owned" | "partner" | "public_domain";
  source: string;
  isApproved: boolean;
  sortOrder?: number;
  metadata?: JsonRecord;
  actor: AdminActor;
}) {
  return dbTransaction(async (client) => {
    const venue = await getVenueForAdmin(client, input.venueId);
    const result = await client.query<VenueAssetRow>(
      `
        INSERT INTO venue_assets (
          venue_id,
          market_id,
          asset_type,
          url,
          alt_text,
          credit_text,
          credit_url,
          license_name,
          license_url,
          rights_status,
          source,
          is_approved,
          sort_order,
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
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::jsonb
        )
        RETURNING *
      `,
      [
        venue.id,
        venue.market_id,
        input.assetType,
        input.url,
        input.altText ?? null,
        input.creditText,
        input.creditUrl ?? null,
        input.licenseName,
        input.licenseUrl ?? null,
        input.rightsStatus,
        input.source,
        input.isApproved,
        input.sortOrder ?? 0,
        serialize(input.metadata ?? {})
      ]
    );

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, metadata)
        VALUES ($1::uuid, 'venue_asset.created', $2::jsonb)
      `,
      [input.actor.userId, serialize({ venue_id: venue.id, asset_id: result.rows[0]?.id })]
    );

    return { asset: result.rows[0] };
  });
}

export async function patchVenueAsset(input: {
  assetId: string;
  patch: Partial<{
    altText: string | null;
    creditText: string;
    creditUrl: string | null;
    licenseName: string;
    licenseUrl: string | null;
    rightsStatus: "licensed" | "owned" | "partner" | "public_domain";
    isApproved: boolean;
    sortOrder: number;
  }>;
  actor: AdminActor;
}) {
  const current = await dbQuery<VenueAssetRow>("SELECT * FROM venue_assets WHERE id = $1::uuid", [
    input.assetId
  ]);
  const asset = current.rows[0];
  if (!asset) {
    throw notFoundError("Venue asset was not found.");
  }

  const result = await dbQuery<VenueAssetRow>(
    `
      UPDATE venue_assets
      SET alt_text = COALESCE($2, alt_text),
          credit_text = COALESCE($3, credit_text),
          credit_url = COALESCE($4, credit_url),
          license_name = COALESCE($5, license_name),
          license_url = COALESCE($6, license_url),
          rights_status = COALESCE($7, rights_status),
          is_approved = COALESCE($8, is_approved),
          sort_order = COALESCE($9, sort_order)
      WHERE id = $1::uuid
      RETURNING *
    `,
    [
      input.assetId,
      input.patch.altText,
      input.patch.creditText,
      input.patch.creditUrl,
      input.patch.licenseName,
      input.patch.licenseUrl,
      input.patch.rightsStatus,
      input.patch.isApproved,
      input.patch.sortOrder
    ]
  );

  await dbQuery(
    `
      INSERT INTO audit_logs (actor_user_id, action, metadata)
      VALUES ($1::uuid, 'venue_asset.updated', $2::jsonb)
    `,
    [input.actor.userId, serialize({ asset_id: input.assetId, patch: input.patch })]
  );

  return { asset: result.rows[0] };
}

export async function importEvents(input: {
  events: Array<{
    venueId: string;
    title: string;
    startsAt: string;
    endsAt?: string | null;
    source: "manual" | "foursquare" | "google_places" | "resident_advisor";
    sourceEventId?: string | null;
    url?: string | null;
    isApproved: boolean;
    metadata?: JsonRecord;
  }>;
  actor: AdminActor;
}) {
  return dbTransaction(async (client) => {
    const imported: EventRow[] = [];

    for (const event of input.events) {
      if (event.source === "resident_advisor") {
        throw new ApiError(
          409,
          "PROVIDER_DISABLED",
          "Resident Advisor events require licensed access before import."
        );
      }

      const venue = await getVenueForAdmin(client, event.venueId);
      const metadata = event.metadata ?? {};
      const result = await client.query<EventRow>(
        `
          INSERT INTO events (
            venue_id,
            market_id,
            title,
            starts_at,
            ends_at,
            source,
            source_event_id,
            url,
            is_approved,
            metadata
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4::timestamptz,
            $5::timestamptz,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb
          )
          ON CONFLICT (source, source_event_id)
          WHERE source_event_id IS NOT NULL
          DO UPDATE SET
            venue_id = EXCLUDED.venue_id,
            market_id = EXCLUDED.market_id,
            title = EXCLUDED.title,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            url = EXCLUDED.url,
            is_approved = EXCLUDED.is_approved,
            metadata = EXCLUDED.metadata,
            updated_at = now()
          RETURNING *
        `,
        [
          venue.id,
          venue.market_id,
          event.title,
          event.startsAt,
          event.endsAt ?? null,
          event.source,
          event.sourceEventId ?? null,
          event.url ?? null,
          event.isApproved,
          serialize(metadata)
        ]
      );
      imported.push(result.rows[0]);
    }

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, metadata)
        VALUES ($1::uuid, 'events.imported', $2::jsonb)
      `,
      [input.actor.userId, serialize({ count: imported.length, event_ids: imported.map((event) => event.id) })]
    );

    return { items: imported, count: imported.length };
  });
}

export async function listModerationReports(filters: {
  status?: "open" | "reviewing" | "resolved" | "dismissed";
  limit?: number;
}) {
  const result = await dbQuery<ModerationReportRow>(
    `
      SELECT *
      FROM moderation_reports
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [filters.status ?? null, Math.max(1, Math.min(100, filters.limit ?? 50))]
  );
  return { items: result.rows };
}

export async function patchModerationReport(input: {
  reportId: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  actor: AdminActor;
}) {
  const result = await dbQuery<ModerationReportRow>(
    `
      UPDATE moderation_reports
      SET status = $2,
          reviewed_by_user_id = $3::uuid,
          reviewed_at = CASE
            WHEN $2 IN ('resolved', 'dismissed') THEN now()
            ELSE reviewed_at
          END
      WHERE id = $1::uuid
      RETURNING *
    `,
    [input.reportId, input.status, input.actor.userId]
  );

  const report = result.rows[0];
  if (!report) {
    throw notFoundError("Moderation report was not found.");
  }

  await dbQuery(
    `
      INSERT INTO audit_logs (actor_user_id, action, metadata)
      VALUES ($1::uuid, 'moderation_report.updated', $2::jsonb)
    `,
    [input.actor.userId, serialize({ report_id: input.reportId, status: input.status })]
  );

  return { report };
}

export async function getReviewerAccountStatus(config: AppConfig) {
  if (!config.reviewerAuthUserId) {
    return {
      configured: false,
      seeded: false,
      user: null
    };
  }

  const result = await dbQuery(
    `
      SELECT
        u.id,
        u.auth_user_id,
        u.eligibility_status,
        p.username,
        p.display_name
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.auth_user_id = $1::uuid
      LIMIT 1
    `,
    [config.reviewerAuthUserId]
  );

  return {
    configured: true,
    seeded: result.rows.length > 0,
    user: result.rows[0] ?? null
  };
}

export async function seedReviewerAccount(config: AppConfig, actor: AdminActor) {
  if (!config.reviewerAuthUserId) {
    throw new ApiError(
      409,
      "REVIEWER_AUTH_USER_ID_MISSING",
      "Set REVIEWER_AUTH_USER_ID before seeding the App Store reviewer account."
    );
  }

  const reviewerAuthUserId = config.reviewerAuthUserId;
  const account = await ensureAccountForAuthUser(reviewerAuthUserId);

  await dbTransaction(async (client) => {
    await client.query(
      `
        UPDATE users
        SET eligibility_status = 'eligible',
            age_attested_at = COALESCE(age_attested_at, now())
        WHERE id = $1::uuid
      `,
      [account.user.id]
    );

    await client.query(
      `
        UPDATE user_profiles
        SET display_name = 'Nightloop Reviewer',
            username = $2
        WHERE user_id = $1::uuid
      `,
      [account.user.id, `reviewer_${reviewerAuthUserId.replace(/-/g, "").slice(0, 10)}`]
    );

    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, target_user_id, action, metadata)
        VALUES ($1::uuid, $2::uuid, 'reviewer_account.seeded', '{}'::jsonb)
      `,
      [actor.userId, account.user.id]
    );
  });

  return getReviewerAccountStatus(config);
}
