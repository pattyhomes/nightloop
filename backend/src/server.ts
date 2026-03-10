import express from "express";
import { loadConfig } from "./lib/config";
import healthRouter from "./routes/health";
import recommendationsRouter from "./routes/recommendations";

const app = express();
const config = loadConfig();

app.use(express.json());
app.use(healthRouter);
app.use(recommendationsRouter);

app.listen(config.port, () => {
  console.log(`nightloop-backend listening on port ${config.port}`);
});
