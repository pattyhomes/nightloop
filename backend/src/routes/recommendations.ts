import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", (_req, res) => {
  const recommendations = getRecommendations();

  res.json({
    meta: {
      source: "mock-scoring-v1",
      generatedAt: recommendations[0]?.generatedAt ?? new Date().toISOString(),
      count: recommendations.length
    },
    recommendations
  });
});

export default recommendationsRouter;
