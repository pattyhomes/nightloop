import { Router } from "express";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", (_req, res) => {
  res.json({
    meta: {
      source: "starter-scaffold",
      generatedAt: new Date().toISOString(),
      count: 2
    },
    recommendations: [
      {
        id: "rec-1",
        title: "Validate ingestion pipeline inputs",
        score: 0.78
      },
      {
        id: "rec-2",
        title: "Tune scoring thresholds",
        score: 0.64
      }
    ]
  });
});

export default recommendationsRouter;
