/**
 * Normalized Foursquare enrichment data stored per venue.
 *
 * All fields are optional — Foursquare returns different subsets depending on
 * venue type, verification status, and API plan tier. Consumers must handle
 * missing values gracefully.
 */
export interface FoursquareEnrichmentData {
  fsqId: string;
  matchedName: string;
  /** Foursquare category labels (e.g. ["Nightclub", "Bar"]). */
  categories: string[];
  /** Human-readable hours string (e.g. "Mon-Sat 10pm–4am"). */
  hoursDisplay?: string;
  /** Whether the venue is currently open per Foursquare's hours data. */
  openNow?: boolean;
  /**
   * Normalized popularity score 0–1. Available on standard+ plan.
   * When present, used as a conservative soft signal during sparse-data windows.
   */
  popularity?: number;
  /** Rating 0–10. */
  rating?: number;
  /** Total number of Foursquare ratings. */
  totalRatings?: number;
  /** Total number of Foursquare tips/reviews. */
  totalTips?: number;
  /** Venue website URL if present. */
  website?: string;
  /** Foursquare-resolved address. */
  address?: string;
  /** Foursquare-resolved neighborhood label. */
  neighborhood?: string;
  /** True when the venue is officially verified on Foursquare. */
  verified?: boolean;
}

export interface VenueEnrichment {
  id: string;
  venueId: string;
  source: string;
  externalId: string;
  enrichmentData: FoursquareEnrichmentData;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVenueEnrichmentInput {
  venueId: string;
  source: string;
  externalId: string;
  enrichmentData: FoursquareEnrichmentData;
  fetchedAt?: string;
}
