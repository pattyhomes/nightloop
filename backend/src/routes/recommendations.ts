import { Router } from "express";
import { getRecommendations } from "../services/getRecommendations";

const recommendationsRouter = Router();

recommendationsRouter.get("/recommendations", (_req, res) => {
  res.json(getRecommendations());
});

export default recommendationsRouter;
