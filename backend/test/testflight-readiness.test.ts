import { describe, expect, it } from "vitest";
import {
  auditBackendRuntime,
  auditIosReleaseConfig,
  auditPublicUrls
} from "../src/services/v1/testflightReadinessService";

describe("TestFlight readiness audit", () => {
  it("rejects localhost and disabled Apple auth in Release iOS config", () => {
    const result = auditIosReleaseConfig({
      apiBaseUrl: "http://127.0.0.1:4000/api/v1",
      supabaseUrl: "https://staging.supabase.co",
      supabasePublishableKey: "sb_publishable_staging",
      appleAuthEnabled: false,
      phoneAuthEnabled: false,
      googleMapsIosApiKey: "ios-key",
      reviewerDemoEnabled: true
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Release API_BASE_URL must be HTTPS and must not use localhost.");
    expect(result.failures).toContain("Release Sign in with Apple must be enabled for TestFlight.");
  });

  it("accepts staging HTTPS release config with Apple auth and no phone auth", () => {
    const result = auditIosReleaseConfig({
      apiBaseUrl: "https://nightloop-staging.up.railway.app/api/v1",
      supabaseUrl: "https://staging-project.supabase.co",
      supabasePublishableKey: "sb_publishable_staging",
      appleAuthEnabled: true,
      phoneAuthEnabled: false,
      googleMapsIosApiKey: "ios-key",
      reviewerDemoEnabled: true
    });

    expect(result).toEqual({ ok: true, failures: [] });
  });

  it("rejects production runtime without required staging backend values", () => {
    const result = auditBackendRuntime({
      nodeEnv: "production",
      databaseUrlSet: true,
      supabaseProjectUrlSet: true,
      supabaseJwksUrlSet: true,
      supabaseServiceRoleSet: true,
      notificationDeliveryMode: "apns",
      apnsConfigured: false
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("APNs delivery mode requires APNs credentials.");
  });

  it("requires public legal and support URLs", () => {
    const result = auditPublicUrls({
      privacyUrl: "https://nightloop.vercel.app/privacy",
      termsUrl: "https://nightloop.vercel.app/terms",
      supportUrl: "",
      deleteAccountUrl: "https://nightloop.vercel.app/delete-account",
      accessibilityUrl: "https://nightloop.vercel.app/accessibility"
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Support URL is required.");
  });
});
