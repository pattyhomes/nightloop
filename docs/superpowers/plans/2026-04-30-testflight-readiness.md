# TestFlight Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Nightloop for a tiny trusted external TestFlight beta using Railway staging, staging Supabase, Apple-first auth, reviewer demo access, real APNs, and public legal/support pages.

**Architecture:** Keep the existing SwiftUI + Express + Supabase Auth architecture. Add release-readiness checks and reviewer/TestFlight affordances around the existing app instead of refactoring the backend into Supabase Edge Functions. Railway owns the staging Express API and backend secrets; Supabase owns Auth/Postgres; Vercel hosts public support/legal pages.

**Tech Stack:** SwiftUI, XcodeGen, Supabase Swift, Express, PostgreSQL, Vitest, Next.js, Railway, Vercel, Apple Developer/App Store Connect, APNs.

---

## File Structure

- Create `backend/src/services/v1/testflightReadinessService.ts`: pure helpers for validating release/staging config values without reading secrets.
- Create `backend/src/scripts/auditTestFlightReadiness.ts`: CLI audit for environment and URL readiness.
- Modify `backend/package.json`: add `testflight:readiness` script.
- Create `backend/test/testflight-readiness.test.ts`: unit tests for config validation and production/dev endpoint expectations.
- Modify `backend/src/services/v1/notificationService.ts`: replace APNs "not implemented" shell with direct APNs sender.
- Modify `backend/test/v1-notification-api.test.ts`: APNs sender tests using a mocked transport seam.
- Modify iOS config/plist/model files for release reviewer config fields.
- Modify `ios/Nightloop/Nightloop/Sources/Features/AuthLandingView.swift`: add config-gated reviewer demo sign-in UI for Release/TestFlight.
- Modify `ios/Nightloop/NightloopTests/NightloopTests.swift`: config, request, and release-safety tests.
- Create `frontend/app/privacy/page.tsx`, `frontend/app/terms/page.tsx`, `frontend/app/support/page.tsx`, `frontend/app/delete-account/page.tsx`, and `frontend/app/accessibility/page.tsx`: beta legal/support pages.
- Modify `frontend/app/layout.tsx`: production metadata for legal/support pages.
- Create `docs/nightloop-v3/TESTFLIGHT_READINESS.md`: guided manual Apple/Railway/Supabase/Vercel checklist plus App Store Connect packet.

---

### Task 1: Release/Staging Readiness Audit

**Files:**
- Create: `backend/src/services/v1/testflightReadinessService.ts`
- Create: `backend/src/scripts/auditTestFlightReadiness.ts`
- Create: `backend/test/testflight-readiness.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write failing tests for release config validation**

Add `backend/test/testflight-readiness.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm --prefix backend test -- testflight-readiness.test.ts
```

Expected: FAIL because `testflightReadinessService.ts` does not exist.

- [ ] **Step 3: Implement the readiness service**

Create `backend/src/services/v1/testflightReadinessService.ts`:

```ts
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

export function auditPublicUrls(input: PublicUrlAuditInput): AuditResult {
  const checks: Array<[string, string]> = [
    ["Privacy URL", input.privacyUrl],
    ["Terms URL", input.termsUrl],
    ["Support URL", input.supportUrl],
    ["Delete Account URL", input.deleteAccountUrl],
    ["Accessibility URL", input.accessibilityUrl]
  ];
  return result(checks.filter(([, value]) => !isHttpsUrl(value)).map(([label]) => `${label} is required.`));
}
```

- [ ] **Step 4: Add the CLI audit**

Create `backend/src/scripts/auditTestFlightReadiness.ts`:

```ts
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
```

- [ ] **Step 5: Add package script**

Modify `backend/package.json` scripts:

```json
"testflight:readiness": "tsx src/scripts/auditTestFlightReadiness.ts"
```

- [ ] **Step 6: Verify tests pass**

Run:

```bash
npm --prefix backend test -- testflight-readiness.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/v1/testflightReadinessService.ts backend/src/scripts/auditTestFlightReadiness.ts backend/test/testflight-readiness.test.ts backend/package.json
git commit -m "test: add testflight readiness audit"
```

---

### Task 2: Reviewer Demo Sign-In Surface

**Files:**
- Modify: `ios/Nightloop/Nightloop/Resources/Info-Debug.plist`
- Modify: `ios/Nightloop/Nightloop/Resources/Info-Release.plist`
- Modify: `ios/Nightloop/Config/NightloopConfig.xcconfig.example`
- Modify: `ios/Nightloop/Nightloop/Sources/API/NightloopConfig.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/Features/AuthLandingView.swift`
- Modify: `ios/Nightloop/NightloopTests/NightloopTests.swift`

- [ ] **Step 1: Write failing config tests**

Add tests to `NightloopTests.swift` near existing config tests:

```swift
func testReviewerDemoConfigDecodesWhenEnabled() throws {
    let config = try NightloopConfig(info: [
        "NightloopAPIBaseURL": "https://nightloop-staging.up.railway.app/api/v1",
        "NightloopSupabaseURL": "https://staging.supabase.co",
        "NightloopSupabasePublishableKey": "sb_publishable_staging",
        "NightloopAppleAuthEnabled": "YES",
        "NightloopPhoneAuthEnabled": "NO",
        "NightloopReviewerDemoEnabled": "YES",
        "NightloopReviewerDemoEmailHint": "reviewer@nightloop.test"
    ])

    XCTAssertTrue(config.reviewerDemoEnabled)
    XCTAssertEqual(config.reviewerDemoEmailHint, "reviewer@nightloop.test")
}

func testReviewerDemoConfigDefaultsOff() throws {
    let config = try NightloopConfig(info: [
        "NightloopAPIBaseURL": "https://nightloop-staging.up.railway.app/api/v1",
        "NightloopSupabaseURL": "https://staging.supabase.co",
        "NightloopSupabasePublishableKey": "sb_publishable_staging"
    ])

    XCTAssertFalse(config.reviewerDemoEnabled)
    XCTAssertNil(config.reviewerDemoEmailHint)
}
```

- [ ] **Step 2: Run failing iOS tests**

Run:

```bash
cd ios/Nightloop
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Expected: FAIL because `reviewerDemoEnabled` and `reviewerDemoEmailHint` do not exist.

- [ ] **Step 3: Add config fields to plists and example config**

Add to both `Info-Debug.plist` and `Info-Release.plist`:

```xml
<key>NightloopReviewerDemoEnabled</key>
<string>$(REVIEWER_DEMO_ENABLED)</string>
<key>NightloopReviewerDemoEmailHint</key>
<string>$(REVIEWER_DEMO_EMAIL_HINT)</string>
```

Add to `NightloopConfig.xcconfig.example`:

```xcconfig
// TestFlight/App Review only. Enables a release-safe reviewer credential entry
// point. Do not put reviewer passwords in this file.
REVIEWER_DEMO_ENABLED = NO
REVIEWER_DEMO_EMAIL_HINT =
```

- [ ] **Step 4: Add config model fields**

Modify `NightloopConfig.swift`:

```swift
let reviewerDemoEnabled: Bool
let reviewerDemoEmailHint: String?
```

In `init(info:)`, read:

```swift
let reviewerDemoEnabled = Self.boolValue(info["NightloopReviewerDemoEnabled"])
let reviewerDemoEmailHint = Self.optionalConfigValue(info["NightloopReviewerDemoEmailHint"])
```

Assign:

```swift
self.reviewerDemoEnabled = reviewerDemoEnabled
self.reviewerDemoEmailHint = reviewerDemoEmailHint
```

Extend the manual initializer with:

```swift
reviewerDemoEnabled: Bool = false,
reviewerDemoEmailHint: String? = nil
```

and assign the stored properties.

- [ ] **Step 5: Add reviewer demo UI**

In `AuthLandingView.swift`, add state:

```swift
@State private var showReviewerDemo = false
@State private var reviewerEmail = ""
@State private var reviewerPassword = ""
@State private var isReviewerSigningIn = false
```

Add this sheet beside the existing DEBUG sheet:

```swift
.sheet(isPresented: $showReviewerDemo) {
    ReviewerDemoSignInView(
        authStore: authStore,
        emailHint: authStore.config.reviewerDemoEmailHint
    )
}
```

In the auth panel, below Apple sign-in and above phone flow, add:

```swift
if authStore.config.reviewerDemoEnabled {
    Button {
        showReviewerDemo = true
    } label: {
        Label("Reviewer demo access", systemImage: "checkmark.seal.fill")
            .font(.subheadline.weight(.black))
            .frame(maxWidth: .infinity)
            .frame(height: 46)
    }
    .buttonStyle(.bordered)
    .tint(NightloopTheme.purple)
}
```

Add a private view in the same file:

```swift
private struct ReviewerDemoSignInView: View {
    @ObservedObject var authStore: AuthStore
    let emailHint: String?
    @Environment(\.dismiss) private var dismiss
    @State private var email: String
    @State private var password = ""
    @State private var isSigningIn = false

    init(authStore: AuthStore, emailHint: String?) {
        self.authStore = authStore
        self.emailHint = emailHint
        _email = State(initialValue: emailHint ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Reviewer demo")
                .font(.title2.weight(.black))
                .foregroundStyle(NightloopTheme.ink)
            Text("Use the credentials from App Review notes to open the seeded TestFlight account.")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(NightloopTheme.inkMuted)
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .padding(12)
                .background(NightloopTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
            SecureField("Password", text: $password)
                .textContentType(.password)
                .padding(12)
                .background(NightloopTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: NightloopTheme.cornerSmall))
            Button {
                Task {
                    isSigningIn = true
                    await authStore.signIn(email: email, password: password)
                    isSigningIn = false
                    if case .signedIn = authStore.phase {
                        dismiss()
                    }
                }
            } label: {
                if isSigningIn {
                    ProgressView().tint(.white)
                } else {
                    Text("Sign in")
                        .font(.headline.weight(.black))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(NightloopTheme.purple)
            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.count < 8 || isSigningIn)
            Spacer()
        }
        .padding(22)
        .background(OrchidBackground())
    }
}
```

- [ ] **Step 6: Verify iOS tests pass**

Run:

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ios/Nightloop/Nightloop/Resources/Info-Debug.plist ios/Nightloop/Nightloop/Resources/Info-Release.plist ios/Nightloop/Config/NightloopConfig.xcconfig.example ios/Nightloop/Nightloop/Sources/API/NightloopConfig.swift ios/Nightloop/Nightloop/Sources/Features/AuthLandingView.swift ios/Nightloop/NightloopTests/NightloopTests.swift ios/Nightloop/project.yml ios/Nightloop/Nightloop.xcodeproj
git commit -m "feat: add reviewer demo sign-in gate"
```

---

### Task 3: Direct APNs Sender

**Files:**
- Modify: `backend/src/services/v1/notificationService.ts`
- Modify: `backend/test/v1-notification-api.test.ts`

- [ ] **Step 1: Write failing APNs sender tests**

In `backend/test/v1-notification-api.test.ts`, replace the existing APNs-not-implemented expectation with:

```ts
it("builds a direct APNs request without exposing credentials", async () => {
  const requests: Array<{ authority: string; path: string; headers: Record<string, string>; body: string }> = [];
  const sender = new ApnsNotificationSender(
    {
      ...baseConfig,
      notificationDeliveryMode: "apns",
      apnsTeamId: "TEAM123456",
      apnsKeyId: "KEY1234567",
      apnsPrivateKey: [
        "-----BEGIN PRIVATE KEY-----",
        "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChRANCAARAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "-----END PRIVATE KEY-----"
      ].join("\\n"),
      apnsBundleId: "com.nightloop.app",
      apnsEnvironment: "sandbox"
    },
    async (request) => {
      requests.push(request);
      return { status: 200, body: "{}" };
    }
  );

  const result = await sender.send({
    tokens: [testDeviceTokenRow("a".repeat(64))],
    copy: "your shortlist is ready",
    category: "shortlist_ready",
    route: { type: "decision_session", session_id: "11111111-1111-4111-8111-111111111111" }
  });

  expect(result).toEqual({ delivered_count: 1, delivery_mode: "apns" });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.authority).toBe("api.sandbox.push.apple.com");
  expect(requests[0]?.path).toBe(`/3/device/${"a".repeat(64)}`);
  expect(requests[0]?.headers["apns-topic"]).toBe("com.nightloop.app");
  expect(requests[0]?.headers.authorization).toMatch(/^bearer /);
  expect(requests[0]?.body).toContain("your shortlist is ready");
  expect(JSON.stringify(requests)).not.toContain("PRIVATE KEY");
});
```

Add a local test helper if needed:

```ts
function testDeviceTokenRow(token: string) {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    platform: "ios" as const,
    token_hash: "hash",
    token_value: token,
    apns_environment: "sandbox" as const,
    app_version: "0.1.0",
    build_number: "1",
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
```

- [ ] **Step 2: Run failing notification test**

Run:

```bash
npm --prefix backend test -- v1-notification-api.test.ts
```

Expected: FAIL because `ApnsNotificationSender` still throws `APNS_DELIVERY_NOT_IMPLEMENTED`.

- [ ] **Step 3: Implement injectable APNs transport**

In `notificationService.ts`, add imports:

```ts
import http2 from "http2";
import { SignJWT, importPKCS8 } from "jose";
```

Export these types:

```ts
export type ApnsRequest = {
  authority: string;
  path: string;
  headers: Record<string, string>;
  body: string;
};

export type ApnsTransport = (request: ApnsRequest) => Promise<{ status: number; body: string }>;
```

Add transport:

```ts
const defaultApnsTransport: ApnsTransport = async ({ authority, path, headers, body }) =>
  new Promise((resolve, reject) => {
    const client = http2.connect(`https://${authority}`);
    client.once("error", reject);
    const req = client.request({ ":method": "POST", ":path": path, ...headers });
    let responseBody = "";
    let status = 0;
    req.setEncoding("utf8");
    req.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, body: responseBody });
    });
    req.on("error", (error) => {
      client.close();
      reject(error);
    });
    req.end(body);
  });
```

Modify `ApnsNotificationSender`:

```ts
export class ApnsNotificationSender {
  constructor(
    private readonly config: AppConfig,
    private readonly transport: ApnsTransport = defaultApnsTransport
  ) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (
      !this.config.apnsTeamId ||
      !this.config.apnsKeyId ||
      !this.config.apnsPrivateKey ||
      !this.config.apnsBundleId
    ) {
      throw new ApiError(500, "APNS_CONFIG_MISSING", "APNs delivery is not configured.");
    }

    const key = await importPKCS8(this.config.apnsPrivateKey.replace(/\\\\n/g, "\\n"), "ES256");
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.config.apnsKeyId })
      .setIssuer(this.config.apnsTeamId)
      .setIssuedAt()
      .setExpirationTime("50m")
      .sign(key);

    const authority =
      this.config.apnsEnvironment === "production"
        ? "api.push.apple.com"
        : "api.sandbox.push.apple.com";

    let delivered = 0;
    for (const token of input.tokens) {
      const body = JSON.stringify({
        aps: {
          alert: {
            title: "nightloop",
            body: input.copy
          },
          sound: "default",
          category: input.category
        },
        route: input.route,
        session_id: input.route.session_id
      });

      const response = await this.transport({
        authority,
        path: `/3/device/${token.token_value}`,
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": this.config.apnsBundleId,
          "apns-push-type": "alert",
          "apns-priority": "10"
        },
        body
      });

      if (response.status >= 200 && response.status < 300) {
        delivered += 1;
      }
    }

    return { delivered_count: delivered, delivery_mode: "apns" };
  }
}
```

- [ ] **Step 4: Verify notification tests pass**

Run:

```bash
npm --prefix backend test -- v1-notification-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/v1/notificationService.ts backend/test/v1-notification-api.test.ts
git commit -m "feat: enable direct apns room notifications"
```

---

### Task 4: Beta Legal And Support Pages

**Files:**
- Create: `frontend/app/privacy/page.tsx`
- Create: `frontend/app/terms/page.tsx`
- Create: `frontend/app/support/page.tsx`
- Create: `frontend/app/delete-account/page.tsx`
- Create: `frontend/app/accessibility/page.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create shared legal page style**

Use the same minimal inline style in each page:

```tsx
const pageStyle = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "56px 20px 80px",
  lineHeight: 1.7,
  color: "#f4f0ff",
  background: "#08050f",
  minHeight: "100vh"
};

const mutedStyle = { color: "#b9accf" };
```

- [ ] **Step 2: Add Privacy page**

Create `frontend/app/privacy/page.tsx`:

```tsx
export const metadata = { title: "Nightloop Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main style={pageStyle}>
      <h1>Privacy Policy</h1>
      <p style={mutedStyle}>Last updated April 30, 2026.</p>
      <p>
        Nightloop is a beta nightlife app for discovering venues, coordinating with friends,
        and sharing venue signals. For beta support, contact axelbaumcharles@gmail.com.
      </p>
      <h2>Information we collect</h2>
      <p>
        We collect account profile details, age eligibility attestation, preferences, friend
        relationships, blocks, reports, Decision room activity, room messages, attendance
        intents, venue signals, and app/device information needed to operate the service.
      </p>
      <h2>Location</h2>
      <p>
        Nightloop uses location while the app is open to sort nearby venues and verify that
        live venue signals are submitted near the venue. We do not display precise coordinates
        to other users.
      </p>
      <h2>Service providers</h2>
      <p>
        Nightloop uses Supabase for authentication and database services, Railway for backend
        hosting, Vercel for web hosting, Google Maps for maps, and Apple services for TestFlight,
        Sign in with Apple, and push notifications.
      </p>
      <h2>Analytics</h2>
      <p>
        The first beta does not include a third-party analytics SDK. We may use TestFlight
        feedback, Apple crash reports, backend logs, and direct tester feedback to improve the app.
      </p>
      <h2>Account deletion</h2>
      <p>
        You can delete your account in the app from Profile settings. You can also contact
        axelbaumcharles@gmail.com for help.
      </p>
    </main>
  );
}

const pageStyle = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "56px 20px 80px",
  lineHeight: 1.7,
  color: "#f4f0ff",
  background: "#08050f",
  minHeight: "100vh"
};

const mutedStyle = { color: "#b9accf" };
```

- [ ] **Step 3: Add Terms page**

Create `frontend/app/terms/page.tsx` with concise beta terms:

```tsx
export const metadata = { title: "Nightloop Terms" };

export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <h1>Terms</h1>
      <p style={mutedStyle}>Last updated April 30, 2026.</p>
      <p>
        Nightloop is a beta nightlife planning app. By using the beta, you agree to use it
        responsibly, follow venue rules, and avoid submitting false or harmful content.
      </p>
      <h2>Age and safety</h2>
      <p>
        Nightloop is intended for users who are legally allowed to enter nightlife venues.
        Nightloop does not guarantee venue admission, safety, wait times, covers, or event details.
      </p>
      <h2>Beta availability</h2>
      <p>
        Features may change, break, or be removed during beta. Venue information can be incomplete
        and should be treated as planning guidance, not a guarantee.
      </p>
      <h2>User content</h2>
      <p>
        Do not submit abusive, misleading, illegal, or privacy-invasive content. Nightloop may
        remove content, restrict accounts, or process reports to protect users and venues.
      </p>
      <h2>Contact</h2>
      <p>For support, contact axelbaumcharles@gmail.com.</p>
    </main>
  );
}

const pageStyle = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "56px 20px 80px",
  lineHeight: 1.7,
  color: "#f4f0ff",
  background: "#08050f",
  minHeight: "100vh"
};

const mutedStyle = { color: "#b9accf" };
```

- [ ] **Step 4: Add Support, Delete Account, and Accessibility pages**

Create each page with the same style and these required contents:

`frontend/app/support/page.tsx`:

```tsx
export const metadata = { title: "Nightloop Support" };

export default function SupportPage() {
  return (
    <main style={pageStyle}>
      <h1>Support</h1>
      <p>Email axelbaumcharles@gmail.com for beta support.</p>
      <p>Please include your TestFlight email, device model, iOS version, and a short description of what happened.</p>
    </main>
  );
}

const pageStyle = { maxWidth: 820, margin: "0 auto", padding: "56px 20px 80px", lineHeight: 1.7, color: "#f4f0ff", background: "#08050f", minHeight: "100vh" };
```

`frontend/app/delete-account/page.tsx`:

```tsx
export const metadata = { title: "Delete Your Nightloop Account" };

export default function DeleteAccountPage() {
  return (
    <main style={pageStyle}>
      <h1>Delete your account</h1>
      <p>In the app, open Profile, go to Account, and choose Delete account.</p>
      <p>If you cannot access the app, email axelbaumcharles@gmail.com from the email associated with your account.</p>
      <p>Account deletion removes or anonymizes profile, social, room, signal, and notification records according to the beta data model.</p>
    </main>
  );
}

const pageStyle = { maxWidth: 820, margin: "0 auto", padding: "56px 20px 80px", lineHeight: 1.7, color: "#f4f0ff", background: "#08050f", minHeight: "100vh" };
```

`frontend/app/accessibility/page.tsx`:

```tsx
export const metadata = { title: "Nightloop Accessibility" };

export default function AccessibilityPage() {
  return (
    <main style={pageStyle}>
      <h1>Accessibility support</h1>
      <p>Nightloop is working toward a usable, accessible nightlife planning experience.</p>
      <p>For accessibility issues or accommodation requests, email axelbaumcharles@gmail.com with the page or flow, device, and iOS version.</p>
    </main>
  );
}

const pageStyle = { maxWidth: 820, margin: "0 auto", padding: "56px 20px 80px", lineHeight: 1.7, color: "#f4f0ff", background: "#08050f", minHeight: "100vh" };
```

- [ ] **Step 5: Update metadata**

Modify `frontend/app/layout.tsx` metadata:

```ts
export const metadata = {
  title: "Nightloop",
  description: "Nightloop beta support and nightlife planning pages"
};
```

- [ ] **Step 6: Verify frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/privacy/page.tsx frontend/app/terms/page.tsx frontend/app/support/page.tsx frontend/app/delete-account/page.tsx frontend/app/accessibility/page.tsx frontend/app/layout.tsx
git commit -m "docs: add beta legal support pages"
```

---

### Task 5: TestFlight Setup Runbook

**Files:**
- Create: `docs/nightloop-v3/TESTFLIGHT_READINESS.md`
- Modify: `docs/nightloop-v3/PHASE6_READINESS.md`

- [ ] **Step 1: Add the runbook**

Create `docs/nightloop-v3/TESTFLIGHT_READINESS.md`:

```md
# TestFlight Readiness Runbook

Last updated: 2026-04-30

## Target

Tiny trusted external TestFlight beta for `com.nightloop.app`.

## Manual Account Setup

### Apple Developer

1. Open Certificates, Identifiers & Profiles.
2. Select or create App ID `com.nightloop.app`.
3. Enable Sign in with Apple.
4. Enable Push Notifications.
5. Create an APNs Auth Key.
6. Record Team ID, Key ID, and download the private key once.

### Supabase Staging

1. Create a separate staging Supabase project.
2. Apply migrations `db/migrations/*.sql` in order.
3. Configure Sign in with Apple for bundle id `com.nightloop.app`.
4. Copy project URL, JWKS URL, issuer URL, publishable key, and service role key.
5. Store service role only in Railway/backend env.

### Railway

1. Create a Railway service from this repo.
2. Build command: `npm --prefix backend run build`.
3. Start command: `npm --prefix backend start`.
4. Set `NODE_ENV=production`.
5. Set Supabase, DB, provider, and APNs env vars.
6. Set `NOTIFICATION_DELIVERY_MODE=apns` only after APNs credentials are present.
7. Confirm `/health` returns success over HTTPS.

### Vercel

1. Deploy the existing `frontend` app.
2. Confirm these public URLs load:
   - `/privacy`
   - `/terms`
   - `/support`
   - `/delete-account`
   - `/accessibility`

## Staging Seed

Run against staging database only:

```bash
psql "$DATABASE_URL" -f db/migrations/001_venue_enrichments.sql
psql "$DATABASE_URL" -f db/migrations/002_phase1_backend_foundation.sql
psql "$DATABASE_URL" -f db/migrations/003_phase2_data_ops.sql
psql "$DATABASE_URL" -f db/migrations/004_phase2b_google_places.sql
psql "$DATABASE_URL" -f db/migrations/005_phase4_security_advisor_cleanup.sql
psql "$DATABASE_URL" -f db/migrations/006_phase55_56_data_recommendations.sql
psql "$DATABASE_URL" -f db/migrations/007_phase58_sf_venue_trust.sql
psql "$DATABASE_URL" -f db/migrations/008_phase58a_hours_trust.sql
psql "$DATABASE_URL" -f db/migrations/009_phase6a_social_beta.sql
psql "$DATABASE_URL" -f db/migrations/010_phase6b_decision_sessions.sql
psql "$DATABASE_URL" -f db/migrations/011_phase6c_group_pick_rooms.sql
psql "$DATABASE_URL" -f db/migrations/012_phase6c1_social_design_realignment.sql
psql "$DATABASE_URL" -f db/migrations/013_phase6d_room_live_foundation.sql
npm --prefix backend run import:sf-notable
npm --prefix backend run neighborhoods:sf -- --apply --market=san-francisco
npm --prefix backend run recommendations:refresh-inputs -- --market=san-francisco
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
```

## App Store Connect Test Info

- Beta description: Nightloop helps small friend groups choose where to go tonight in San Francisco using source-backed venue context, private friends activity, and Decision rooms.
- Features to test: Apple sign-in, Home recommendations, Map, Venue Detail, Friends, Decision rooms, room chat, final plan, notifications.
- Reviewer notes: normal auth is Sign in with Apple; reviewer demo access is enabled for this TestFlight build and credentials are provided in App Review notes.
- Privacy policy URL: Vercel `/privacy`.
- Support URL: Vercel `/support`.
- Contact: axelbaumcharles@gmail.com.

## Verification

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run testflight:readiness
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
npm run build
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Real-device smoke must cover Apple sign-in, reviewer demo access, Home, Map, Venue Detail, Friends, Decision, notification permission, and at least one room notification.
```

- [ ] **Step 2: Link from Phase 6 readiness**

Add to `docs/nightloop-v3/PHASE6_READINESS.md` under next recommended slice:

```md
For TestFlight readiness, use `docs/nightloop-v3/TESTFLIGHT_READINESS.md`
plus the Superpowers spec and implementation plan in `docs/superpowers/`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/nightloop-v3/TESTFLIGHT_READINESS.md docs/nightloop-v3/PHASE6_READINESS.md
git commit -m "docs: add testflight readiness runbook"
```

---

### Task 6: Full Verification And Archive Readiness

**Files:**
- No new source files unless fixing failures discovered by verification.

- [ ] **Step 1: Run backend build**

```bash
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 2: Run backend tests**

```bash
npm --prefix backend test
```

Expected: PASS.

- [ ] **Step 3: Run TestFlight readiness audit**

For local dry-run without real staging values, run with safe fake HTTPS values:

```bash
NODE_ENV=production \
DATABASE_URL=postgresql://example.invalid/nightloop \
SUPABASE_PROJECT_URL=https://staging.supabase.co \
SUPABASE_JWKS_URL=https://staging.supabase.co/auth/v1/.well-known/jwks.json \
SUPABASE_SERVICE_ROLE_KEY=redacted-test-value \
NOTIFICATION_DELIVERY_MODE=apns \
APNS_TEAM_ID=TEAM123456 \
APNS_KEY_ID=KEY1234567 \
APNS_PRIVATE_KEY='redacted-test-value' \
APNS_BUNDLE_ID=com.nightloop.app \
NIGHTLOOP_PRIVACY_URL=https://nightloop.vercel.app/privacy \
NIGHTLOOP_TERMS_URL=https://nightloop.vercel.app/terms \
NIGHTLOOP_SUPPORT_URL=https://nightloop.vercel.app/support \
NIGHTLOOP_DELETE_ACCOUNT_URL=https://nightloop.vercel.app/delete-account \
NIGHTLOOP_ACCESSIBILITY_URL=https://nightloop.vercel.app/accessibility \
npm --prefix backend run testflight:readiness
```

Expected: PASS and no secret values printed.

- [ ] **Step 4: Run Phase 6 audits**

```bash
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
```

Expected: PASS. If `phase6:social-smoke -- --reset` requires real Supabase service-role credentials, run it only against the configured staging/dev environment and record the result in the final report.

- [ ] **Step 5: Run frontend build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Run iOS project generation and tests**

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Expected: PASS.

- [ ] **Step 7: Run Release simulator build**

```bash
cd ios/Nightloop
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -configuration Release -destination 'generic/platform=iOS Simulator' build
```

Expected: PASS. If Release config is not yet filled with staging values, record the missing config keys and stop before archive/upload.

- [ ] **Step 8: Run secret scan**

```bash
rg -n 'SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|APNS_PRIVATE_KEY|GOOGLE_PLACES_API_KEY|FOURSQUARE_API_KEY|service_role|postgresql://|sk_' ios frontend backend docs --glob '!backend/.env' --glob '!ios/Nightloop/Config/NightloopConfig.xcconfig' --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!**/dist/**'
rg -n '/api/v1/admin|provider-import|GOOGLE_PLACES|FOURSQUARE|DATABASE_URL|SERVICE_ROLE|APNS_PRIVATE_KEY' ios/Nightloop/Nightloop
```

Expected: only documentation warnings and test/example references; no live secrets and no iOS runtime access to backend-only provider/admin surfaces.

- [ ] **Step 9: Commit verification fixes**

If any verification-only fixes were required:

```bash
git status --short
git add docs/nightloop-v3/TESTFLIGHT_READINESS.md docs/nightloop-v3/PHASE6_READINESS.md backend/src/services/v1/testflightReadinessService.ts backend/src/scripts/auditTestFlightReadiness.ts backend/test/testflight-readiness.test.ts backend/src/services/v1/notificationService.ts backend/test/v1-notification-api.test.ts ios/Nightloop/Nightloop/Resources/Info-Debug.plist ios/Nightloop/Nightloop/Resources/Info-Release.plist ios/Nightloop/Config/NightloopConfig.xcconfig.example ios/Nightloop/Nightloop/Sources/API/NightloopConfig.swift ios/Nightloop/Nightloop/Sources/Features/AuthLandingView.swift ios/Nightloop/NightloopTests/NightloopTests.swift frontend/app/privacy/page.tsx frontend/app/terms/page.tsx frontend/app/support/page.tsx frontend/app/delete-account/page.tsx frontend/app/accessibility/page.tsx frontend/app/layout.tsx
git commit -m "fix: close testflight readiness verification gaps"
```

If no changes were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: release config, Railway staging, staging Supabase, curated seed, reviewer demo, APNs, Vercel pages, manual setup boundaries, and verification are all represented.
- Incomplete-marker scan: no deferred-work markers or unspecified file paths remain.
- Type consistency: backend audit names, iOS config names, and APNs env names match the design and existing config conventions.
- Scope check: this plan prepares a small external TestFlight beta and does not add analytics, contacts, public rooms, broad UI redesign, or full App Store hardening.
