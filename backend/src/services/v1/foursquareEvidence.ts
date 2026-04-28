import { FOURSQUARE_PRO_FIELD_MASK } from "../../lib/foursquareHttp";

export const FOURSQUARE_EVIDENCE_SEARCH_FIELDS = "fsq_place_id,name,location,categories";
export const FOURSQUARE_EVIDENCE_DETAIL_FIELDS = FOURSQUARE_PRO_FIELD_MASK;

export type FoursquareEvidencePlace = {
  fsq_id?: string;
  fsq_place_id?: string;
  name?: string;
  location?: Record<string, unknown>;
  tel?: string;
  website?: string;
  social_media?: {
    instagram?: string;
    twitter?: string;
  };
  categories?: Array<{ id?: number; name?: string }>;
  related_places?: unknown;
  verified?: boolean;
  geocodes?: {
    main?: {
      latitude?: number;
      longitude?: number;
    };
  };
};

export type FoursquareEvidenceScoreInput = {
  venueName: string;
  venueLatitude: number;
  venueLongitude: number;
  place: FoursquareEvidencePlace;
};

export type FoursquareEvidenceScore = {
  score: number;
  distance_meters: number | null;
  match_type: "exact" | "stripped" | "partial" | "weak";
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function foursquarePlaceId(place: FoursquareEvidencePlace): string | null {
  return textValue(place.fsq_place_id) ?? textValue(place.fsq_id);
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const lat1 = toRad(left.latitude);
  const lat2 = toRad(right.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function geocode(place: FoursquareEvidencePlace): { latitude: number; longitude: number } | null {
  const latitude = Number(place.geocodes?.main?.latitude);
  const longitude = Number(place.geocodes?.main?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
  return null;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string" && value.trim().length === 0) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

export function scoreFoursquareEvidenceCandidate(input: FoursquareEvidenceScoreInput): FoursquareEvidenceScore {
  const venueName = normalizeName(input.venueName);
  const fsqName = normalizeName(input.place.name ?? "");
  let nameScore = 0;
  let matchType: FoursquareEvidenceScore["match_type"] = "weak";
  if (venueName && fsqName && venueName === fsqName) {
    nameScore = 0.9;
    matchType = "exact";
  } else if (venueName && fsqName && venueName.replace(/\s/g, "") === fsqName.replace(/\s/g, "")) {
    nameScore = 0.78;
    matchType = "stripped";
  } else if (venueName && fsqName && (venueName.includes(fsqName) || fsqName.includes(venueName))) {
    nameScore = 0.62;
    matchType = "partial";
  }

  const placeGeocode = geocode(input.place);
  const distance = placeGeocode
    ? distanceMeters(
        { latitude: input.venueLatitude, longitude: input.venueLongitude },
        placeGeocode
      )
    : null;
  const distanceBoost = distance == null
    ? 0
    : distance <= 80
      ? 0.08
      : distance <= 160
        ? 0.04
        : distance <= 300
          ? 0
          : -0.18;

  return {
    score: Math.max(0, Math.min(0.98, nameScore + distanceBoost)),
    distance_meters: distance == null ? null : Math.round(distance),
    match_type: matchType
  };
}

export function buildFoursquareEvidencePatch(
  place: FoursquareEvidencePlace,
  checkedAt = new Date()
): Record<string, unknown> {
  const categoryNames = (place.categories ?? [])
    .map((category) => textValue(category.name))
    .filter((name): name is string => Boolean(name));
  const website = textValue(place.website);
  const verified = typeof place.verified === "boolean" ? place.verified : undefined;
  const relatedPlacesPresent = typeof place.related_places === "object" && place.related_places !== null;

  return compactRecord({
    foursquare_id: foursquarePlaceId(place),
    foursquare_name: textValue(place.name),
    foursquare_category: categoryNames[0],
    foursquare_category_names: categoryNames,
    foursquare_verified: verified,
    foursquare_phone: textValue(place.tel),
    foursquare_website: website,
    website,
    foursquare_instagram: textValue(place.social_media?.instagram),
    foursquare_twitter: textValue(place.social_media?.twitter),
    foursquare_related_places_present: relatedPlacesPresent,
    foursquare_evidence_checked_at: checkedAt.toISOString()
  });
}
