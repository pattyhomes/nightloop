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

type TestProfile = TestUser & {
  userId: string;
  username: string;
};

class TestJwksServer {
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;
  private server!: Server;

  readonly issuer = "https://nightloop-decision.test/auth/v1";

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
    this.publicJwk.kid = "phase-6b-test-key";
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
      .setProtectedHeader({ alg: "ES256", kid: "phase-6b-test-key" })
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

describe("Nightloop v1 decision sessions API", () => {
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
    const result = await pool.query<{ id: string }>(
      "select id from markets where slug = 'san-francisco'"
    );
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
      supabaseJwksUrl: jwks.jwksUrl
    };

    pool = new Pool({ connectionString: config.databaseUrl });
    app = createApp({ config, authAdmin });
  });

  afterAll(async () => {
    if (await tableExists("decision_sessions")) {
      await pool.query(
        "delete from decision_sessions where metadata->>'test_run_id' = $1",
        [testRunId]
      );
    }
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

  it("creates a private fixed 12-venue slate with safe candidate payloads", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Decision Host", "decision_host");
    const friend = await createEligibleProfile("Decision Friend", "decision_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);

    expect(created.body.session.status).toBe("active");
    expect(created.body.session.member_counts).toEqual({ joined: 1, invited: 1 });
    expect(created.body.session.code).toMatch(/^ND-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(created.body.candidates).toHaveLength(12);
    expect(created.body.candidates[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        original_rank: 1,
        in_count: 0,
        skip_count: 0,
        viewer_vote: null,
        group_fit_member_count: 1
      })
    );
    expect(created.body.candidates[0].venue).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        friend_summary: expect.any(Object),
        liveness: expect.any(Object)
      })
    );
    expect(JSON.stringify(created.body)).not.toContain("raw_payload");
    expect(JSON.stringify(created.body)).not.toContain("provider_records");
    expect(JSON.stringify(created.body)).not.toContain("google_place_details");
  }, 120000);

  it("allows invited or friend-code joins, keeps aggregate votes anonymous, and computes a soft leader", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Vote Host", "vote_host");
    const invited = await createEligibleProfile("Vote Invited", "vote_invited");
    const codeFriend = await createEligibleProfile("Vote Code", "vote_code");
    const stranger = await createEligibleProfile("Vote Stranger", "vote_stranger");
    await requestAndAccept(host, invited);
    await requestAndAccept(host, codeFriend);

    const created = await createSession(host, marketId, [invited.userId]).expect(201);
    const sessionId = created.body.session.id;
    const code = created.body.session.code;
    const firstCandidateId = created.body.candidates[0].id;
    const secondCandidateId = created.body.candidates[1].id;

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({ code })
      .expect(403);

    const invitedJoin = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${invited.token}`)
      .send({})
      .expect(200);
    expect(invitedJoin.body.session.member_counts.joined).toBe(2);
    expect(invitedJoin.body.candidates[0].group_fit_member_count).toBe(2);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${codeFriend.token}`)
      .send({ code })
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: firstCandidateId, vote: "in" })
      .expect(200);
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${invited.token}`)
      .send({ candidate_id: firstCandidateId, vote: "in" })
      .expect(200);
    const voted = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${codeFriend.token}`)
      .send({ candidate_id: secondCandidateId, vote: "skip" })
      .expect(200);

    const first = voted.body.candidates.find((candidate: { id: string }) => candidate.id === firstCandidateId);
    const second = voted.body.candidates.find((candidate: { id: string }) => candidate.id === secondCandidateId);
    expect(first.in_count).toBe(2);
    expect(first.viewer_vote).toBeNull();
    expect(second.skip_count).toBe(1);
    expect(second.viewer_vote).toBe("skip");
    expect(voted.body.leader.id).toBe(firstCandidateId);
    expect(JSON.stringify(voted.body)).not.toContain("voter_user_id");
    expect(JSON.stringify(voted.body)).not.toContain(invited.userId);
  }, 120000);

  it("enforces blocks, code revocation, and ended-session write locks", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Lock Host", "lock_host");
    const friend = await createEligibleProfile("Lock Friend", "lock_friend");
    const blocked = await createEligibleProfile("Lock Blocked", "lock_blocked");
    await requestAndAccept(host, friend);
    await requestAndAccept(host, blocked);

    const created = await createSession(host, marketId).expect(201);
    const sessionId = created.body.session.id;
    const code = created.body.session.code;
    const candidateId = created.body.candidates[0].id;

    await request(app)
      .post("/api/v1/friends/blocks")
      .set("Authorization", `Bearer ${host.token}`)
      .send({ user_id: blocked.userId })
      .expect(201);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${blocked.token}`)
      .send({ code })
      .expect(403);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/revoke-code`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ code })
      .expect(403);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/end`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: candidateId, vote: "in" })
      .expect(409);
  }, 120000);

  it("cleans decision session memberships and votes during account deletion", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Delete Host", "delete_host");
    const friend = await createEligibleProfile("Delete Member", "delete_member");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    const candidateId = created.body.candidates[0].id;
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(200);
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ candidate_id: candidateId, vote: "in" })
      .expect(200);

    await request(app)
      .delete("/api/v1/me/account")
      .set("Authorization", `Bearer ${friend.token}`)
      .expect(202);

    const counts = await pool.query<{
      memberships: string;
      votes: string;
      sessions: string;
    }>(
      `
        select
          (select count(*)::text from decision_session_members where user_id = $1::uuid) as memberships,
          (select count(*)::text from decision_votes where user_id = $1::uuid) as votes,
          (select count(*)::text from decision_sessions where creator_user_id = $1::uuid) as sessions
      `,
      [friend.userId]
    );
    expect(counts.rows[0]).toEqual({ memberships: "0", votes: "0", sessions: "0" });
    expect(deletedAuthUserIds).toContain(friend.authUserId);
  }, 120000);
});
