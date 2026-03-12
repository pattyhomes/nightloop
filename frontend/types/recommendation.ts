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
  pulseLevel: "low" | "medium" | "high";
  confidenceLabel: "Low confidence" | "Medium confidence" | "High confidence";
  sourceSummary: string;
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
