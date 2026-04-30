import fs from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";
import {
  auditBackendRuntime,
  auditNotificationDeliveryModeEnv,
  auditPublicUrls
} from "../services/v1/testflightReadinessService";

function loadEnvFiles(): void {
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
}

function has(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

loadEnvFiles();

const notificationDeliveryMode = process.env.NOTIFICATION_DELIVERY_MODE;
const notificationDeliveryModeEnv = auditNotificationDeliveryModeEnv({
  notificationDeliveryMode
});

const backend = auditBackendRuntime({
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrlSet: has("DATABASE_URL"),
  supabaseProjectUrlSet: has("SUPABASE_PROJECT_URL"),
  supabaseJwksUrlSet: has("SUPABASE_JWKS_URL"),
  supabaseServiceRoleSet: has("SUPABASE_SERVICE_ROLE_KEY"),
  notificationDeliveryMode: notificationDeliveryModeEnv.mode,
  apnsConfigured:
    has("APNS_TEAM_ID") &&
    has("APNS_KEY_ID") &&
    has("APNS_PRIVATE_KEY") &&
    has("APNS_BUNDLE_ID")
});

const urls = auditPublicUrls({
  privacyUrl: has("NIGHTLOOP_PRIVACY_URL") ? "set" : "",
  termsUrl: has("NIGHTLOOP_TERMS_URL") ? "set" : "",
  supportUrl: has("NIGHTLOOP_SUPPORT_URL") ? "set" : "",
  deleteAccountUrl: has("NIGHTLOOP_DELETE_ACCOUNT_URL") ? "set" : "",
  accessibilityUrl: has("NIGHTLOOP_ACCESSIBILITY_URL") ? "set" : ""
});

const failures = [...notificationDeliveryModeEnv.failures, ...backend.failures, ...urls.failures];
if (failures.length > 0) {
  console.error("TestFlight readiness failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("TestFlight backend/public URL readiness passed.");
