export type Recommendation = {
  id: string;
  venueName: string;
  neighborhood: string;
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
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
