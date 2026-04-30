import {
  auditBackendRuntime,
  auditPublicUrls
} from "../services/v1/testflightReadinessService";

function has(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

const backend = auditBackendRuntime({
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrlSet: has("DATABASE_URL"),
  supabaseProjectUrlSet: has("SUPABASE_PROJECT_URL"),
  supabaseJwksUrlSet: has("SUPABASE_JWKS_URL"),
  supabaseServiceRoleSet: has("SUPABASE_SERVICE_ROLE_KEY"),
  notificationDeliveryMode: process.env.NOTIFICATION_DELIVERY_MODE === "apns" ? "apns" : "mock",
  apnsConfigured:
    has("APNS_TEAM_ID") &&
    has("APNS_KEY_ID") &&
    has("APNS_PRIVATE_KEY") &&
    has("APNS_BUNDLE_ID")
});

const urls = auditPublicUrls({
  privacyUrl: process.env.NIGHTLOOP_PRIVACY_URL ?? "",
  termsUrl: process.env.NIGHTLOOP_TERMS_URL ?? "",
  supportUrl: process.env.NIGHTLOOP_SUPPORT_URL ?? "",
  deleteAccountUrl: process.env.NIGHTLOOP_DELETE_ACCOUNT_URL ?? "",
  accessibilityUrl: process.env.NIGHTLOOP_ACCESSIBILITY_URL ?? ""
});

const failures = [...backend.failures, ...urls.failures];
if (failures.length > 0) {
  console.error("TestFlight readiness failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("TestFlight backend/public URL readiness passed.");
