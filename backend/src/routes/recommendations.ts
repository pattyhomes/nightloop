import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", (_req, res) => {
  const data = getRecommendations();

  res.json({
    generatedAt: data.generatedAt,
    recommendations: data.recommendations.map((rec) => ({
      id: rec.id,
      venueName: rec.venueName,
      neighborhood: rec.neighborhood,
      score: rec.score,
      why: rec.why,
      factors: rec.factors.slice(0, 3),
      generatedAt: rec.generatedAt
    }))
  });
});

export default recommendationsRouter;
