export const FOURSQUARE_PLACES_API_BASE_URL = "https://places-api.foursquare.com";
export const FOURSQUARE_PLACES_API_VERSION = "2025-06-17";

export function foursquareHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Places-Api-Version": FOURSQUARE_PLACES_API_VERSION
  };
}
