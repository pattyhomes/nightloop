type AuditResult = {
  ok: boolean;
  failures: string[];
};

export type IosReleaseConfigAuditInput = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  appleAuthEnabled: boolean;
  phoneAuthEnabled: boolean;
  googleMapsIosApiKey: string;
  reviewerDemoEnabled: boolean;
};

export type BackendRuntimeAuditInput = {
  nodeEnv: string;
  databaseUrlSet: boolean;
  supabaseProjectUrlSet: boolean;
  supabaseJwksUrlSet: boolean;
  supabaseServiceRoleSet: boolean;
  notificationDeliveryMode: "mock" | "apns";
  apnsConfigured: boolean;
};

export type PublicUrlAuditInput = {
  privacyUrl: string;
  termsUrl: string;
  supportUrl: string;
  deleteAccountUrl: string;
  accessibilityUrl: string;
};

export type NotificationDeliveryModeEnvAuditInput = {
  notificationDeliveryMode: string | undefined;
};

function result(failures: string[]): AuditResult {
  return { ok: failures.length === 0, failures };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hasValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.includes("$(") && !trimmed.toLowerCase().includes("paste_");
}

export function auditIosReleaseConfig(input: IosReleaseConfigAuditInput): AuditResult {
  const failures: string[] = [];
  if (!isHttpsUrl(input.apiBaseUrl)) {
    failures.push("Release API_BASE_URL must be HTTPS and must not use localhost.");
  }
  if (!isHttpsUrl(input.supabaseUrl)) {
    failures.push("Release SUPABASE_URL must be HTTPS.");
  }
  if (!hasValue(input.supabasePublishableKey)) {
    failures.push("Release SUPABASE_PUBLISHABLE_KEY must be set.");
  }
  if (!input.appleAuthEnabled) {
    failures.push("Release Sign in with Apple must be enabled for TestFlight.");
  }
  if (input.phoneAuthEnabled) {
    failures.push("Release phone auth must stay disabled until SMS is deliberately configured.");
  }
  if (!hasValue(input.googleMapsIosApiKey)) {
    failures.push("Release GOOGLE_MAPS_IOS_API_KEY must be set.");
  }
  if (!input.reviewerDemoEnabled) {
    failures.push("Reviewer demo access must be enabled for the first external TestFlight build.");
  }
  return result(failures);
}

export function auditBackendRuntime(input: BackendRuntimeAuditInput): AuditResult {
  const failures: string[] = [];
  if (input.nodeEnv !== "production") {
    failures.push("Railway staging backend must run with NODE_ENV=production.");
  }
  if (!input.databaseUrlSet) failures.push("DATABASE_URL is required.");
  if (!input.supabaseProjectUrlSet) failures.push("SUPABASE_PROJECT_URL is required.");
  if (!input.supabaseJwksUrlSet) failures.push("SUPABASE_JWKS_URL is required.");
  if (!input.supabaseServiceRoleSet) failures.push("SUPABASE_SERVICE_ROLE_KEY is required server-side.");
  if (input.notificationDeliveryMode === "apns" && !input.apnsConfigured) {
    failures.push("APNs delivery mode requires APNs credentials.");
  }
  return result(failures);
}

export function auditNotificationDeliveryModeEnv(input: NotificationDeliveryModeEnvAuditInput): AuditResult {
  const failures: string[] = [];
  if ((input.notificationDeliveryMode ?? "").trim().length === 0) {
    failures.push("NOTIFICATION_DELIVERY_MODE is required.");
  }
  return result(failures);
}

export function auditPublicUrls(input: PublicUrlAuditInput): AuditResult {
  const checks: Array<[string, string]> = [
    ["Privacy URL", input.privacyUrl],
    ["Terms URL", input.termsUrl],
    ["Support URL", input.supportUrl],
    ["Delete Account URL", input.deleteAccountUrl],
    ["Accessibility URL", input.accessibilityUrl]
  ];
  return result(checks.filter(([, value]) => value.trim().length === 0).map(([label]) => `${label} is required.`));
}
