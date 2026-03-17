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
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
