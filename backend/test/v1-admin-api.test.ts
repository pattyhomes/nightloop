import { randomUUID } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import path from "path";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { config as loadDotenv } from "dotenv";
import { createApp, type AuthAdminClient } from "../src/app";
import { loadConfig, type AppConfig } from "../src/lib/config";

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

type TestUser = {
  authUserId: string;
  token: string;
};

class TestJwksServer {
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;
  private server!: Server;

  readonly issuer = "https://nightloop.test/auth/v1";

  get jwksUrl(): string {
    const address = this.server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("JWKS server is not running.");
    }

    return `http://127.0.0.1:${address.port}/.well-known/jwks.json`;
  }

  async start(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    this.privateKey = privateKey;
    this.publicJwk = await exportJWK(publicKey);
    this.publicJwk.alg = "ES256";
    this.publicJwk.kid = "phase-2-test-key";
    this.publicJwk.use = "sig";

    this.server = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [this.publicJwk] }));
    });

    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
  }

  async sign(authUserId: string): Promise<string> {
    return new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "phase-2-test-key" })
      .setSubject(authUserId)
      .setIssuer(this.issuer)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(this.privateKey);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

describe("Nightloop v1 admin/data ops API", () => {
  const authUserIds: string[] = [];
  const testRunId = randomUUID();
  const tempVenueSlugs: string[] = [];
  let jwks: TestJwksServer;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let testConfig: AppConfig;

  const authAdmin: AuthAdminClient = {
    async deleteUser(): Promise<void> {
      // Admin tests do not exercise Supabase auth deletion.
    }
  };

  async function createTestUser(): Promise<TestUser> {
    const authUserId = randomUUID();
    authUserIds.push(authUserId);
    return {
      authUserId,
      token: await jwks.sign(authUserId)
    };
  }

  async function createAdminUser(): Promise<TestUser> {
    const user = await createTestUser();
    await request(app).get("/api/v1/me").set("Authorization", `Bearer ${user.token}`).expect(200);
    await pool.query(
      `
        INSERT INTO admin_users (auth_user_id, role, is_active)
        VALUES ($1::uuid, 'ops_admin', true)
        ON CONFLICT (auth_user_id)
        DO UPDATE SET is_active = true, role = EXCLUDED.role, updated_at = now()
      `,
      [user.authUserId]
    );
    return user;
  }

  async function createEligibleUser(): Promise<TestUser> {
    const user = await createTestUser();
    await request(app)
      .post("/api/v1/me/age-attestation")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ is_21_or_over: true })
      .expect(200);
    return user;
  }

  async function getSfMarketId(): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "select id from markets where slug = 'san-francisco'"
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Expected SF market seed to exist.");
    }
    return row.id;
  }

  async function createTempVenue(
    marketId: string,
    name = "Phase 2 Test Venue",
    options: { source?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<string> {
    const slug = `phase2-${testRunId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    tempVenueSlugs.push(slug);
    const result = await pool.query<{ id: string }>(
      `
        INSERT INTO venues (
          slug,
          name,
          city,
          state,
          country_code,
          latitude,
          longitude,
          source,
          metadata,
          market_id,
          canonical_type,
          is_active,
          admin_status
        )
        VALUES (
          $1,
          $2,
          'San Francisco',
          'CA',
          'US',
          37.7749,
          -122.4194,
          $4,
          $5::jsonb,
          $3::uuid,
          'bar',
          true,
          'approved'
        )
        RETURNING id
      `,
      [
        slug,
        name,
        marketId,
        options.source ?? "phase2-test",
        JSON.stringify(options.metadata ?? { neighborhood: "SOMA" })
      ]
    );

    return result.rows[0]?.id ?? "";
  }

  async function createManualCuratedCandidate(marketId: string, name = "Phase 2 Curated Venue"): Promise<string> {
    const providerRecord = await pool.query<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status
        )
        VALUES (
          'manual',
          $1,
          'venue',
          $2::uuid,
          NULL,
          $3::jsonb,
          $4::jsonb,
          NULL,
          'candidate'
        )
        RETURNING id
      `,
      [
        `sf-notable-test-${randomUUID()}`,
        marketId,
        JSON.stringify({ test_run_id: testRunId, source: "sf_notable_curated_csv" }),
        JSON.stringify({
          name,
          canonical_type: "club",
          neighborhood: "SoMa",
          notability_reason: "test notable nightlife venue",
          source_note: "test curated source"
        })
      ]
    );

    const review = await pool.query<{ id: string }>(
      `
        INSERT INTO venue_review_items (
          provider_record_id,
          venue_id,
          market_id,
          proposed_changes
        )
        VALUES ($1::uuid, NULL, $2::uuid, $3::jsonb)
        RETURNING id
      `,
      [
        providerRecord.rows[0]?.id,
        marketId,
        JSON.stringify({
          test_run_id: testRunId,
          curated_candidate: {
            name,
            canonical_type: "club",
            neighborhood: "SoMa",
            notability_reason: "test notable nightlife venue",
            source_note: "test curated source"
          },
          review_context: {
            action_bucket: "missing_coordinates",
            next_step: "run_google_curated_qa_or_manually_verify"
          },
          duplicate_warnings: []
        })
      ]
    );

    return review.rows[0]?.id ?? "";
  }

  async function tableExists(tableName: string): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      "select to_regclass($1) is not null as exists",
      [`public.${tableName}`]
    );
    return result.rows[0]?.exists ?? false;
  }

  beforeAll(async () => {
    jwks = new TestJwksServer();
    await jwks.start();

    testConfig = {
      ...loadConfig(),
      env: "test" as const,
      supabaseJwtIssuer: jwks.issuer,
      supabaseJwksUrl: jwks.jwksUrl,
      reviewerAuthUserId: undefined,
      foursquareApiKey: undefined,
      googlePlacesApiKey: undefined
    };

    pool = new Pool({ connectionString: testConfig.databaseUrl });
    app = createApp({ config: testConfig, authAdmin });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (await tableExists("moderation_reports")) {
      await pool.query("delete from moderation_reports where details->>'test_run_id' = $1", [
        testRunId
      ]);
    }
    if (await tableExists("events")) {
      await pool.query("delete from events where metadata->>'test_run_id' = $1", [testRunId]);
    }
    if (await tableExists("venue_assets")) {
      await pool.query("delete from venue_assets where source = $1", [testRunId]);
    }
    if (await tableExists("venue_review_items")) {
      await pool.query("delete from venue_review_items where proposed_changes->>'test_run_id' = $1", [
        testRunId
      ]);
    }
    if (await tableExists("provider_records")) {
      await pool.query("delete from provider_records where raw_payload->>'test_run_id' = $1", [
        testRunId
      ]);
    }
    if (await tableExists("provider_import_runs")) {
      await pool.query("delete from provider_import_runs where summary->>'test_run_id' = $1", [
        testRunId
      ]);
    }

    if (tempVenueSlugs.length > 0) {
      await pool.query("delete from venues where slug = any($1::text[])", [tempVenueSlugs]);
    }
    await pool.query(
      "delete from venues where source = 'provider:google_places' and metadata->>'test_run_id' = $1",
      [testRunId]
    );
    await pool.query(
      "delete from venues where source = 'curated:sf_notable' and metadata->>'test_run_id' = $1",
      [testRunId]
    );

    if (authUserIds.length > 0) {
      await pool.query(
        `
          DELETE FROM audit_logs
          WHERE actor_user_id IN (
            SELECT id FROM users WHERE auth_user_id = any($1::uuid[])
          )
          OR target_user_id IN (
            SELECT id FROM users WHERE auth_user_id = any($1::uuid[])
          )
        `,
        [authUserIds]
      );
      await pool.query(
        "delete from admin_users where auth_user_id = any($1::uuid[])",
        [authUserIds]
      ).catch(() => undefined);
      await pool.query("delete from users where auth_user_id = any($1::uuid[])", [authUserIds]);
    }

    await pool.end();
    await jwks.stop();
  });

  it("requires a Supabase JWT and active admin allowlist entry", async () => {
    await request(app).get("/api/v1/admin/me").expect(401);

    const nonAdmin = await createTestUser();
    const forbidden = await request(app)
      .get("/api/v1/admin/me")
      .set("Authorization", `Bearer ${nonAdmin.token}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe("ADMIN_REQUIRED");

    const admin = await createAdminUser();
    const response = await request(app)
      .get("/api/v1/admin/me")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.admin.role).toBe("ops_admin");
    expect(response.body.user.auth_user_id).toBe(admin.authUserId);
  });

  it("allows local-only bootstrap of the current Supabase user into the admin allowlist", async () => {
    const user = await createTestUser();

    await request(app)
      .get("/api/v1/admin/me")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(403);

    const bootstrap = await request(app)
      .post("/api/v1/admin/bootstrap-local")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(201);

    expect(bootstrap.body.admin).toEqual(
      expect.objectContaining({
        auth_user_id: user.authUserId,
        role: "ops_admin",
        is_active: true
      })
    );

    await request(app)
      .get("/api/v1/admin/me")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
  });

  it("stores fixture Foursquare provider imports and creates venue review candidates", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();

    const created = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "foursquare",
        market_id: marketId,
        mode: "fixture",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId }
      })
      .expect(201);

    const run = await request(app)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.run.status).toBe("completed");
    expect(run.body.summary.provider_records_created).toBeGreaterThan(0);

    const records = await request(app)
      .get(`/api/v1/admin/provider-records?import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(records.body.items[0]).toEqual(
      expect.objectContaining({
        provider: "foursquare",
        record_type: "venue"
      })
    );

    const reviewItems = await request(app)
      .get(`/api/v1/admin/venue-review-items?status=pending&import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(reviewItems.body.items.length).toBeGreaterThan(0);
  });

  it("runs Google Places fixture QA imports without network calls", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const created = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "fixture",
        capped_venue_count: 2,
        summary: { test_run_id: testRunId, google_run_kind: "existing_qa" }
      })
      .expect(201);

    const run = await request(app)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(run.body.run.status).toBe("completed");
    expect(run.body.summary.provider_records_created).toBeGreaterThanOrEqual(2);
    expect(run.body.summary.review_items_created).toBeGreaterThanOrEqual(2);

    const records = await request(app)
      .get(`/api/v1/admin/provider-records?import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(records.body.items[0]).toEqual(
      expect.objectContaining({
        provider: "google_places",
        record_type: "venue"
      })
    );
  });

  it("creates Google discovery review items with quality metadata and duplicate guards", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const duplicateVenueId = await createTempVenue(marketId, "Phase 2 Existing Discovery");
    const discoveryPlaceId = `ChIJ-new-discovery-lounge-${testRunId}`;
    await pool.query(
      `
        UPDATE venues
        SET latitude = 37.7811,
            longitude = -122.4121,
            metadata = metadata || $2::jsonb
        WHERE id = $1::uuid
      `,
      [
        duplicateVenueId,
        JSON.stringify({
          google_place_id: "ChIJ-existing-discovery-duplicate",
          test_run_id: testRunId
        })
      ]
    );

    const googleApp = createApp({
      config: {
        ...testConfig,
        googlePlacesApiKey: "test-google-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) !== "https://places.googleapis.com/v1/places:searchText") {
        return originalFetch(url, init);
      }

      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: "ChIJ-existing-discovery-duplicate",
              displayName: { text: "Phase 2 Existing Discovery", languageCode: "en" },
              formattedAddress: "2 Existing Way, San Francisco, CA 94103",
              location: { latitude: 37.7811, longitude: -122.4121 },
              types: ["bar", "establishment"],
              primaryType: "bar",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=duplicate"
            },
            {
              id: discoveryPlaceId,
              displayName: { text: "Phase 2 Discovery Lounge", languageCode: "en" },
              formattedAddress: "1 Discovery Way, San Francisco, CA 94103",
              location: { latitude: 37.782, longitude: -122.413 },
              types: ["cocktail_bar", "bar", "establishment"],
              primaryType: "cocktail_bar",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=discovery"
            },
            {
              id: "ChIJ-generic-store",
              displayName: { text: "Phase 2 Discovery Store", languageCode: "en" },
              formattedAddress: "3 Store Way, San Francisco, CA 94103",
              location: { latitude: 37.783, longitude: -122.414 },
              types: ["store", "establishment"],
              primaryType: "store",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=store"
            }
          ]
        })
      } as Response;
    });

    const created = await request(googleApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 3,
        summary: { test_run_id: testRunId, google_run_kind: "discovery" }
      })
      .expect(201);

    const run = await request(googleApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(1);
    expect(run.body.summary.skipped_duplicates).toBeGreaterThanOrEqual(1);
    expect(run.body.summary.skipped_non_nightlife).toBeGreaterThanOrEqual(1);
    expect(run.body.summary.discovery_terms).toContain("cocktail bars");
    expect(run.body.summary.discovery_terms).not.toContain("bars");

    const reviewItems = await request(googleApp)
      .get(`/api/v1/admin/venue-review-items?status=pending&import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(reviewItems.body.items).toHaveLength(1);
    const proposed = reviewItems.body.items[0].proposed_changes;
    expect(proposed.discovery_context).toEqual(
      expect.objectContaining({
        provider: "google_places",
        google_run_kind: "discovery",
        included_reason: expect.stringContaining("nightlife")
      })
    );
    expect(proposed.duplicate_warnings).toEqual([]);
    expect(proposed.create_venue.name).toBe("Phase 2 Discovery Lounge");

    const googleCalls = fetchSpy.mock.calls.filter(
      ([url]) => String(url) === "https://places.googleapis.com/v1/places:searchText"
    );
    expect(googleCalls.length).toBeGreaterThan(0);
    const firstBody = JSON.parse(String((googleCalls[0]?.[1] as RequestInit).body));
    expect(firstBody.textQuery).toMatch(/cocktail bars|nightclubs|dance clubs|live music venues|lounges|gay bars|karaoke bars|late night bars/);
    expect(firstBody.textQuery).not.toMatch(/^bars in/i);
  });

  it("runs Google curated candidate QA without auto-approving public venues", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    await createManualCuratedCandidate(marketId, "Phase 2 Curated Club");
    const curatedPlaceId = `ChIJ-curated-club-${testRunId}`;

    const googleApp = createApp({
      config: {
        ...testConfig,
        googlePlacesApiKey: "test-google-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) !== "https://places.googleapis.com/v1/places:searchText") {
        return originalFetch(url, init);
      }

      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: curatedPlaceId,
              displayName: { text: "Phase 2 Curated Club - Provider Name", languageCode: "en" },
              formattedAddress: "10 Curated Way, San Francisco, CA 94103",
              location: { latitude: 37.7823, longitude: -122.4112 },
              types: ["night_club", "bar", "establishment"],
              primaryType: "night_club",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=curated"
            }
          ]
        })
      } as Response;
    });

    const created = await request(googleApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, google_run_kind: "curated_qa" }
      })
      .expect(201);

    const run = await request(googleApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(1);
    expect(run.body.summary.google_run_kind).toBe("curated_qa");
    expect(
      fetchSpy.mock.calls.filter(([url]) => String(url) === "https://places.googleapis.com/v1/places:searchText")
    ).toHaveLength(1);

    const reviewItems = await request(googleApp)
      .get(`/api/v1/admin/venue-review-items?status=pending&import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(reviewItems.body.items).toHaveLength(1);
    const proposed = reviewItems.body.items[0].proposed_changes;
    expect(proposed.create_venue.name).toBe("Phase 2 Curated Club");
    expect(proposed.create_venue.provider_display_name).toBe("Phase 2 Curated Club - Provider Name");
    expect(proposed.review_context.action_bucket).toBe("google_verified_curated_candidate");
    expect(proposed.metadata_patch.notability_reason).toBe("test notable nightlife venue");

    const publicVenue = await pool.query<{ count: string }>(
      "select count(*)::text from venues where metadata->>'google_place_id' = $1",
      [curatedPlaceId]
    );
    expect(Number(publicVenue.rows[0]?.count ?? 0)).toBe(0);
  });

  it("holds curated Google QA rows when provider status or duplicate warnings are risky", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    await createManualCuratedCandidate(marketId, "Phase 2 Duplicate Curated Club");
    const duplicateVenueId = await createTempVenue(marketId, "Phase 2 Duplicate Curated Club");
    const duplicatePlaceId = `ChIJ-curated-duplicate-${testRunId}`;
    await pool.query(
      `
        UPDATE venues
        SET latitude = 37.7823,
            longitude = -122.4112,
            metadata = metadata || $2::jsonb
        WHERE id = $1::uuid
      `,
      [
        duplicateVenueId,
        JSON.stringify({
          test_run_id: testRunId,
          google_place_id: duplicatePlaceId
        })
      ]
    );

    const googleApp = createApp({
      config: {
        ...testConfig,
        googlePlacesApiKey: "test-google-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) !== "https://places.googleapis.com/v1/places:searchText") {
        return originalFetch(url, init);
      }

      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: duplicatePlaceId,
              displayName: { text: "Phase 2 Duplicate Curated Club", languageCode: "en" },
              formattedAddress: "10 Curated Way, San Francisco, CA 94103",
              location: { latitude: 37.7823, longitude: -122.4112 },
              types: ["night_club", "bar", "establishment"],
              primaryType: "night_club",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=curated-duplicate"
            }
          ]
        })
      } as Response;
    });

    const created = await request(googleApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, google_run_kind: "curated_qa" }
      })
      .expect(201);

    await request(googleApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    const reviewItems = await request(googleApp)
      .get(`/api/v1/admin/venue-review-items?status=pending&import_run_id=${created.body.run.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    const proposed = reviewItems.body.items[0].proposed_changes;
    expect(proposed.create_venue).toBeUndefined();
    expect(proposed.review_context.action_bucket).toBe("hold_manual");
    expect(proposed.review_context.hold_reason).toBe("duplicate_warning");
    expect(proposed.duplicate_warnings.length).toBeGreaterThan(0);
  });

  it("requires a backend-only Google Places key for live runs and validates provider caps", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();

    await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 100,
        summary: { test_run_id: testRunId, google_run_kind: "existing_qa" }
      })
      .expect(201);

    const missingKeyRun = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, google_run_kind: "existing_qa" }
      })
      .expect(201);

    const missingKey = await request(app)
      .post(`/api/v1/admin/provider-import-runs/${missingKeyRun.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(409);
    expect(missingKey.body.error.code).toBe("PROVIDER_KEY_MISSING");

    const fsqTooLarge = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "foursquare",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 21,
        summary: { test_run_id: testRunId }
      })
      .expect(400);
    expect(fsqTooLarge.body.error.code).toBe("VALIDATION_ERROR");

    const curatedTooLarge = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 51,
        summary: { test_run_id: testRunId, google_run_kind: "curated_qa" }
      })
      .expect(400);
    expect(curatedTooLarge.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("uses the exact Google Places field mask for mocked live existing-venue QA", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const googleApp = createApp({
      config: {
        ...testConfig,
        googlePlacesApiKey: "test-google-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) !== "https://places.googleapis.com/v1/places:searchText") {
        return originalFetch(url, init);
      }

      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: "ChIJ-google-audio",
              displayName: { text: "Audio", languageCode: "en" },
              formattedAddress: "316 11th St, San Francisco, CA 94103, USA",
              location: { latitude: 37.780591, longitude: -122.41405 },
              types: ["night_club", "bar", "establishment"],
              primaryType: "night_club",
              businessStatus: "OPERATIONAL",
              googleMapsUri: "https://maps.google.com/?cid=audio"
            }
          ]
        })
      } as Response;
    });

    const created = await request(googleApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, google_run_kind: "existing_qa" }
      })
      .expect(201);

    const run = await request(googleApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(1);
    const googleCalls = fetchSpy.mock.calls.filter(
      ([url]) => String(url) === "https://places.googleapis.com/v1/places:searchText"
    );
    expect(googleCalls).toHaveLength(1);
    const [url, init] = googleCalls[0] ?? [];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchText");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("X-Goog-Api-Key")).toBe("test-google-key");
    const fieldMask = headers.get("X-Goog-FieldMask");
    expect(fieldMask).toBe(
      "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.googleMapsUri"
    );
    expect(fieldMask).not.toContain("*");
    expect(fieldMask).not.toMatch(
      /rating|userRatingCount|currentOpeningHours|regularOpeningHours|internationalPhoneNumber|nationalPhoneNumber|websiteUri|reviews|photos/
    );
  });

  it("skips live Google QA for venues with fresh cached provider metadata", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const venueId = await createTempVenue(marketId, "Phase 2 Fresh Google Cache");
    await pool.query(
      `
        UPDATE venues
        SET metadata = metadata || $2::jsonb,
            created_at = now()
        WHERE id = $1::uuid
      `,
      [
        venueId,
        JSON.stringify({
          test_run_id: testRunId,
          google_place_id: "ChIJ-fresh-cache",
          google_checked_at: new Date().toISOString()
        })
      ]
    );

    const googleApp = createApp({
      config: {
        ...testConfig,
        googlePlacesApiKey: "test-google-key"
      },
      authAdmin
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const created = await request(googleApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "google_places",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, google_run_kind: "existing_qa" }
      })
      .expect(201);

    const run = await request(googleApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(0);
    expect(run.body.summary.skipped_fresh_cache).toBe(1);
    expect(
      fetchSpy.mock.calls.filter(([url]) => String(url) === "https://places.googleapis.com/v1/places:searchText")
    ).toHaveLength(0);
  });

  it("approves Google Places discovery candidates by creating canonical venues", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();

    const record = await pool.query<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status
        )
        VALUES (
          'google_places',
          $1,
          'venue',
          $2::uuid,
          NULL,
          $3::jsonb,
          $4::jsonb,
          0.86,
          'candidate'
        )
        RETURNING id
      `,
      [
        `phase2b-google-${randomUUID()}`,
        marketId,
        JSON.stringify({ test_run_id: testRunId }),
        JSON.stringify({
          google_place_id: "ChIJ-discovery-candidate",
          name: "Phase 2B Discovery Lounge"
        })
      ]
    );

    const review = await pool.query<{ id: string }>(
      `
        INSERT INTO venue_review_items (
          provider_record_id,
          venue_id,
          market_id,
          proposed_changes
        )
        VALUES ($1::uuid, NULL, $2::uuid, $3::jsonb)
        RETURNING id
      `,
      [
        record.rows[0]?.id,
        marketId,
        JSON.stringify({
          test_run_id: testRunId,
          create_venue: {
            name: "Phase 2B Discovery Lounge",
            canonical_type: "bar",
            latitude: 37.781,
            longitude: -122.412,
            formatted_address: "1 Discovery Way, San Francisco, CA",
            google_place_id: "ChIJ-discovery-candidate",
            google_maps_uri: "https://maps.google.com/?cid=discovery",
            types: ["bar", "establishment"]
          }
        })
      ]
    );

    const approved = await request(app)
      .post(`/api/v1/admin/venue-review-items/${review.rows[0]?.id}/approve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ note: "Create canonical discovery venue." })
      .expect(200);

    expect(approved.body.venue).toEqual(
      expect.objectContaining({
        name: "Phase 2B Discovery Lounge",
        source: "provider:google_places",
        admin_status: "approved",
        is_active: true
      })
    );

    const createdVenue = await pool.query<{ id: string; source: string; metadata: Record<string, unknown> }>(
      `
        SELECT id, source, metadata
        FROM venues
        WHERE source = 'provider:google_places'
          AND metadata->>'test_run_id' = $1
          AND metadata->>'google_place_id' = 'ChIJ-discovery-candidate'
      `,
      [testRunId]
    );
    expect(createdVenue.rows[0]?.source).toBe("provider:google_places");
  });

  it("prioritizes approved Google discovery venues for capped Foursquare enrichment", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const olderVenueId = await createTempVenue(marketId, "Phase 2 Older Venue");
    const googleVenueId = await createTempVenue(marketId, "Phase 2 Google Discovery Venue");
    await pool.query(
      `
        UPDATE venues
        SET source = 'provider:google_places',
            metadata = metadata || $2::jsonb,
            created_at = now()
        WHERE id = $1::uuid
      `,
      [
        googleVenueId,
        JSON.stringify({
          test_run_id: testRunId,
          google_place_id: "ChIJ-phase2-google-discovery-approved"
        })
      ]
    );

    const fsqApp = createApp({
      config: {
        ...testConfig,
        foursquareApiKey: "test-foursquare-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const text = String(url);
      if (!text.startsWith("https://places-api.foursquare.com")) {
        return originalFetch(url, init);
      }
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer test-foursquare-key");
      expect((init?.headers as Record<string, string>)?.["X-Places-Api-Version"]).toBe("2025-06-17");

      if (text.includes("/places/search")) {
        expect(text).toContain("Phase+2+Google+Discovery+Venue");
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                fsq_place_id: "fsq-phase2-google-discovery",
                name: "Phase 2 Google Discovery Venue"
              }
            ]
          })
        } as Response;
      }

      const fields = new URL(text).searchParams.get("fields") ?? "";
      expect(fields).toContain("tel");
      expect(fields).toContain("website");
      expect(fields).toContain("social_media");
      expect(fields).toContain("related_places");
      expect(fields).not.toContain("hours");
      expect(fields).not.toContain("hours_popular");
      expect(fields).not.toContain("rating");
      expect(fields).not.toContain("popularity");
      expect(fields).not.toContain("price");
      expect(fields).not.toContain("closed_bucket");
      expect(fields).not.toContain("stats");
      return {
        ok: true,
        json: async () => ({
          fsq_place_id: "fsq-phase2-google-discovery",
          name: "Phase 2 Google Discovery Venue",
          categories: [{ id: 13003, name: "Bar" }],
          location: {},
          tel: "+14155550123",
          website: "https://example.com",
          social_media: { instagram: "phase2google" },
          related_places: {},
          verified: true
        })
      } as Response;
    });

    const created = await request(fsqApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "foursquare",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, enrichment_target: "google_discovery_approved" }
      })
      .expect(201);

    const run = await request(fsqApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(1);
    expect(run.body.summary.enrichment_target).toBe("google_discovery_approved");
    expect(fetchSpy).toHaveBeenCalled();

    const record = await pool.query<{ venue_id: string | null }>(
      "select venue_id from provider_records where import_run_id = $1::uuid",
      [created.body.run.id]
    );
    expect(record.rows[0]?.venue_id).toBe(googleVenueId);
    expect(record.rows[0]?.venue_id).not.toBe(olderVenueId);
  });

  it("prioritizes curated SF notable venues for capped Foursquare enrichment", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const olderVenueId = await createTempVenue(marketId, "Phase 2 Older Curated Target");
    const curatedVenueId = await createTempVenue(marketId, "Phase 2 Curated Notable Venue");
    await pool.query(
      `
        UPDATE venues
        SET source = 'curated:sf_notable',
            metadata = metadata || $2::jsonb,
            created_at = now()
        WHERE id = $1::uuid
      `,
      [
        curatedVenueId,
        JSON.stringify({
          test_run_id: testRunId,
          google_place_id: "ChIJ-phase2-curated-notable"
        })
      ]
    );

    const fsqApp = createApp({
      config: {
        ...testConfig,
        foursquareApiKey: "test-foursquare-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const text = String(url);
      if (!text.startsWith("https://places-api.foursquare.com")) {
        return originalFetch(url, init);
      }
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer test-foursquare-key");
      expect((init?.headers as Record<string, string>)?.["X-Places-Api-Version"]).toBe("2025-06-17");

      if (text.includes("/places/search")) {
        expect(text).toContain("Phase+2+Curated+Notable+Venue");
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                fsq_place_id: "fsq-phase2-curated-notable",
                name: "Phase 2 Curated Notable Venue"
              }
            ]
          })
        } as Response;
      }

      const fields = new URL(text).searchParams.get("fields") ?? "";
      expect(fields).toContain("tel");
      expect(fields).toContain("website");
      expect(fields).toContain("social_media");
      expect(fields).toContain("related_places");
      expect(fields).not.toContain("hours");
      expect(fields).not.toContain("hours_popular");
      expect(fields).not.toContain("rating");
      expect(fields).not.toContain("popularity");
      expect(fields).not.toContain("price");
      expect(fields).not.toContain("closed_bucket");
      expect(fields).not.toContain("stats");
      return {
        ok: true,
        json: async () => ({
          fsq_place_id: "fsq-phase2-curated-notable",
          name: "Phase 2 Curated Notable Venue",
          categories: [{ id: 13003, name: "Bar" }],
          location: {},
          tel: "+14155550123",
          website: "https://example.com",
          social_media: { instagram: "phase2curated" },
          related_places: {},
          verified: true
        })
      } as Response;
    });

    const created = await request(fsqApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "foursquare",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 1,
        summary: { test_run_id: testRunId, enrichment_target: "curated_sf_notable" }
      })
      .expect(201);

    const run = await request(fsqApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.summary.provider_records_created).toBe(1);
    expect(run.body.summary.enrichment_target).toBe("curated_sf_notable");
    expect(fetchSpy).toHaveBeenCalled();

    const record = await pool.query<{ venue_id: string | null; proposed_changes: Record<string, unknown> }>(
      `
        SELECT pr.venue_id, vri.proposed_changes
        FROM provider_records pr
        JOIN venue_review_items vri ON vri.provider_record_id = pr.id
        WHERE pr.import_run_id = $1::uuid
      `,
      [created.body.run.id]
    );
    expect(record.rows[0]?.venue_id).toBe(curatedVenueId);
    expect(record.rows[0]?.venue_id).not.toBe(olderVenueId);
    expect(record.rows[0]?.proposed_changes).not.toHaveProperty("name");
  });

  it("stops capped Foursquare live enrichment after an auth failure", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    await createTempVenue(marketId, "Phase 2 Foursquare Auth Test One");
    await createTempVenue(marketId, "Phase 2 Foursquare Auth Test Two");

    const fsqApp = createApp({
      config: {
        ...testConfig,
        foursquareApiKey: "bad-foursquare-key"
      },
      authAdmin
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (!String(url).startsWith("https://places-api.foursquare.com")) {
        return originalFetch(url, init);
      }
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer bad-foursquare-key");
      expect((init?.headers as Record<string, string>)?.["X-Places-Api-Version"]).toBe("2025-06-17");

      return {
        ok: false,
        status: 401,
        text: async () => '{"message":"Invalid request token."}'
      } as Response;
    });

    const created = await request(fsqApp)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "foursquare",
        market_id: marketId,
        mode: "live",
        capped_venue_count: 3,
        summary: { test_run_id: testRunId, enrichment_target: "google_discovery_approved" }
      })
      .expect(201);

    const run = await request(fsqApp)
      .post(`/api/v1/admin/provider-import-runs/${created.body.run.id}/run`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);

    expect(run.body.run.status).toBe("failed");
    expect(run.body.summary.provider_records_created).toBe(0);
    expect(run.body.summary.errors).toHaveLength(1);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).startsWith("https://places-api.foursquare.com"))).toHaveLength(1);
  });

  it("approves or rejects provider review items without silently mutating venues", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();
    const venueId = await createTempVenue(marketId);

    const record = await pool.query<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status
        )
        VALUES (
          'foursquare',
          $1,
          'venue',
          $2::uuid,
          $3::uuid,
          $4::jsonb,
          $5::jsonb,
          0.91,
          'candidate'
        )
        RETURNING id
      `,
      [
        `phase2-provider-${randomUUID()}`,
        marketId,
        venueId,
        JSON.stringify({ test_run_id: testRunId }),
        JSON.stringify({ name: "Phase 2 Approved Club", canonical_type: "club" })
      ]
    );

    const review = await pool.query<{ id: string }>(
      `
        INSERT INTO venue_review_items (
          provider_record_id,
          venue_id,
          market_id,
          proposed_changes
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb)
        RETURNING id
      `,
      [
        record.rows[0]?.id,
        venueId,
        marketId,
        JSON.stringify({
          test_run_id: testRunId,
          name: "Phase 2 Approved Club",
          canonical_type: "club"
        })
      ]
    );

    await request(app)
      .post(`/api/v1/admin/venue-review-items/${review.rows[0]?.id}/approve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ note: "Looks licensed and matched." })
      .expect(200);

    const approvedVenue = await pool.query<{ name: string; canonical_type: string }>(
      "select name, canonical_type from venues where id = $1::uuid",
      [venueId]
    );
    expect(approvedVenue.rows[0]).toEqual({
      name: "Phase 2 Approved Club",
      canonical_type: "club"
    });

    const rejectRecord = await pool.query<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status
        )
        VALUES (
          'foursquare',
          $1,
          'venue',
          $2::uuid,
          $3::uuid,
          $4::jsonb,
          $5::jsonb,
          0.42,
          'candidate'
        )
        RETURNING id
      `,
      [
        `phase2-provider-${randomUUID()}`,
        marketId,
        venueId,
        JSON.stringify({ test_run_id: testRunId }),
        JSON.stringify({ name: "Should Not Apply" })
      ]
    );
    const rejectReview = await pool.query<{ id: string }>(
      `
        INSERT INTO venue_review_items (
          provider_record_id,
          venue_id,
          market_id,
          proposed_changes
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb)
        RETURNING id
      `,
      [
        rejectRecord.rows[0]?.id,
        venueId,
        marketId,
        JSON.stringify({ test_run_id: testRunId, name: "Should Not Apply" })
      ]
    );

    await request(app)
      .post(`/api/v1/admin/venue-review-items/${rejectReview.rows[0]?.id}/reject`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "Wrong venue." })
      .expect(200);

    const rejectedVenue = await pool.query<{ name: string }>(
      "select name from venues where id = $1::uuid",
      [venueId]
    );
    expect(rejectedVenue.rows[0]?.name).toBe("Phase 2 Approved Club");

    const audit = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_logs
        WHERE action IN ('venue_review.approved', 'venue_review.rejected')
          AND actor_user_id IN (
            SELECT id FROM users WHERE auth_user_id = $1::uuid
          )
      `,
      [admin.authUserId]
    );
    expect(Number(audit.rows[0]?.count)).toBeGreaterThanOrEqual(2);
  });

  it("validates licensed assets and exposes approved image/event data to consumers", async () => {
    const admin = await createAdminUser();
    const consumer = await createEligibleUser();
    const marketId = await getSfMarketId();
    const venueId = await createTempVenue(marketId, "Licensed Asset Venue", {
      source: "manual",
      metadata: { neighborhood: "SoMa" }
    });

    const invalidAsset = await request(app)
      .post("/api/v1/admin/venue-assets")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        venue_id: venueId,
        url: "https://cdn.example.com/nightloop/venue.jpg"
      })
      .expect(400);
    expect(invalidAsset.body.error.code).toBe("VALIDATION_ERROR");

    await request(app)
      .post("/api/v1/admin/venue-assets")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        venue_id: venueId,
        asset_type: "image",
        url: "https://cdn.example.com/nightloop/venue.jpg",
        alt_text: "Dance floor at Phase 2 Asset Venue",
        credit_text: "Nightloop licensed test image",
        credit_url: "https://example.com/license",
        license_name: "Manual commercial license",
        license_url: "https://example.com/license",
        rights_status: "licensed",
        source: testRunId,
        is_approved: true
      })
      .expect(201);

    const eventStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await request(app)
      .post("/api/v1/admin/events/import")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        events: [
          {
            venue_id: venueId,
            title: "Phase 2 Manual Event",
            starts_at: eventStartsAt,
            source: "manual",
            source_event_id: `phase2-${testRunId}`,
            url: "https://example.com/events/phase-2",
            metadata: { test_run_id: testRunId },
            is_approved: true
          }
        ]
      })
      .expect(200);

    const venue = await request(app)
      .get(`/api/v1/venues/${venueId}`)
      .set("Authorization", `Bearer ${consumer.token}`)
      .expect(200);

    expect(venue.body.venue.image.url).toBe("https://cdn.example.com/nightloop/venue.jpg");
    expect(venue.body.venue.assets[0]).toEqual(
      expect.objectContaining({
        license_name: "Manual commercial license",
        rights_status: "licensed"
      })
    );
    expect(venue.body.venue.event.title).toBe("Phase 2 Manual Event");
  });

  it("lists and updates moderation reports through admin APIs", async () => {
    const admin = await createAdminUser();
    const consumer = await createEligibleUser();

    const reporter = await pool.query<{ id: string }>(
      "select id from users where auth_user_id = $1::uuid",
      [consumer.authUserId]
    );

    const report = await pool.query<{ id: string }>(
      `
        INSERT INTO moderation_reports (
          reporter_user_id,
          target_type,
          target_id,
          reason,
          details
        )
        VALUES ($1::uuid, 'venue', $2, 'bad_data', $3::jsonb)
        RETURNING id
      `,
      [reporter.rows[0]?.id, randomUUID(), JSON.stringify({ test_run_id: testRunId })]
    );

    const list = await request(app)
      .get("/api/v1/admin/moderation-reports?status=open")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(list.body.items.some((item: { id: string }) => item.id === report.rows[0]?.id)).toBe(true);

    const patched = await request(app)
      .patch(`/api/v1/admin/moderation-reports/${report.rows[0]?.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "resolved" })
      .expect(200);

    expect(patched.body.report.status).toBe("resolved");
  });

  it("blocks Resident Advisor production ingestion and reviewer seeding without env config", async () => {
    const admin = await createAdminUser();
    const marketId = await getSfMarketId();

    const ra = await request(app)
      .post("/api/v1/admin/provider-import-runs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        provider: "resident_advisor",
        market_id: marketId,
        mode: "live"
      })
      .expect(409);
    expect(ra.body.error.code).toBe("PROVIDER_DISABLED");

    const status = await request(app)
      .get("/api/v1/admin/reviewer-account/status")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200);
    expect(status.body.configured).toBe(false);

    const seed = await request(app)
      .post("/api/v1/admin/reviewer-account/seed")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(409);
    expect(seed.body.error.code).toBe("REVIEWER_AUTH_USER_ID_MISSING");
  });
});
