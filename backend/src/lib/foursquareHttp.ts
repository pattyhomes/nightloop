export const FOURSQUARE_PLACES_API_BASE_URL = "https://places-api.foursquare.com";
export const FOURSQUARE_PLACES_API_VERSION = "2025-06-17";

export const FOURSQUARE_PRO_FIELDS = [
  "fsq_place_id",
  "name",
  "location",
  "tel",
  "website",
  "social_media",
  "categories",
  "related_places"
] as const;

// PREMIUM - requires credits: "hours", "hours_popular", "rating", "popularity", "price", "closed_bucket", "stats".
export const FOURSQUARE_PRO_FIELD_MASK = FOURSQUARE_PRO_FIELDS.join(",");

export function foursquareHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION
  };
}
