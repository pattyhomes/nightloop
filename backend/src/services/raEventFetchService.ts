/**
 * Resident Advisor (RA) event fetch service.
 *
 * Fetches upcoming events for the San Francisco/Oakland area (RA area ID 218)
 * from RA's public GraphQL API, maps events to known Nightloop venue IDs by
 * normalizing venue names, and ingests matched events as `event_report` signals
 * via the existing signalIngestionService pipeline.
 *
 * No API key required — RA's GraphQL endpoint is publicly accessible for basic
 * event listing queries.
 *
 * Signal semantics:
 *   signal_type : "event_report" — contributes to `activity` in snapshot scoring
 *   signal_strength : 70 — event is scheduled (moderate-strong activity indicator)
 *   confidence : 0.75 for strong name match, 0.55 for partial match
 *   source : "scraper"
 *   observed_at : event date at 21:00 local SF time (PDT: UTC-7)
 */

import { MOCK_VENUES } from "../data/mockVenues";
import { ingestSignal, type IngestSignalResult } from "./signalIngestionService";

// ─── RA GraphQL config ─────────────────────────────────────────────────────

const RA_GRAPHQL_URL = "https://ra.co/graphql";
const RA_SF_AREA_ID = 218; // RA area: "San Francisco/Oakland"

/**
 * Number of days ahead to look for events.
 * Keeps signal freshness reasonable for a nightlife recommendation app.
 */
const FETCH_WINDOW_DAYS = 7;
const MAX_EVENTS = 20;

// ─── RA response types ─────────────────────────────────────────────────────

interface RAVenue {
  id: string;
  name: string;
  contentUrl: string;
}

interface RAEvent {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DDT00:00:00.000"
  venue: RAVenue;
}

interface RAEventListing {
  event: RAEvent;
}

interface RAEventListingsResponse {
  data?: {
    eventListings?: {
      data: RAEventListing[];
    };
  };
  errors?: Array<{ message: string }>;
}

// ─── Venue name matching ───────────────────────────────────────────────────

/**
 * Normalizes a venue name for fuzzy matching:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Further collapses a normalized name to a run of alphanumeric characters only.
 * Used as a third matching tier for names that differ only in spacing/hyphens
 * (e.g. "Makeout Room" vs "Make-Out Room" both collapse to "makeoutroom").
 */
function stripSpaces(normalized: string): string {
  return normalized.replace(/\s+/g, "");
}

// Pre-build a normalized lookup from mock venue IDs for efficiency.
const NORMALIZED_MOCK_VENUES = MOCK_VENUES.map((venue) => {
  const n = normalizeName(venue.name);
  return { id: venue.id, name: venue.name, normalized: n, stripped: stripSpaces(n) };
});

interface MatchResult {
  venueId: string;
  venueName: string;
  confidence: number;
  matchType: "exact" | "partial" | "stripped";
}

/**
 * Matches an RA venue name to a Nightloop mock venue ID using normalized string
 * comparison. Returns null when no usable match is found.
 *
 * Match tiers:
 *   "exact"    — normalized names are identical                    → confidence 0.80
 *   "partial"  — one normalized name contains the other           → confidence 0.60
 *   "stripped" — names are equal after removing all spaces        → confidence 0.65
 *               (handles "Make-Out Room" vs "Makeout Room" etc.)
 */
function matchVenueId(raVenueName: string): MatchResult | null {
  const normalized = normalizeName(raVenueName);
  const stripped = stripSpaces(normalized);

  // Tier 1: exact match on normalized names
  for (const mock of NORMALIZED_MOCK_VENUES) {
    if (mock.normalized === normalized) {
      return { venueId: mock.id, venueName: mock.name, confidence: 0.8, matchType: "exact" };
    }
  }

  // Tier 2: stripped equality (handles hyphens-as-spaces vs no-separator variants)
  for (const mock of NORMALIZED_MOCK_VENUES) {
    if (mock.stripped === stripped && stripped.length >= 4) {
      return { venueId: mock.id, venueName: mock.name, confidence: 0.65, matchType: "stripped" };
    }
  }

  // Tier 3: word-level containment — all meaningful words (≥3 chars) of the shorter
  // name appear as whole tokens in the longer name's word list.
  // Minimum 2 qualifying words required to avoid false positives like "r bar" ⊆ "cigar bar grill".
  const raWords = new Set(normalized.split(/\s+/).filter((w) => w.length >= 2));
  for (const mock of NORMALIZED_MOCK_VENUES) {
    const mockWords = mock.normalized.split(/\s+/).filter((w) => w.length >= 2);
    const shorterWords = mockWords.length <= raWords.size ? mockWords : [...raWords];
    const longerWords = mockWords.length <= raWords.size ? raWords : new Set(mockWords);
    if (shorterWords.length >= 2 && shorterWords.every((w) => longerWords.has(w))) {
      return { venueId: mock.id, venueName: mock.name, confidence: 0.6, matchType: "partial" };
    }
  }

  return null;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

/**
 * Converts an RA event date string (e.g. "2026-03-16T00:00:00.000") to an ISO
 * timestamp at 21:00 SF local time (PDT = UTC-7 from mid-March through early
 * November; PST = UTC-8 from early November through mid-March).
 *
 * Using 21:00 as a conservative "event starting" time for nightlife events.
 * This is a best-effort heuristic since RA doesn't expose start time in this
 * endpoint's response.
 *
 * Implementation note: Date.UTC handles hour overflow automatically
 * (e.g. hour=28 on March 16 → 04:00 UTC on March 17), so no manual clamping
 * is needed.
 */
function toObservedAt(raDate: string): string {
  const datePart = raDate.slice(0, 10); // "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-indexed
  const day = Number(dayStr);

  if (!year || !month || !day) return new Date().toISOString();

  // Rough DST rule for SF: PDT (UTC-7) from ~March through October; PST (UTC-8) otherwise.
  const offsetHours = month >= 3 && month <= 10 ? 7 : 8;

  // JavaScript Date.UTC handles hour > 23 by rolling over to the next day.
  return new Date(Date.UTC(year, month - 1, day, 21 + offsetHours)).toISOString();
}

// ─── RA fetch ──────────────────────────────────────────────────────────────

/**
 * Fetches SF/Oakland events from RA for the next FETCH_WINDOW_DAYS days.
 */
async function fetchSFEventsFromRA(): Promise<RAEvent[]> {
  const now = new Date();
  const later = new Date(now.getTime() + FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const gte = now.toISOString().slice(0, 10);
  const lte = later.toISOString().slice(0, 10);

  const query = `
    {
      eventListings(
        filters: {
          areas: { eq: ${RA_SF_AREA_ID} }
          listingDate: { gte: "${gte}", lte: "${lte}" }
        }
        pageSize: ${MAX_EVENTS}
      ) {
        data {
          event {
            id
            title
            date
            venue {
              id
              name
              contentUrl
            }
          }
        }
      }
    }
  `.trim();

  const response = await fetch(RA_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://ra.co/",
      "User-Agent": "Nightloop/1.0 (nightlife-recommendation-app)"
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`RA GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as RAEventListingsResponse;

  if (body.errors && body.errors.length > 0) {
    const messages = body.errors.map((e) => e.message).join("; ");
    throw new Error(`RA GraphQL errors: ${messages}`);
  }

  return body.data?.eventListings?.data.map((listing) => listing.event) ?? [];
}

// ─── Public interface ──────────────────────────────────────────────────────

export interface RAIngestionSummary {
  fetchedEvents: number;
  matchedEvents: number;
  unmatchedVenues: string[];
  ingested: IngestSignalResult[];
  errors: Array<{ eventTitle: string; error: string }>;
}

/**
 * Fetches upcoming SF events from Resident Advisor, maps them to known Nightloop
 * venues, and ingests matched events as `event_report` signals.
 *
 * Unmatched venue names are returned in the summary for observability — they
 * represent real SF venues not yet in Nightloop's mock data.
 */
export async function fetchAndIngestRAEvents(): Promise<RAIngestionSummary> {
  const events = await fetchSFEventsFromRA();

  const ingested: IngestSignalResult[] = [];
  const unmatchedVenues: string[] = [];
  const errors: RAIngestionSummary["errors"] = [];

  for (const event of events) {
    const match = matchVenueId(event.venue.name);

    if (!match) {
      if (!unmatchedVenues.includes(event.venue.name)) {
        unmatchedVenues.push(event.venue.name);
      }
      continue;
    }

    try {
      const result = await ingestSignal({
        venue_id: match.venueId,
        signal_type: "event_report",
        signal_strength: 70,
        source: "scraper",
        confidence: match.confidence,
        observed_at: toObservedAt(event.date),
        metadata: {
          eventName: event.title,
          raEventId: event.id,
          raVenueName: event.venue.name,
          matchType: match.matchType,
          sourceUrl: `https://ra.co${event.venue.contentUrl}`,
          fetchedAt: new Date().toISOString()
        }
      });

      ingested.push(result);
    } catch (error) {
      errors.push({
        eventTitle: event.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    fetchedEvents: events.length,
    matchedEvents: ingested.length,
    unmatchedVenues,
    ingested,
    errors
  };
}
