/**
 * Normalized Foursquare enrichment data stored per venue.
 *
 * All fields are optional. Current enrichment requests only Pro-tier Places
 * fields; paid Premium fields are intentionally left unset until billing is
 * enabled.
 */
export interface FoursquareEnrichmentData {
  fsqId: string;
  matchedName: string;
  /** Foursquare category labels (e.g. ["Nightclub", "Bar"]). */
  categories: string[];
  /** Human-readable hours string. Premium - requires credits; currently not requested. */
  hoursDisplay?: string;
  /** Whether the venue is currently open per Foursquare's hours data. Premium - requires credits; currently not requested. */
  openNow?: boolean;
  /**
   * Normalized popularity score 0-1. Premium - requires credits; currently not requested.
   * When present, used as a conservative soft signal during sparse-data windows.
   */
  popularity?: number;
  /** Rating 0-10. Premium - requires credits; currently not requested. */
  rating?: number;
  /** Total number of Foursquare ratings. Premium - requires credits; currently not requested. */
  totalRatings?: number;
  /** Total number of Foursquare tips/reviews. Premium - requires credits; currently not requested. */
  totalTips?: number;
  /** Venue phone number if present. */
  phone?: string;
  /** Instagram handle if present. */
  instagram?: string;
  /** Twitter/X handle if present. */
  twitter?: string;
  /** Related child venues from Foursquare, stored as provider evidence only. */
  relatedPlaces?: unknown;
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
