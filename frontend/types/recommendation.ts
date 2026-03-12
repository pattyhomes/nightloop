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
  sourceSummary: string;
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
