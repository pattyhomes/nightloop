import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", async (_req, res, next) => {
  try {
    const data = await getRecommendations();

    res.json({
      generatedAt: data.generatedAt,
      recommendations: data.recommendations.map((rec) => ({
        id: rec.id,
        venueName: rec.venueName,
        neighborhood: rec.neighborhood,
        score: rec.score,
        why: rec.why,
        factors: rec.factors,
        generatedAt: rec.generatedAt,
        lastSignalType: rec.lastSignalType,
        signalCount: rec.signalCount,
        recentSignalCount: rec.recentSignalCount,
        pulseLevel: rec.pulseLevel,
        confidenceLabel: rec.confidenceLabel,
        sourceSummary: rec.sourceSummary,
        userSignalCount: rec.userSignalCount,
        platformSignalCount: rec.platformSignalCount,
        lastUpdatedAgoMinutes: rec.lastUpdatedAgoMinutes
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default recommendationsRouter;
