/**
 * Foursquare venue enrichment service.
 *
 * Fetches place data from the Foursquare Places API v3 for each known
 * Nightloop venue and stores the results in the `venue_enrichments` table.
 *
 * API used
 * ────────
 *   Base URL : https://api.foursquare.com/v3
 *   Auth     : Authorization: <API_KEY>  (header, no "Bearer" prefix)
 *   Docs     : https://docs.foursquare.com/developer/reference/place-search
 *
 * Environment variable
 * ────────────────────
 *   FOURSQUARE_API_KEY — required when running this service.
 *   Set in backend/.env.local (never commit the real value).
 *   If missing the script exits immediately with a clear error.
 *
 * Match strategy (mirrors RA service)
 * ────────────────────────────────────
 *   1. Search Foursquare by name + coordinates (radius 300 m, limit 5).
 *   2. Score candidates: exact normalized name match > partial containment.
 *   3. Accept the best candidate above the confidence threshold.
 *   4. Fetch full place details for accepted matches.
 *   5. Upsert into venue_enrichments keyed by (venue_id, 'foursquare').
 *
 * This service does NOT affect the live recommendation API — it is a
 * one-off (or scheduled) data enrichment job run from the CLI.
 */

import { MOCK_VENUES } from "../data/mockVenues";
import { upsertVenueEnrichment, resolveVenueIdBySeedId } from "../dataAccess/venueEnrichmentRepository";
import type { FoursquareEnrichmentData } from "../types/venueEnrichment";

// ─── Config ──────────────────────────────────────────────────────────────────

const FSQ_BASE = "https://api.foursquare.com/v3";
const FSQ_SOURCE = "foursquare";

/** Radius in metres used for the name+coordinate search. */
const SEARCH_RADIUS_M = 300;

/** Detail fields requested from the Places API. */
const DETAIL_FIELDS = "name,location,categories,hours,popularity,rating,stats,verified,website";

/** Minimum score to accept a Foursquare candidate as a match. */
const MATCH_THRESHOLD = 0.55;

/** Milliseconds to wait between API calls to respect rate limits. */
const RATE_LIMIT_DELAY_MS = 250;

// ─── Foursquare response types ────────────────────────────────────────────────

interface FsqCategory {
  id: number;
  name: string;
}

interface FsqHours {
  display?: string;
  open_now?: boolean;
}

interface FsqStats {
  total_photos?: number;
  total_ratings?: number;
  total_tips?: number;
}

interface FsqLocation {
  address?: string;
  neighborhood?: string;
  city?: string;
  formatted_address?: string;
}

interface FsqPlace {
  fsq_id: string;
  name: string;
  location?: FsqLocation;
  categories?: FsqCategory[];
  hours?: FsqHours;
  popularity?: number;
  rating?: number;
  stats?: FsqStats;
  website?: string;
  verified?: boolean;
}

interface FsqSearchResponse {
  results?: FsqPlace[];
}

// ─── Name normalization (mirrors RA service) ──────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSpaces(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

// ─── Candidate scoring ────────────────────────────────────────────────────────

interface ScoredCandidate {
  place: FsqPlace;
  score: number;
  matchType: "exact" | "partial" | "stripped";
}

function scoreCandidates(query: string, candidates: FsqPlace[]): ScoredCandidate[] {
  const normQuery = normalizeName(query);
  const strippedQuery = stripSpaces(normQuery);

  return candidates
    .map((place): ScoredCandidate | null => {
      const normPlace = normalizeName(place.name);
      const strippedPlace = stripSpaces(normPlace);

      if (normPlace === normQuery) {
        return { place, score: 0.90, matchType: "exact" };
      }
      if (strippedPlace === strippedQuery) {
        return { place, score: 0.75, matchType: "stripped" };
      }
      if (normPlace.includes(normQuery) || normQuery.includes(normPlace)) {
        return { place, score: 0.60, matchType: "partial" };
      }

      return null;
    })
    .filter((c): c is ScoredCandidate => c !== null)
    .sort((a, b) => b.score - a.score);
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fsqFetch<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FSQ_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`Foursquare API ${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Enrichment data mapping ──────────────────────────────────────────────────

function mapToEnrichmentData(place: FsqPlace): FoursquareEnrichmentData {
  const categories = (place.categories ?? []).map((c) => c.name).filter(Boolean);

  return {
    fsqId: place.fsq_id,
    matchedName: place.name,
    categories,
    hoursDisplay: place.hours?.display,
    openNow: place.hours?.open_now,
    popularity: typeof place.popularity === "number" ? place.popularity : undefined,
    rating: typeof place.rating === "number" ? place.rating : undefined,
    totalRatings: place.stats?.total_ratings,
    totalTips: place.stats?.total_tips,
    website: place.website,
    address: place.location?.address ?? place.location?.formatted_address,
    neighborhood: place.location?.neighborhood,
    verified: place.verified
  };
}

// ─── Public interface ──────────────────────────────────────────────────────────

export interface FoursquareEnrichmentResult {
  venueId: string;
  venueName: string;
  fsqId: string;
  matchType: string;
  score: number;
  openNow?: boolean;
  popularity?: number;
  categories: string[];
  stored: boolean;
}

export interface FoursquareEnrichmentSummary {
  attempted: number;
  matched: number;
  stored: number;
  skipped: number;
  results: FoursquareEnrichmentResult[];
  errors: Array<{ venueName: string; error: string }>;
}

/**
 * Enrich all known Nightloop venues with Foursquare place data.
 *
 * Requires FOURSQUARE_API_KEY in the environment. Exits with a clear message
 * if the key is absent — the web server never calls this function.
 *
 * When DATABASE_URL is set, enrichment data is persisted to `venue_enrichments`.
 * Without DATABASE_URL the function still fetches and returns summary data
 * (useful for dry-run inspection), but persistence will fail gracefully.
 */
export async function enrichAllVenues(apiKey: string): Promise<FoursquareEnrichmentSummary> {
  const summary: FoursquareEnrichmentSummary = {
    attempted: 0,
    matched: 0,
    stored: 0,
    skipped: 0,
    results: [],
    errors: []
  };

  for (const venue of MOCK_VENUES) {
    summary.attempted += 1;

    try {
      // Step 1 — search Foursquare by name + coordinates.
      const searchResponse = await fsqFetch<FsqSearchResponse>("/places/search", apiKey, {
        query: venue.name,
        ll: `${venue.latitude},${venue.longitude}`,
        radius: String(SEARCH_RADIUS_M),
        limit: "5"
      });

      const candidates = searchResponse.results ?? [];
      const scored = scoreCandidates(venue.name, candidates);
      const best = scored[0];

      if (!best || best.score < MATCH_THRESHOLD) {
        summary.skipped += 1;
        continue;
      }

      summary.matched += 1;

      // Step 2 — fetch full place details.
      await sleep(RATE_LIMIT_DELAY_MS);
      const detail = await fsqFetch<FsqPlace>(`/places/${best.place.fsq_id}`, apiKey, {
        fields: DETAIL_FIELDS
      });

      const enrichmentData = mapToEnrichmentData(detail);

      // Step 3 — resolve the DB UUID for this mock venue and persist.
      let stored = false;
      try {
        const dbVenueId = await resolveVenueIdBySeedId(venue.id);
        if (dbVenueId) {
          await upsertVenueEnrichment({
            venueId: dbVenueId,
            source: FSQ_SOURCE,
            externalId: detail.fsq_id,
            enrichmentData
          });
          stored = true;
          summary.stored += 1;
        }
        // If no DB venue found, still log the result but mark as not stored.
      } catch (persistError) {
        // Non-fatal: log but continue. Enrichment data is still returned in summary.
        console.warn(
          `[fsq-enrich] Persist failed for "${venue.name}": ` +
          (persistError instanceof Error ? persistError.message : String(persistError))
        );
      }

      summary.results.push({
        venueId: venue.id,
        venueName: venue.name,
        fsqId: detail.fsq_id,
        matchType: best.matchType,
        score: best.score,
        openNow: enrichmentData.openNow,
        popularity: enrichmentData.popularity,
        categories: enrichmentData.categories,
        stored
      });
    } catch (error) {
      summary.errors.push({
        venueName: venue.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Respect Foursquare rate limits between venue lookups.
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return summary;
}
