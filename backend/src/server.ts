import express from "express";
import { loadConfig } from "./lib/config";
import healthRouter from "./routes/health";
import recommendationsRouter from "./routes/recommendations";
import signalsRouter from "./routes/signals";

const app = express();
const config = loadConfig();

app.use(express.json());

// MVP local-dev CORS: allow frontend on localhost:3000 to call backend APIs.
app.use((req, res, next) => {
  const localFrontendOrigin = "http://localhost:3000";

  if (req.headers.origin === localFrontendOrigin) {
    res.header("Access-Control-Allow-Origin", localFrontendOrigin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Service health endpoint
app.use("/", healthRouter);

// API routes
app.use("/api", recommendationsRouter);
app.use("/api", signalsRouter);

app.listen(config.port, () => {
  console.log(`nightloop-backend listening on port ${config.port}`);
  console.log(`health: http://localhost:${config.port}/health`);
  console.log(`recommendations: http://localhost:${config.port}/api/recommendations`);
  console.log(`signals: POST http://localhost:${config.port}/api/signals`);
});
