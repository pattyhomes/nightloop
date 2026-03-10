import express from "express";
import { loadConfig } from "./lib/config";
import healthRouter from "./routes/health";
import recommendationsRouter from "./routes/recommendations";

const app = express();
const config = loadConfig();

app.use(express.json());

// Service health endpoint
app.use("/", healthRouter);

// API routes
app.use("/api", recommendationsRouter);

app.listen(config.port, () => {
  console.log(`nightloop-backend listening on port ${config.port}`);
  console.log(`health: http://localhost:${config.port}/health`);
  console.log(`recommendations: http://localhost:${config.port}/api/recommendations`);
});
