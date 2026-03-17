export type RecentActivity = {
  signalType: string;
  timestamp: string;
  minutesAgo: number;
};

export type EnergyStatus = "High Energy" | "Steady Energy" | "Low-Key Energy";
export type EntryStatus = "Easy Entry" | "Manageable Line" | "Long Line";
export type TrendStatus = "Rising" | "Steady" | "Cooling";

export type Recommendation = {
  id: string;
  venueId: string;
  venueName: string;
  neighborhood: string;
  /** Venue category: "club", "bar", "lounge", or "live_music" */
  category: string;
  score: number;
  why: string;
  factors: string[];
  generatedAt: string;
  lastSignalType: string | null;
  signalCount: number;
  recentSignalCount: number;
  pulseLevel: 1 | 2 | 3;
  confidenceLabel: "Low" | "Medium" | "High";
  sourceSummary: string;
  userSignalCount: number;
  platformSignalCount: number;
  lastUpdatedAgoMinutes: number;
  energyStatus: EnergyStatus;
  entryStatus: EntryStatus;
  trendStatus: TrendStatus;
  recentActivity: RecentActivity[];
  latitude: number;
  longitude: number;
  /**
   * Time-of-week context note, present only when the baseline signal is actively
   * contributing to the score (sparse live data + active time window).
   * Absent when live signals dominate or time window has no useful context.
   */
  baselineNote?: string;
  /** Foursquare popularity score 0–1 (present when enrichment data exists). */
  foursquarePopularity?: number;
  /** Human-readable hours from Foursquare (e.g. "Mon-Sat 10pm–4am"). */
  foursquareHours?: string;
  /** Whether the venue is currently open per Foursquare hours data. */
  foursquareOpenNow?: boolean;
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
