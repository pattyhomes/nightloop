import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", async (_req, res, next) => {
  try {
    const data = await getRecommendations();

    res.json({
      generatedAt: data.generatedAt,
      recommendations: data.recommendations.map((rec) => ({
        venueName: rec.venueName,
        neighborhood: rec.neighborhood,
        score: rec.score,
        why: rec.why,
        factors: rec.factors,
        generatedAt: rec.generatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default recommendationsRouter;
