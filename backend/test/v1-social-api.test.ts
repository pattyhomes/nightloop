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

  readonly issuer = "https://nightloop-social.test/auth/v1";

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
    this.publicJwk.kid = "phase-6a-test-key";
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
      .setProtectedHeader({ alg: "ES256", kid: "phase-6a-test-key" })
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

describe("Nightloop v1 social API", () => {
  const authUserIds: string[] = [];
  const testRunId = randomUUID();
  let jwks: TestJwksServer;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let productionApp: ReturnType<typeof createApp>;
  let failingDevResetApp: ReturnType<typeof createApp>;
  const createdDevAuthUsers: Array<{ id: string; email?: string }> = [];

  const authAdmin: AuthAdminClient = {
    async deleteUser(): Promise<void> {},
    async createConfirmedEmailUser(input): Promise<{ id: string; email?: string }> {
      const suffix = input.email.includes("test@dev.com")
        ? "00000000-0000-4000-8000-00000000d001"
        : randomUUID();
      const user = { id: suffix, email: input.email.toLowerCase() };
      createdDevAuthUsers.push(user);
      authUserIds.push(user.id);
      return user;
    }
  };

  async function tableExists(tableName: string): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      "select to_regclass($1) is not null as exists",
      [`public.${tableName}`]
    );
    return result.rows[0]?.exists === true;
  }

  async function createTestUser(): Promise<TestUser> {
    const authUserId = randomUUID();
    authUserIds.push(authUserId);
    return {
      authUserId,
      token: await jwks.sign(authUserId)
    };
  }

  async function createEligibleProfile(
    displayName: string,
    username: string
  ): Promise<TestUser & { userId: string; username: string }> {
    const user = await createTestUser();
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

    return {
      ...user,
      userId: profile.body.user.id,
      username
    };
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

  async function getSfVenues(): Promise<Array<{ id: string; latitude: number; longitude: number }>> {
    const result = await pool.query<{ id: string; latitude: number; longitude: number }>(
      `
        select v.id, v.latitude, v.longitude
        from venues v
        join markets m on m.id = v.market_id
        where m.slug = 'san-francisco'
          and v.is_active = true
          and v.admin_status = 'approved'
        order by v.name
        limit 2
      `
    );
    if (result.rows.length < 2) {
      throw new Error("Expected at least two SF venues.");
    }
    return result.rows;
  }

  async function requestAndAccept(requester: TestUser, addressee: TestUser & { userId: string }): Promise<string> {
    const requestResponse = await request(app)
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${requester.token}`)
      .send({ user_id: addressee.userId })
      .expect(201);

    await request(app)
      .post(`/api/v1/friends/requests/${requestResponse.body.friendship.id}/accept`)
      .set("Authorization", `Bearer ${addressee.token}`)
      .expect(200);

    return requestResponse.body.friendship.id;
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
    productionApp = createApp({ config: { ...config, env: "production" }, authAdmin });
    failingDevResetApp = createApp({
      config,
      authAdmin: {
        async deleteUser(): Promise<void> {},
        async createConfirmedEmailUser(): Promise<{ id: string; email?: string }> {
          throw new Error("Supabase Auth admin failed in local dev.");
        }
      }
    });
  });

  afterAll(async () => {
    if (await tableExists("moderation_reports")) {
      await pool.query("delete from moderation_reports where details->>'test_run_id' = $1", [testRunId]);
    }
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

  it("searches safe profiles, accepts friend requests, and enforces strict block invisibility", async () => {
    const alice = await createEligibleProfile("Alice Phase Six", `alice_${testRunId.slice(0, 8)}`);
    const bob = await createEligibleProfile("Bob Social", `bob_${testRunId.slice(0, 8)}`);

    const search = await request(app)
      .get("/api/v1/friends/search?q=bob&limit=10")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect(search.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bob.userId,
          display_name: "Bob Social",
          username: bob.username,
          friendship_status: "none"
        })
      ])
    );
    expect(JSON.stringify(search.body)).not.toContain("auth_user_id");

    const friendRequest = await request(app)
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ user_id: bob.userId })
      .expect(201);
    expect(friendRequest.body.friendship.status).toBe("pending");
    expect(friendRequest.body.friendship.direction).toBe("outgoing");

    await request(app)
      .post(`/api/v1/friends/requests/${friendRequest.body.friendship.id}/accept`)
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);

    const friends = await request(app)
      .get("/api/v1/friends")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
    expect(friends.body.friends.map((item: { user: { id: string } }) => item.user.id)).toContain(bob.userId);

    await request(app)
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ user_id: bob.userId })
      .expect(201);

    const hidden = await request(app)
      .get("/api/v1/friends/search?q=bob&limit=10")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
    expect(hidden.body.items.map((item: { id: string }) => item.id)).not.toContain(bob.userId);

    await request(app)
      .post("/api/v1/friends/requests")
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ user_id: alice.userId })
      .expect(403);
  });

  it("resets a Supabase-backed dev social crew for simulator walkthroughs", async () => {
    const reset = await request(app)
      .post("/api/v1/dev/social-crew/reset")
      .send({ market: "san-francisco" })
      .expect(200);

    expect(reset.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "chuck",
          email: "test@dev.com",
          username: "chuck",
          display_name: "Chuck",
          role: "primary"
        }),
        expect.objectContaining({
          key: "alex",
          email: "alex@dev.com",
          username: "dev_social_alex"
        })
      ])
    );
    expect(JSON.stringify(reset.body)).not.toContain("NightloopDev1!");
    expect(JSON.stringify(reset.body)).not.toContain("DATABASE_URL");
    expect(createdDevAuthUsers.map((user) => user.email)).toEqual(
      expect.arrayContaining(["test@dev.com", "alex@dev.com", "maya@dev.com", "jules@dev.com", "blocked@dev.com"])
    );

    const chuck = await pool.query<{ id: string; auth_user_id: string }>(
      `
        select u.id, u.auth_user_id
        from users u
        join user_profiles up on up.user_id = u.id
        where up.username = 'chuck'
        limit 1
      `
    );
    expect(chuck.rows[0]?.auth_user_id).toBe("00000000-0000-4000-8000-00000000d001");

    const friends = await pool.query<{ accepted_count: string | number; pending_count: string | number }>(
      `
        select
          count(*) filter (where f.status = 'accepted') as accepted_count,
          count(*) filter (where f.status = 'pending') as pending_count
        from friendships f
        where f.requester_user_id = $1::uuid
           or f.addressee_user_id = $1::uuid
      `,
      [chuck.rows[0]?.id]
    );
    expect(Number(friends.rows[0]?.accepted_count ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(friends.rows[0]?.pending_count ?? 0)).toBeGreaterThanOrEqual(1);
    expect(reset.body.audit.ok).toBe(true);
  }, 120000);

  it("does not expose the dev social crew reset in production", async () => {
    await request(productionApp)
      .post("/api/v1/dev/social-crew/reset")
      .send({ market: "san-francisco" })
      .expect(404);
  });

  it("returns a specific dev reset failure envelope for simulator sign-in debugging", async () => {
    const reset = await request(failingDevResetApp)
      .post("/api/v1/dev/social-crew/reset")
      .send({ market: "san-francisco" })
      .expect(500);

    expect(reset.body.error.code).toBe("DEV_SOCIAL_CREW_RESET_FAILED");
    expect(reset.body.error.message).toContain("Supabase Auth admin failed in local dev.");
    expect(JSON.stringify(reset.body)).not.toContain("DATABASE_URL");
  });

  it("creates revocable expiring invite codes that establish friendships", async () => {
    const host = await createEligibleProfile("Invite Host", `host_${testRunId.slice(0, 8)}`);
    const guest = await createEligibleProfile("Invite Guest", `guest_${testRunId.slice(0, 8)}`);
    const blockedGuest = await createEligibleProfile("Blocked Invite", `blocked_${testRunId.slice(0, 8)}`);

    const invite = await request(app)
      .post("/api/v1/friends/invites")
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(201);
    expect(invite.body.invite.code).toMatch(/^NL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(Date.parse(invite.body.invite.expires_at)).toBeGreaterThan(Date.now());

    await request(app)
      .post("/api/v1/friends/invites/accept")
      .set("Authorization", `Bearer ${guest.token}`)
      .send({ code: invite.body.invite.code })
      .expect(200);

    const guestFriends = await request(app)
      .get("/api/v1/friends")
      .set("Authorization", `Bearer ${guest.token}`)
      .expect(200);
    expect(guestFriends.body.friends.map((item: { user: { id: string } }) => item.user.id)).toContain(host.userId);

    const revoked = await request(app)
      .post("/api/v1/friends/invites")
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(201);
    await request(app)
      .delete(`/api/v1/friends/invites/${revoked.body.invite.id}`)
      .set("Authorization", `Bearer ${host.token}`)
      .expect(200);
    await request(app)
      .post("/api/v1/friends/invites/accept")
      .set("Authorization", `Bearer ${blockedGuest.token}`)
      .send({ code: revoked.body.invite.code })
      .expect(404);
  });

  it("auto-shares sanitized signal activity to friends unless ghost mode is enabled", async () => {
    const alice = await createEligibleProfile("Signal Alice", `sigalice_${testRunId.slice(0, 6)}`);
    const bob = await createEligibleProfile("Signal Bob", `sigbob_${testRunId.slice(0, 6)}`);
    await requestAndAccept(alice, bob);
    const venues = await getSfVenues();

    await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        venue_id: venues[0].id,
        kind: "packed",
        location: {
          latitude: venues[0].latitude,
          longitude: venues[0].longitude
        },
        metadata: { test_run_id: testRunId, location: { latitude: 1, longitude: 2 } },
        details: { wait_minutes: 12, crowd_level: "packed" }
      })
      .expect(201);

    const feed = await request(app)
      .get("/api/v1/friends/activity")
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);
    expect(feed.body.items[0]).toEqual(
      expect.objectContaining({
        type: "signal",
        signal_kind: "packed",
        actor: expect.objectContaining({ id: alice.userId }),
        venue: expect.objectContaining({ id: venues[0].id })
      })
    );
    expect(JSON.stringify(feed.body)).not.toContain("latitude");
    expect(JSON.stringify(feed.body)).not.toContain("wait_minutes");

    await request(app)
      .patch("/api/v1/me/settings")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ ghost_mode: true })
      .expect(200);
    await request(app)
      .post("/api/v1/signals")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        venue_id: venues[1].id,
        kind: "short_line",
        location: {
          latitude: venues[1].latitude,
          longitude: venues[1].longitude
        },
        metadata: { test_run_id: testRunId }
      })
      .expect(201);

    const ghostFeed = await request(app)
      .get("/api/v1/friends/activity")
      .set("Authorization", `Bearer ${bob.token}`)
      .expect(200);
    expect(ghostFeed.body.items.map((item: { venue: { id: string } }) => item.venue.id)).not.toContain(venues[1].id);
  });

  it("supports tonight-only coming intents, replies, and activity reports without changing live signals", async () => {
    const alice = await createEligibleProfile("Coming Alice", `comealice_${testRunId.slice(0, 6)}`);
    const bob = await createEligibleProfile("Coming Bob", `comebob_${testRunId.slice(0, 6)}`);
    await requestAndAccept(alice, bob);
    const [venue] = await getSfVenues();

    const beforeSignals = await pool.query<{ count: string }>("select count(*)::text as count from signals where venue_id = $1::uuid", [venue.id]);
    const coming = await request(app)
      .post(`/api/v1/friends/venues/${venue.id}/coming`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ is_coming: true })
      .expect(201);
    expect(coming.body.activity.type).toBe("coming");
    expect(Date.parse(coming.body.activity.expires_at)).toBeGreaterThan(Date.now());

    const afterSignals = await pool.query<{ count: string }>("select count(*)::text as count from signals where venue_id = $1::uuid", [venue.id]);
    expect(afterSignals.rows[0]?.count).toBe(beforeSignals.rows[0]?.count);

    await request(app)
      .post(`/api/v1/friends/activity/${coming.body.activity.id}/replies`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ kind: "comment", text: "got a booth", details: { test_run_id: testRunId } })
      .expect(201);
    await request(app)
      .post(`/api/v1/friends/activity/${coming.body.activity.id}/replies`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ kind: "emoji_signal", signal_kind: "event_live", details: { test_run_id: testRunId } })
      .expect(201);
    await request(app)
      .post(`/api/v1/friends/activity/${coming.body.activity.id}/replies`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ kind: "comment", text: "x".repeat(141) })
      .expect(400);

    const feed = await request(app)
      .get("/api/v1/friends/activity")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
    const item = feed.body.items.find((activity: { id: string }) => activity.id === coming.body.activity.id);
    expect(item.replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "comment", text: "got a booth" }),
        expect.objectContaining({ type: "emoji_signal", signal_kind: "event_live" })
      ])
    );

    await request(app)
      .post(`/api/v1/friends/activity/${coming.body.activity.id}/report`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ reason: "spam", details: { test_run_id: testRunId } })
      .expect(201);
    const report = await pool.query<{ count: string }>(
      "select count(*)::text as count from moderation_reports where target_type = 'activity' and target_id = $1 and details->>'test_run_id' = $2",
      [coming.body.activity.id, testRunId]
    );
    expect(Number(report.rows[0]?.count ?? 0)).toBe(1);
  });

  it("returns privacy-filtered venue-first friends tonight groups with timeline fallback", async () => {
    const alice = await createEligibleProfile("Tonight Alice", `tonightalice_${testRunId.slice(0, 6)}`);
    const bob = await createEligibleProfile("Tonight Bob", `tonightbob_${testRunId.slice(0, 6)}`);
    const ghost = await createEligibleProfile("Tonight Ghost", `tonightghost_${testRunId.slice(0, 6)}`);
    const blocked = await createEligibleProfile("Tonight Blocked", `tonightblocked_${testRunId.slice(0, 6)}`);
    await requestAndAccept(alice, bob);
    await requestAndAccept(alice, ghost);
    await requestAndAccept(alice, blocked);
    const [venue] = await getSfVenues();

    await request(app)
      .patch("/api/v1/me/settings")
      .set("Authorization", `Bearer ${ghost.token}`)
      .send({ ghost_mode: true })
      .expect(200);
    await request(app)
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ user_id: blocked.userId })
      .expect(201);

    const bobComing = await request(app)
      .post(`/api/v1/friends/venues/${venue.id}/coming`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ is_coming: true })
      .expect(201);
    await request(app)
      .post(`/api/v1/friends/activity/${bobComing.body.activity.id}/replies`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ kind: "comment", text: "I am in.", details: { test_run_id: testRunId } })
      .expect(201);
    await request(app)
      .post(`/api/v1/friends/venues/${venue.id}/coming`)
      .set("Authorization", `Bearer ${ghost.token}`)
      .send({ is_coming: true })
      .expect(201);
    await request(app)
      .post(`/api/v1/friends/venues/${venue.id}/coming`)
      .set("Authorization", `Bearer ${blocked.token}`)
      .send({ is_coming: true })
      .expect(201);

    const tonight = await request(app)
      .get("/api/v1/friends/tonight?limit=10")
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);

    expect(tonight.body.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          venue: expect.objectContaining({ id: venue.id }),
          viewer_has_coming: false,
          cta: expect.objectContaining({ primary: "I'm Coming", can_come: true })
        })
      ])
    );
    const group = tonight.body.groups.find((item: { venue: { id: string } }) => item.venue.id === venue.id);
    expect(group.friends.map((friend: { id: string }) => friend.id)).toContain(bob.userId);
    expect(group.friends.map((friend: { id: string }) => friend.id)).not.toContain(ghost.userId);
    expect(group.friends.map((friend: { id: string }) => friend.id)).not.toContain(blocked.userId);
    expect(group.latest_activity.replies[0].text).toBe("I am in.");
    expect(tonight.body.timeline[0].venue.id).toBe(venue.id);
    expect(JSON.stringify(tonight.body)).not.toContain("latitude");
    expect(JSON.stringify(tonight.body)).not.toContain("raw_payload");
  }, 120000);

  it("includes accepted visible friend summaries in venue payloads", async () => {
    const alice = await createEligibleProfile("Venue Alice", `venuealice_${testRunId.slice(0, 6)}`);
    const bob = await createEligibleProfile("Venue Bob", `venuebob_${testRunId.slice(0, 6)}`);
    await requestAndAccept(alice, bob);
    const [venue] = await getSfVenues();
    const marketId = await getSfMarketId();

    await request(app)
      .post(`/api/v1/friends/venues/${venue.id}/coming`)
      .set("Authorization", `Bearer ${bob.token}`)
      .send({ is_coming: true })
      .expect(201);

    const venues = await request(app)
      .get(`/api/v1/venues?market_id=${marketId}&limit=100`)
      .set("Authorization", `Bearer ${alice.token}`)
      .expect(200);
    const row = venues.body.items.find((item: { id: string }) => item.id === venue.id);
    expect(row.friend_summary).toEqual({
      friends_here_count: 1,
      first_friend_name: "Venue Bob"
    });
    expect(venues.body.counts.friends).toBeGreaterThanOrEqual(1);
  });
});
