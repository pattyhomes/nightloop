import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import type { AppConfig } from "./lib/config";
import { loadConfig } from "./lib/config";
import { errorHandler } from "./lib/apiError";
import { SupabaseAuthAdminClient, type AuthAdminClient } from "./lib/authAdmin";
import healthRouter from "./routes/health";
import recommendationsRouter from "./routes/recommendations";
import signalsRouter from "./routes/signals";
import { createV1Router } from "./routes/v1";

export type CreateAppOptions = {
  config?: AppConfig;
  authAdmin?: AuthAdminClient;
};

export type { AuthAdminClient };

function corsMiddleware(config: AppConfig) {
  const allowed = new Set(config.corsAllowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && allowed.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const authAdmin = options.authAdmin ?? new SupabaseAuthAdminClient(config);
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "250kb" }));
  app.use(corsMiddleware(config));

  app.use("/", healthRouter);
  app.use("/api/v1", createV1Router(config, authAdmin));

  if (config.legacyRoutesEnabled) {
    app.use("/api", recommendationsRouter);
    app.use("/api", signalsRouter);
  }

  app.use(errorHandler);

  return app;
}
