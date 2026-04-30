import fs from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

export type AppConfig = {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  supabaseProjectUrl: string;
  supabaseJwtIssuer: string;
  supabaseJwksUrl: string;
  supabaseJwtAudience: string;
  supabaseServiceRoleKey?: string;
  corsAllowedOrigins: string[];
  legacyRoutesEnabled: boolean;
  rateLimitWindowMs: number;
  signalWriteLimit: number;
  accountWriteLimit: number;
  foursquareApiKey?: string;
  googlePlacesApiKey?: string;
  reviewerAuthUserId?: string;
  apnsTeamId?: string;
  apnsKeyId?: string;
  apnsPrivateKey?: string;
  apnsBundleId?: string;
  apnsEnvironment: "sandbox" | "production";
  notificationDeliveryMode: "mock" | "apns";
};

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_PROJECT_URL: z.string().url(),
  SUPABASE_JWT_ISSUER: z.string().url(),
  SUPABASE_JWKS_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  LEGACY_ROUTES_ENABLED: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  SIGNAL_WRITE_LIMIT: z.coerce.number().int().positive().default(12),
  ACCOUNT_WRITE_LIMIT: z.coerce.number().int().positive().default(30),
  FOURSQUARE_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  REVIEWER_AUTH_USER_ID: z.string().uuid().optional(),
  APNS_TEAM_ID: z.string().min(1).optional(),
  APNS_KEY_ID: z.string().min(1).optional(),
  APNS_PRIVATE_KEY: z.string().min(1).optional(),
  APNS_BUNDLE_ID: z.string().min(1).optional(),
  APNS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  NOTIFICATION_DELIVERY_MODE: z.enum(["mock", "apns"]).default("mock")
});

let envLoaded = false;

function loadEnvFiles(): void {
  if (envLoaded) return;

  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "backend/.env"),
    path.resolve(process.cwd(), "../backend/.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false, quiet: true });
    }
  }

  envLoaded = true;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadConfig(): AppConfig {
  loadEnvFiles();

  const parsed = EnvSchema.parse(process.env);
  const legacyRoutesDefault = parsed.NODE_ENV !== "production";

  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    supabaseProjectUrl: parsed.SUPABASE_PROJECT_URL,
    supabaseJwtIssuer: parsed.SUPABASE_JWT_ISSUER,
    supabaseJwksUrl: parsed.SUPABASE_JWKS_URL,
    supabaseJwtAudience: parsed.SUPABASE_JWT_AUDIENCE,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    corsAllowedOrigins: parseOrigins(parsed.CORS_ALLOWED_ORIGINS),
    legacyRoutesEnabled: parseBoolean(parsed.LEGACY_ROUTES_ENABLED, legacyRoutesDefault),
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    signalWriteLimit: parsed.SIGNAL_WRITE_LIMIT,
    accountWriteLimit: parsed.ACCOUNT_WRITE_LIMIT,
    foursquareApiKey: parsed.FOURSQUARE_API_KEY,
    googlePlacesApiKey: parsed.GOOGLE_PLACES_API_KEY,
    reviewerAuthUserId: parsed.REVIEWER_AUTH_USER_ID,
    apnsTeamId: parsed.APNS_TEAM_ID,
    apnsKeyId: parsed.APNS_KEY_ID,
    apnsPrivateKey: parsed.APNS_PRIVATE_KEY,
    apnsBundleId: parsed.APNS_BUNDLE_ID,
    apnsEnvironment: parsed.APNS_ENVIRONMENT,
    notificationDeliveryMode: parsed.NOTIFICATION_DELIVERY_MODE
  };
}
