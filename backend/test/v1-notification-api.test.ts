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
import {
  type ApnsRequest,
  ApnsNotificationSender,
  enqueueRoomNotification,
  roomNotificationCopy
} from "../src/services/v1/notificationService";

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

type TestUser = {
  authUserId: string;
  token: string;
};

type TestProfile = TestUser & {
  userId: string;
  username: string;
};

class TestJwksServer {
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;
  private server!: Server;

  readonly issuer = "https://nightloop-notifications.test/auth/v1";

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
    this.publicJwk.kid = "phase-6d-notification-test-key";
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
      .setProtectedHeader({ alg: "ES256", kid: "phase-6d-notification-test-key" })
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

describe("Nightloop v1 notification API", () => {
  const authUserIds: string[] = [];
  const testRunId = randomUUID();
  let jwks: TestJwksServer;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let productionApp: ReturnType<typeof createApp>;

  const authAdmin: AuthAdminClient = {
    async deleteUser(): Promise<void> {}
  };

  async function createTestUser(): Promise<TestUser> {
    const authUserId = randomUUID();
    authUserIds.push(authUserId);
    return {
      authUserId,
      token: await jwks.sign(authUserId)
    };
  }

  async function createEligibleProfile(displayName: string, usernamePrefix: string): Promise<TestProfile> {
    const user = await createTestUser();
    const username = `${usernamePrefix}_${testRunId.replace(/-/g, "").slice(0, 8)}`;
    await request(app)
      .post("/api/v1/me/age-attestation")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ is_21_or_over: true })
      .expect(200);
    const profile = await request(app)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ display_name: displayName, username })
      .expect(200);
    await request(app)
      .put("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        vibe: ["dance", "cocktails", "live"],
        music: ["house", "hiphop", "jazz"],
        crowd: ["locals", "twenties", "packed"],
        neighborhoods: ["soma", "mission", "north-beach"]
      })
      .expect(200);

    return {
      ...user,
      userId: profile.body.user.id,
      username
    };
  }

  async function getSfMarketId(): Promise<string> {
    const result = await pool.query<{ id: string }>("select id from markets where slug = 'san-francisco'");
    const row = result.rows[0];
    if (!row) {
      throw new Error("Expected SF market seed to exist.");
    }
    return row.id;
  }

  async function requestAndAccept(requester: TestProfile, addressee: TestProfile): Promise<void> {
    const requestResponse = await request(app)
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${requester.token}`)
      .send({ user_id: addressee.userId })
      .expect(201);

    await request(app)
      .post(`/api/v1/friends/requests/${requestResponse.body.friendship.id}/accept`)
      .set("Authorization", `Bearer ${addressee.token}`)
      .expect(200);
  }

  function createSession(creator: TestProfile, marketId: string, invitedUserIds: string[] = []) {
    return request(app)
      .post("/api/v1/decision-sessions")
      .set("Authorization", `Bearer ${creator.token}`)
      .send({
        market_id: marketId,
        invited_user_ids: invitedUserIds
      });
  }

  beforeAll(async () => {
    jwks = new TestJwksServer();
    await jwks.start();

    const config = {
      ...loadConfig(),
      env: "test" as const,
      supabaseJwtIssuer: jwks.issuer,
      supabaseJwksUrl: jwks.jwksUrl,
      notificationDeliveryMode: "mock" as const
    };

    pool = new Pool({ connectionString: config.databaseUrl });
    app = createApp({ config, authAdmin });
    productionApp = createApp({ config: { ...config, env: "production" }, authAdmin });
  });

  afterAll(async () => {
    if (authUserIds.length > 0) {
      await pool.query(
        `
          delete from signals
          where user_id in (
            select id from users where auth_user_id = any($1::uuid[])
          )
        `,
        [authUserIds]
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

  it("registers and revokes device tokens without returning raw token material", async () => {
    const user = await createEligibleProfile("Token Owner", "token_owner");
    const token = "a".repeat(64);

    const registered = await request(app)
      .post("/api/v1/me/device-tokens")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        token,
        apns_environment: "sandbox",
        app_version: "1.0",
        build_number: "42"
      })
      .expect(201);

    expect(registered.body.device_token).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        user_id: user.userId,
        platform: "ios",
        apns_environment: "sandbox",
        app_version: "1.0",
        build_number: "42",
        revoked_at: null
      })
    );
    expect(registered.body.device_token).not.toHaveProperty("token_value");
    expect(registered.body.device_token).not.toHaveProperty("token_hash");
    expect(JSON.stringify(registered.body)).not.toContain(token);

    const revoked = await request(app)
      .delete("/api/v1/me/device-tokens")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ token })
      .expect(200);

    expect(revoked.body).toEqual({ revoked_count: 1 });
    expect(JSON.stringify(revoked.body)).not.toContain(token);
  }, 120000);

  it("moves an active device token to the latest registering account", async () => {
    const firstUser = await createEligibleProfile("First Token Owner", "first_token");
    const secondUser = await createEligibleProfile("Second Token Owner", "second_token");
    const token = "c".repeat(64);

    const firstRegistered = await request(app)
      .post("/api/v1/me/device-tokens")
      .set("Authorization", `Bearer ${firstUser.token}`)
      .send({ token, apns_environment: "sandbox" })
      .expect(201);

    const secondRegistered = await request(app)
      .post("/api/v1/me/device-tokens")
      .set("Authorization", `Bearer ${secondUser.token}`)
      .send({ token, apns_environment: "sandbox" })
      .expect(201);

    expect(JSON.stringify(firstRegistered.body)).not.toContain(token);
    expect(JSON.stringify(secondRegistered.body)).not.toContain(token);
    expect(firstRegistered.body.device_token).not.toHaveProperty("token_value");
    expect(firstRegistered.body.device_token).not.toHaveProperty("token_hash");
    expect(secondRegistered.body.device_token).not.toHaveProperty("token_value");
    expect(secondRegistered.body.device_token).not.toHaveProperty("token_hash");

    const rows = await pool.query<{
      user_id: string;
      active_count: string;
      revoked_count: string;
    }>(
      `
        select
          user_id,
          count(*) filter (where revoked_at is null)::text as active_count,
          count(*) filter (where revoked_at is not null)::text as revoked_count
        from user_device_tokens
        where token_value = $1
          and apns_environment = 'sandbox'
          and user_id = any($2::uuid[])
        group by user_id
      `,
      [token, [firstUser.userId, secondUser.userId]]
    );

    const countsByUser = new Map(rows.rows.map((row) => [row.user_id, row]));
    expect(countsByUser.get(firstUser.userId)).toEqual(
      expect.objectContaining({
        active_count: "0",
        revoked_count: "1"
      })
    );
    expect(countsByUser.get(secondUser.userId)).toEqual(
      expect.objectContaining({
        active_count: "1",
        revoked_count: "0"
      })
    );
  }, 120000);

  it("builds direct APNs requests without exposing credentials", async () => {
    const requests: ApnsRequest[] = [];
    const sender = new ApnsNotificationSender({
      ...loadConfig(),
      notificationDeliveryMode: "apns",
      apnsTeamId: "TEAMID1234",
      apnsKeyId: "KEYID1234",
      apnsPrivateKey: "-----BEGIN PRIVATE KEY-----\nPRIVATE KEY TEST MATERIAL\n-----END PRIVATE KEY-----",
      apnsBundleId: "com.nightloop.app",
      apnsEnvironment: "sandbox"
    }, async (request) => {
      requests.push(request);
      return { status: 200, body: "{\"reason\":\"Success\"}" };
    }, async () => "test.apns.jwt");
    const sessionId = randomUUID();
    const token = "d".repeat(64);

    const result = await sender.send({
      tokens: [{
        id: randomUUID(),
        user_id: randomUUID(),
        platform: "ios",
        token_hash: "not-returned",
        token_value: token,
        apns_environment: "sandbox",
        app_version: "1.0",
        build_number: "42",
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }],
      copy: "your shortlist is ready",
      route: {
        type: "decision_session",
        session_id: sessionId
      },
      category: "shortlist_ready"
    });

    expect(result).toEqual({ delivered_count: 1, delivery_mode: "apns" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual(
      expect.objectContaining({
        authority: "api.sandbox.push.apple.com",
        path: `/3/device/${token}`,
        headers: expect.objectContaining({
          "apns-topic": "com.nightloop.app",
          "apns-push-type": "alert",
          "apns-priority": "10",
          authorization: "bearer test.apns.jwt"
        })
      })
    );
    expect(JSON.parse(requests[0].body)).toEqual({
      aps: {
        alert: { title: "nightloop", body: "your shortlist is ready" },
        sound: "default",
        category: "shortlist_ready"
      },
      route: {
        type: "decision_session",
        session_id: sessionId
      },
      session_id: sessionId
    });
    expect(JSON.stringify(requests)).not.toContain("PRIVATE KEY");
  });

  it("returns default notification preferences and updates room toggles", async () => {
    const user = await createEligibleProfile("Preference Owner", "pref_owner");

    const defaults = await request(app)
      .get("/api/v1/me/notification-preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .expect(200);

    expect(defaults.body.preferences).toEqual(
      expect.objectContaining({
        user_id: user.userId,
        room_invites_enabled: true,
        shortlist_ready_enabled: true,
        final_plan_locked_enabled: true,
        room_messages_enabled: true
      })
    );

    const updated = await request(app)
      .patch("/api/v1/me/notification-preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        room_invites_enabled: false,
        room_messages_enabled: false
      })
      .expect(200);

    expect(updated.body.preferences).toEqual(
      expect.objectContaining({
        room_invites_enabled: false,
        shortlist_ready_enabled: true,
        final_plan_locked_enabled: true,
        room_messages_enabled: false
      })
    );
  }, 120000);

  it("hides the dev room notification route in production", async () => {
    const user = await createEligibleProfile("Production Guard", "prod_guard");

    const response = await request(productionApp)
      .post("/api/v1/dev/notifications/room-test")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        session_id: randomUUID(),
        category: "room_invite"
      })
      .expect(404);

    expect(response.body.error.code).toBe("NOT_FOUND");
  }, 120000);

  it("keeps room notification copy lowercase and venue-free", () => {
    expect(roomNotificationCopy("room_invite", "Maya")).toBe("maya invited you to pick tonight");
    expect(roomNotificationCopy("shortlist_ready")).toBe("your shortlist is ready");
    expect(roomNotificationCopy("final_plan_locked", "Maya")).toBe("the plan is locked");
    expect(roomNotificationCopy("room_message", "Alex")).toBe("alex sent a room message");

    for (const copy of [
      roomNotificationCopy("room_invite", "Maya"),
      roomNotificationCopy("shortlist_ready"),
      roomNotificationCopy("final_plan_locked"),
      roomNotificationCopy("room_message", "Alex")
    ]) {
      expect(copy).toBe(copy.toLowerCase());
      expect(copy).not.toContain("audio nightclub");
      expect(copy).not.toContain("1015 folsom");
    }
  });

  it("enqueues room notifications only when preferences and block checks allow it", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Notify Host", "notify_host");
    const friend = await createEligibleProfile("Notify Friend", "notify_friend");
    const token = "b".repeat(64);
    await requestAndAccept(host, friend);

    await request(app)
      .post("/api/v1/me/device-tokens")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ token, apns_environment: "sandbox" })
      .expect(201);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;

    const queued = await enqueueRoomNotification(sessionId, friend.userId, "room_invite", "Notify Host", {
      ...loadConfig(),
      notificationDeliveryMode: "mock"
    });
    expect(queued).toEqual(
      expect.objectContaining({
        queued_count: 1,
        copy: "notify host invited you to pick tonight",
        route: {
          type: "decision_session",
          session_id: sessionId
        },
        delivery_mode: "mock"
      })
    );
    expect(JSON.stringify(queued)).not.toContain(token);

    await request(app)
      .patch("/api/v1/me/notification-preferences")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ room_invites_enabled: false })
      .expect(200);
    const disabled = await enqueueRoomNotification(sessionId, friend.userId, "room_invite", "Notify Host", {
      ...loadConfig(),
      notificationDeliveryMode: "mock"
    });
    expect(disabled).toEqual(
      expect.objectContaining({
        queued_count: 0,
        skipped_reason: "preference_disabled"
      })
    );

    await request(app)
      .patch("/api/v1/me/notification-preferences")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ room_invites_enabled: true })
      .expect(200);
    await request(app)
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ user_id: host.userId })
      .expect(201);

    const blocked = await enqueueRoomNotification(sessionId, friend.userId, "room_invite", "Notify Host", {
      ...loadConfig(),
      notificationDeliveryMode: "mock"
    });
    expect(blocked).toEqual(
      expect.objectContaining({
        queued_count: 0,
        skipped_reason: "blocked_room_member"
      })
    );
  }, 120000);
});
