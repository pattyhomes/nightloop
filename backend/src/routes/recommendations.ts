import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", (_req, res) => {
  const payload = getRecommendations();
  res.json(payload);
});

export default recommendationsRouter;
