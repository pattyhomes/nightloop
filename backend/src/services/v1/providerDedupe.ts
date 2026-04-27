import type { DBClient } from "../../lib/db";

export type ProviderVenueForDedupe = {
  id: string;
  name: string;
  latitude: string | number;
  longitude: string | number;
  metadata: Record<string, unknown>;
};

export type ProviderDedupeInput = {
  marketId: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  foursquareId?: string | null;
  dataSfRecordId?: string | null;
  address?: string | null;
  radiusMeters?: number;
};

export type ProviderDedupeResult = {
  warnings: string[];
  blockingDuplicate: boolean;
};

export const DEFAULT_PROVIDER_DUPLICATE_RADIUS_METERS = 160;
export const PROVIDER_FRESHNESS_DAYS = 30;

export function normalizeProviderName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|sf|san francisco)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreProviderName(queryName: string, candidateName: string): number {
  const query = normalizeProviderName(queryName);
  const candidate = normalizeProviderName(candidateName);
  if (!query || !candidate) return 0;
  if (candidate === query) return 0.92;
  if (candidate.replace(/\s+/g, "") === query.replace(/\s+/g, "")) return 0.78;
  if (candidate.includes(query) || query.includes(candidate)) return 0.64;
  return 0.25;
}

export function distanceMeters(
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(rightLatitude - leftLatitude);
  const dLon = toRadians(rightLongitude - leftLongitude);
  const lat1 = toRadians(leftLatitude);
  const lat2 = toRadians(rightLatitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\broad\b/g, "rd")
    .replace(/\bplace\b/g, "pl")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function addressesLikelyMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight} `) ||
    normalizedRight.startsWith(`${normalizedLeft} `);
}

function hasFreshProviderMetadata(metadata: Record<string, unknown>, key: string, now = new Date()): boolean {
  const checkedAt = textValue(metadata[key]);
  if (!checkedAt) return false;
  const checked = new Date(checkedAt).getTime();
  if (!Number.isFinite(checked)) return false;
  const ageMs = now.getTime() - checked;
  return ageMs >= 0 && ageMs < PROVIDER_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

export function hasFreshGoogleMetadata(metadata: Record<string, unknown>, now = new Date()): boolean {
  return Boolean(textValue(metadata.google_place_id)) && hasFreshProviderMetadata(metadata, "google_checked_at", now);
}

export function hasFreshFoursquareMetadata(metadata: Record<string, unknown>, now = new Date()): boolean {
  return Boolean(textValue(metadata.foursquare_id)) && hasFreshProviderMetadata(metadata, "foursquare_checked_at", now);
}

export function providerProvenancePatch(input: {
  provider: "google_places" | "foursquare" | "manual" | "datasf_poe";
  runId?: string;
  matchConfidence?: number;
  checkedAt?: string;
  fields?: string[];
}): Record<string, unknown> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const prefix =
    input.provider === "google_places"
      ? "google"
      : input.provider === "datasf_poe"
        ? "datasf"
        : input.provider;
  return {
    [`${prefix}_checked_at`]: checkedAt,
    [`${prefix}_last_run_id`]: input.runId ?? null,
    [`${prefix}_match_confidence`]: input.matchConfidence ?? null,
    [`${prefix}_provenance_fields`]: input.fields ?? []
  };
}

export async function findProviderDuplicateWarnings(
  client: DBClient,
  input: ProviderDedupeInput
): Promise<ProviderDedupeResult> {
  const radius = input.radiusMeters ?? DEFAULT_PROVIDER_DUPLICATE_RADIUS_METERS;
  const result = await client.query<ProviderVenueForDedupe>(
    `
      SELECT id, name, latitude, longitude, metadata
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
      LIMIT 500
    `,
    [input.marketId]
  );

  const warnings: string[] = [];
  let blockingDuplicate = false;
  const candidateName = normalizeProviderName(input.name);

  for (const venue of result.rows) {
    const metadata = venue.metadata ?? {};
    const existingGooglePlaceId = textValue(metadata.google_place_id);
    const existingFoursquareId = textValue(metadata.foursquare_id);
    const existingDataSfRecordId = textValue(metadata.datasf_poe_record_id);

    if (input.googlePlaceId && existingGooglePlaceId === input.googlePlaceId) {
      warnings.push(`existing_google_place:${venue.id}:${venue.name}`);
      blockingDuplicate = true;
      continue;
    }

    if (input.foursquareId && existingFoursquareId === input.foursquareId) {
      warnings.push(`existing_foursquare_place:${venue.id}:${venue.name}`);
      blockingDuplicate = true;
      continue;
    }

    if (input.dataSfRecordId && existingDataSfRecordId === input.dataSfRecordId) {
      warnings.push(`existing_datasf_poe_record:${venue.id}:${venue.name}`);
      blockingDuplicate = true;
      continue;
    }

    const venueName = normalizeProviderName(venue.name);

    if (venueName === candidateName && (input.latitude == null || input.longitude == null)) {
      warnings.push(`same_name_existing:${venue.id}:${venue.name}`);
      blockingDuplicate = true;
      continue;
    }

    const inputAddress = input.address ? normalizeAddress(input.address) : null;
    const existingAddress = textValue(metadata.address) ?? textValue(metadata.google_formatted_address);
    if (inputAddress && existingAddress && addressesLikelyMatch(inputAddress, existingAddress)) {
      warnings.push(`same_address_existing:${venue.id}:${venue.name}`);
      blockingDuplicate = true;
      continue;
    }

    if (input.latitude == null || input.longitude == null) continue;

    const distance = distanceMeters(
      input.latitude,
      input.longitude,
      Number(venue.latitude),
      Number(venue.longitude)
    );
    const score = scoreProviderName(candidateName, venueName);

    if (venueName === candidateName && distance <= radius) {
      warnings.push(`same_name_nearby:${venue.id}:${venue.name}:${Math.round(distance)}m`);
      blockingDuplicate = true;
      continue;
    }

    if (score >= 0.78 && distance <= radius) {
      warnings.push(`similar_name_nearby:${venue.id}:${venue.name}:${Math.round(distance)}m`);
    }
  }

  return { warnings, blockingDuplicate };
}
