export type RecommendationFactor = {
  factor: "crowdLevel" | "lineLength" | "socialActivity" | "popularity" | "recency" | "confidence";
  label: string;
  contribution: number;
  detail: string;
};

export type Recommendation = {
  id: string;
  venueName: string;
  neighborhood: string;
  score: number;
  topFactors: RecommendationFactor[];
  explanation: string;
  generatedAt: string;
};

export type RecommendationsResponse = {
  generatedAt: string;
  recommendations: Recommendation[];
};
