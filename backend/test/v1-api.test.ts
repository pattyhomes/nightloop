import { randomUUID } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import path from "path";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadDotenv } from "dotenv";
import { createApp, type AuthAdminClient } from "../src/app";
import { loadConfig } from "../src/lib/config";

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
    this.publicJwk.kid = "phase-1-test-key";
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
      .setProtectedHeader({ alg: "ES256", kid: "phase-1-test-key" })
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

describe("Nightloop v1 API", () => {
  const authUserIds: string[] = [];
  const deletedAuthUserIds: string[] = [];
  const testRunId = randomUUID();
  let jwks: TestJwksServer;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  const authAdmin: AuthAdminClient = {
    async deleteUser(authUserId: string): Promise<void> {
      deletedAuthUserIds.push(authUserId);
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

  async function attestEligible(user: TestUser): Promise<void> {
    await request(app)
      .post("/api/v1/me/age-attestation")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ is_21_or_over: true })
      .expect(200);
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

  async function getFirstSfVenue(): Promise<{ id: string; latitude: number; longitude: number }> {
    const result = await pool.query<{ id: string; latitude: number; longitude: number }>(
      `
        select v.id, v.latitude, v.longitude
        from venues v
        join markets m on m.id = v.market_id
        where m.slug = 'san-francisco'
        order by v.name
        limit 1
      `
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Expected SF venue seed to exist.");
    }
    return row;
  }

  async function getFirstSfVenueId(): Promise<string> {
    return (await getFirstSfVenue()).id;
  }

  beforeAll(async () => {
    jwks = new TestJwksServer();
    await jwks.start();

    const config = {
      ...loadConfig(),
      env: "test" as const,
      supabaseJwtIssuer: jwks.issuer,
      supabaseJwksUrl: jwks.jwksUrl
    };

    pool = new Pool({ connectionString: config.databaseUrl });
    app = createApp({ config, authAdmin });
  });

  afterAll(async () => {
    if (authUserIds.length > 0) {
      await pool.query(
        `
          delete from signals
          where user_id in (
            select id from users where auth_user_id = any($1::uuid[])
          )
          or payload->>'test_run_id' = $2
        `,
        [authUserIds, testRunId]
      );
      await pool.query(
        `
          delete from audit_logs
          where actor_user_id in (
            select id from users where auth_user_id = any($1::uuid[])
          )
          or target_user_id in (
            select id from users where auth_user_id = any($1::uuid[])
          )
        `,
        [authUserIds]
      );
      await pool.query("delete from users where auth_user_id = any($1::uuid[])", [authUserIds]);
    }

    await pool.end();
    await jwks.stop();
  });

  it("rejects missing and invalid JWTs with the v1 error envelope", async () => {
    const missing = await request(app).get("/api/v1/me").expect(401);
    expect(missing.body).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Authorization bearer token is required."
      }
    });

    const invalid = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer not-a-real-token")
      .expect(401);
    expect(invalid.body.error.code).toBe("AUTH_INVALID");
  });

  it("creates and returns the current user account state from a valid Supabase JWT", async () => {
    const user = await createTestUser();

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);

    expect(response.body.user.auth_user_id).toBe(user.authUserId);
    expect(response.body.user.eligibility_status).toBe("unknown");
    expect(response.body.profile.username).toMatch(/^nl_[a-f0-9]{12}$/);
    expect(response.body.settings.ghost_mode).toBe(false);
    expect(response.body.onboarding.status).toBe("incomplete");
  });

  it("blocks app feature access for users who attest they are not eligible", async () => {
    const user = await createTestUser();
    const marketId = await getSfMarketId();

    const attestation = await request(app)
      .post("/api/v1/me/age-attestation")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ is_21_or_over: false })
      .expect(200);

    expect(attestation.body.user.eligibility_status).toBe("ineligible");

    const blocked = await request(app)
      .get(`/api/v1/venues?market_id=${marketId}`)
      .set("Authorization", `Bearer ${user.token}`)
      .expect(403);

    expect(blocked.body.error.code).toBe("ELIGIBILITY_REQUIRED");
  });

  it("validates profile updates and enforces username uniqueness", async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    await attestEligible(first);
    await attestEligible(second);
    const username = `phase1_${testRunId.replace(/-/g, "").slice(0, 10)}`;

    const profile = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${first.token}`)
      .send({ display_name: "Phase One", username })
      .expect(200);

    expect(profile.body.profile.display_name).toBe("Phase One");
    expect(profile.body.profile.username).toBe(username);

    const invalid = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${second.token}`)
      .send({ display_name: "Phase Two", username: "No Spaces" })
      .expect(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const duplicate = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${second.token}`)
      .send({ display_name: "Phase Two", username })
      .expect(409);
    expect(duplicate.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("validates and persists onboarding preferences", async () => {
    const user = await createTestUser();
    await attestEligible(user);

    const incomplete = await request(app)
      .put("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ vibe: ["dance", "queer"] })
      .expect(400);
    expect(incomplete.body.error.code).toBe("VALIDATION_ERROR");

    const preferences = {
      vibe: ["dance", "queer", "wild"],
      music: ["house", "hiphop", "afro"],
      crowd: ["locals", "twenties", "queer"],
      neighborhoods: ["mission", "soma", "castro"]
    };

    const saved = await request(app)
      .put("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .send(preferences)
      .expect(200);

    expect(saved.body.preferences).toEqual(preferences);

    const fetched = await request(app)
      .get("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);
    expect(fetched.body.preferences).toEqual(preferences);
  });

  it("anonymizes account data and calls the server-side auth deletion client", async () => {
    const user = await createTestUser();
    await attestEligible(user);
    const username = `delete_${testRunId.replace(/-/g, "").slice(0, 10)}`;

    await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ display_name: "Delete Me", username })
      .expect(200);

    await request(app)
      .delete("/api/v1/me/account")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(202);

    expect(deletedAuthUserIds).toContain(user.authUserId);

    const result = await pool.query<{
      deleted_at: string | null;
      display_name: string;
      username: string;
      settings_count: string;
    }>(
      `
        select
          u.deleted_at,
          p.display_name,
          p.username,
          (select count(*) from user_settings s where s.user_id = u.id) as settings_count
        from users u
        join user_profiles p on p.user_id = u.id
        where u.auth_user_id = $1::uuid
      `,
      [user.authUserId]
    );

    expect(result.rows[0]?.deleted_at).not.toBeNull();
    expect(result.rows[0]?.display_name).toBe("Deleted User");
    expect(result.rows[0]?.username).toMatch(/^deleted_/);
    expect(Number(result.rows[0]?.settings_count)).toBe(0);
  });

  it("returns public market discovery data", async () => {
    const response = await request(app).get("/api/v1/markets").expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "san-francisco",
          short_label: "SF",
          launch_status: "active"
        })
      ])
    );
  });

  it("returns authenticated venue feed data for eligible users", async () => {
    const user = await createTestUser();
    await attestEligible(user);
    const marketId = await getSfMarketId();

    await request(app)
      .get("/api/v1/venues")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(400);

    const response = await request(app)
      .get(`/api/v1/venues?market_id=${marketId}&limit=5`)
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);

    expect(response.body.market.id).toBe(marketId);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        market_id: marketId,
        coordinate: {
          latitude: expect.any(Number),
          longitude: expect.any(Number)
        },
        pulse: expect.objectContaining({
          level: expect.any(Number),
          label: expect.any(String),
          score: expect.any(Number)
        })
      })
    );
    expect(response.body.counts.all).toBeGreaterThan(0);
  });

  it("stores user signals with design-default points and a server-side expiry", async () => {
    const user = await createTestUser();
    await attestEligible(user);
    const venue = await getFirstSfVenue();

    const packed = await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        venue_id: venue.id,
        kind: "packed",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    expect(packed.body.points_awarded).toBe(3);
    expect(packed.body.new_signal_scout_points).toBe(3);

    const liveEvent = await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        venue_id: venue.id,
        kind: "event_live",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    expect(liveEvent.body.points_awarded).toBe(4);
    expect(liveEvent.body.new_signal_scout_points).toBe(7);

    const result = await pool.query<{
      kind: string;
      points_awarded: number;
      expires_at: string;
    }>(
      `
        select kind, points_awarded, expires_at
        from signals
        where payload->>'test_run_id' = $1
        order by created_at
      `,
      [testRunId]
    );

    expect(result.rows.map((row) => row.kind)).toEqual(["packed", "event_live"]);
    expect(result.rows.map((row) => Number(row.points_awarded))).toEqual([3, 4]);
    expect(Date.parse(result.rows[0]?.expires_at ?? "")).toBeGreaterThan(Date.now() + 80 * 60 * 1000);
  });

  it("requires proximity verification for user signals without storing raw coordinates", async () => {
    const user = await createTestUser();
    await attestEligible(user);
    const venue = await getFirstSfVenue();

    const missing = await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ venue_id: venue.id, kind: "packed", metadata: { test_run_id: testRunId } })
      .expect(403);
    expect(missing.body.error.code).toBe("SIGNAL_LOCATION_REQUIRED");

    const far = await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        venue_id: venue.id,
        kind: "packed",
        location: { latitude: venue.latitude + 0.02, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(403);
    expect(far.body.error.code).toBe("SIGNAL_TOO_FAR");

    const accepted = await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        venue_id: venue.id,
        kind: "short_line",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: {
          test_run_id: testRunId,
          location: { latitude: venue.latitude, longitude: venue.longitude },
          nested: { coordinates: [venue.latitude, venue.longitude], note: "kept" }
        }
      })
      .expect(201);
    expect(accepted.body.points_awarded).toBe(2);

    const result = await pool.query<{ payload: Record<string, unknown> }>(
      `
        select payload
        from signals
        where payload->>'test_run_id' = $1
          and kind = 'short_line'
        order by created_at desc
        limit 1
      `,
      [testRunId]
    );

    expect(result.rows[0]?.payload).toMatchObject({
      proximity_verified: true,
      proximity_radius_meters: 200,
      proximity_bucket: "at_venue"
    });
    expect(JSON.stringify(result.rows[0]?.payload)).not.toContain("latitude");
    expect(JSON.stringify(result.rows[0]?.payload)).not.toContain("longitude");
    expect(JSON.stringify(result.rows[0]?.payload)).not.toContain("coordinates");
    expect(result.rows[0]?.payload).toMatchObject({ nested: { note: "kept" } });
  });

  it("returns only the current user's recent signals with a capped limit", async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    await attestEligible(first);
    await attestEligible(second);
    const venue = await getFirstSfVenue();

    const empty = await request(app)
      .get("/api/v1/me/signals")
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);
    expect(empty.body.items).toEqual([]);

    await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${first.token}`)
      .send({
        venue_id: venue.id,
        kind: "packed",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${first.token}`)
      .send({
        venue_id: venue.id,
        kind: "short_line",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${second.token}`)
      .send({
        venue_id: venue.id,
        kind: "event_live",
        location: { latitude: venue.latitude, longitude: venue.longitude },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    const unauthorized = await request(app).get("/api/v1/me/signals").expect(401);
    expect(unauthorized.body.error.code).toBe("AUTH_REQUIRED");

    const recent = await request(app)
      .get("/api/v1/me/signals?limit=1")
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);

    expect(recent.body.items).toHaveLength(1);
    expect(recent.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        venue_id: venue.id,
        venue_name: expect.any(String),
        venue_neighborhood: expect.any(String),
        kind: "short_line",
        points_awarded: 2,
        observed_at: expect.any(String)
      })
    );

    const capped = await request(app)
      .get("/api/v1/me/signals?limit=50")
      .set("Authorization", `Bearer ${first.token}`)
      .expect(200);
    expect(capped.body.items.length).toBeLessThanOrEqual(20);
  });
});
