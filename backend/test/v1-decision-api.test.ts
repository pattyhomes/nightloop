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

  async function findVenueOutsideSession(marketId: string, candidateVenueIds: string[]): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `
        select id
        from venues
        where market_id = $1::uuid
          and is_active = true
          and admin_status = 'approved'
          and not (id = any($2::uuid[]))
        order by name asc
        limit 1
      `,
      [marketId, candidateVenueIds]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Expected approved venue outside decision slate.");
    }
    return row.id;
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
      .post("/api/v1/decision-sessions/join")
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

  it("supports suggested venues, room messages, final plans, and finalization write locks", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Plan Host", "plan_host");
    const friend = await createEligibleProfile("Plan Friend", "plan_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    const initialCandidateId = created.body.candidates[0].id;
    const suggestedVenueId = await findVenueOutsideSession(
      marketId,
      created.body.candidates.map((candidate: { venue_id: string }) => candidate.venue_id)
    );

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(200);

    const search = await request(app)
      .get(`/api/v1/decision-sessions/${sessionId}/venue-search`)
      .query({ q: "a", limit: 10 })
      .set("Authorization", `Bearer ${friend.token}`)
      .expect(200);
    expect(search.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(search.body)).not.toContain("raw_payload");
    expect(JSON.stringify(search.body)).not.toContain("provider_records");

    const suggested = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ venue_id: suggestedVenueId })
      .expect(201);
    const suggestedCandidate = suggested.body.candidates.find(
      (candidate: { venue_id: string }) => candidate.venue_id === suggestedVenueId
    );
    expect(suggestedCandidate).toEqual(
      expect.objectContaining({
        source: "suggested",
        viewer_vote: "in",
        can_remove: true,
        suggested_by: expect.objectContaining({
          id: friend.userId,
          display_name: "Plan Friend"
        })
      })
    );
    expect(suggested.body.session.capabilities.can_suggest_candidates).toBe(true);

    const message = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ type: "text", text: "Meet near the side door?" })
      .expect(201);
    expect(message.body.messages[0]).toEqual(
      expect.objectContaining({
        type: "text",
        text: "Meet near the side door?",
        actor: expect.objectContaining({ id: friend.userId })
      })
    );
    expect(JSON.stringify(message.body)).not.toContain("coordinates");

    const emoji = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ type: "emoji", emoji: "fire" })
      .expect(201);
    expect(emoji.body.messages.map((item: { type: string }) => item.type)).toContain("emoji");

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages/${message.body.messages[0].id}/report`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ reason: "spam" })
      .expect(201);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ type: "text", text: "x".repeat(141) })
      .expect(400);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/advance-shortlist`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    const finalized = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/finalize`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({
        candidate_id: initialCandidateId,
        final_meetup_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        final_note: "Meet by the entrance."
      })
      .expect(200);
    expect(finalized.body.session.final_plan).toEqual(
      expect.objectContaining({
        candidate_id: initialCandidateId,
        locked_by: expect.objectContaining({ id: host.userId }),
        note: "Meet by the entrance."
      })
    );
    expect(finalized.body.session.capabilities.can_vote).toBe(false);
    expect(finalized.body.session.capabilities.can_suggest_candidates).toBe(false);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ candidate_id: initialCandidateId, vote: "in" })
      .expect(409);
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ venue_id: suggestedVenueId })
      .expect(409);
    await request(app)
      .delete(`/api/v1/decision-sessions/${sessionId}/candidates/${suggestedCandidate.id}`)
      .set("Authorization", `Bearer ${friend.token}`)
      .expect(409);
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ type: "emoji", emoji: "eyes" })
      .expect(201);
  }, 120000);

  it("runs decision rooms through swipe, shortlist, and creator-locked final stages", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Stage Host", "stage_host");
    const friend = await createEligibleProfile("Stage Friend", "stage_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    expect(created.body.session.stage).toBe("swiping");
    expect(created.body.session.room_title).toContain("tonight");
    expect(created.body.session.id).toBeDefined();
    expect(JSON.stringify(created.body.session.room_title)).not.toContain(sessionId);
    expect(created.body.deck_candidates).toHaveLength(8);
    expect(created.body.shortlist).toEqual([]);
    expect(created.body.session.progress.ready_for_shortlist).toBe(false);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(200);

    for (const candidate of created.body.deck_candidates.slice(0, 4)) {
      await request(app)
        .post(`/api/v1/decision-sessions/${sessionId}/votes`)
        .set("Authorization", `Bearer ${host.token}`)
        .send({ candidate_id: candidate.id, vote: "in" })
        .expect(200);
      await request(app)
        .post(`/api/v1/decision-sessions/${sessionId}/votes`)
        .set("Authorization", `Bearer ${friend.token}`)
        .send({ candidate_id: candidate.id, vote: "in" })
        .expect(200);
    }

    const advanced = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/advance-shortlist`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);
    expect(advanced.body.session.stage).toBe("shortlist_voting");
    expect(advanced.body.shortlist).toHaveLength(5);
    expect(advanced.body.recommended_final_candidate.id).toBe(advanced.body.shortlist[0].id);
    expect(advanced.body.session.capabilities.can_force_shortlist).toBe(false);
    expect(advanced.body.session.capabilities.can_vote).toBe(false);
    expect(advanced.body.session.capabilities.can_vote_shortlist).toBe(true);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: advanced.body.shortlist[0].id, vote: "skip" })
      .expect(409);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/shortlist-votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: advanced.body.shortlist[0].id })
      .expect(200);
    const shortlistVoted = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/shortlist-votes`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ candidate_id: advanced.body.shortlist[1].id })
      .expect(200);
    expect(shortlistVoted.body.shortlist[0].shortlist_vote_count).toBe(1);
    expect(shortlistVoted.body.shortlist[0].viewer_shortlist_vote).toBeNull();
    expect(shortlistVoted.body.shortlist[1].viewer_shortlist_vote).toBe(true);

    const finalized = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/finalize`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: shortlistVoted.body.recommended_final_candidate.id })
      .expect(200);
    expect(finalized.body.session.stage).toBe("finalized");
    expect(finalized.body.session.final_plan.candidate_id).toBe(shortlistVoted.body.recommended_final_candidate.id);
    expect(finalized.body.session.capabilities.can_vote_shortlist).toBe(false);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/shortlist-votes`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ candidate_id: advanced.body.shortlist[2].id })
      .expect(409);
  }, 120000);

  it("returns server-authoritative deck progress after each swipe", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Deck Host", "deck_host");
    const friend = await createEligibleProfile("Deck Friend", "deck_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    const first = created.body.deck_candidates[0];
    const second = created.body.deck_candidates[1];

    expect(created.body.session.deck_state).toEqual({
      deck_size: 8,
      cards_total: 8,
      cards_remaining: 8,
      next_candidate_id: first.id,
      last_swiped_candidate_id: null,
      can_rewind: false
    });

    const voted = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: first.id, vote: "in" })
      .expect(200);

    expect(voted.body.session.deck_state.cards_remaining).toBe(7);
    expect(voted.body.session.deck_state.last_swiped_candidate_id).toBe(first.id);
    expect(voted.body.session.deck_state.next_candidate_id).toBe(second.id);
    expect(voted.body.deck_candidates[0].id).toBe(second.id);
    expect(voted.body.deck_candidates.some((candidate: { id: string }) => candidate.id === first.id)).toBe(false);
    expect(
      voted.body.session.progress.members.find((member: { role: string }) => member.role === "creator").swiped_count
    ).toBe(1);
  }, 120000);

  it("rewinds only the viewer's latest swiping vote and restores deck progress", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Rewind Host", "rewind_host");
    const friend = await createEligibleProfile("Rewind Friend", "rewind_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    const first = created.body.deck_candidates[0];
    const second = created.body.deck_candidates[1];

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ candidate_id: second.id, vote: "in" })
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: first.id, vote: "in" })
      .expect(200);

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: second.id, vote: "skip" })
      .expect(200);

    const rewound = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/rewind`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    expect(rewound.body.session.deck_state.last_swiped_candidate_id).toBe(first.id);
    expect(rewound.body.session.deck_state.next_candidate_id).toBe(second.id);
    expect(rewound.body.session.deck_state.can_rewind).toBe(true);
    expect(rewound.body.deck_candidates[0].id).toBe(second.id);
    const rewoundSecond = rewound.body.candidates.find((candidate: { id: string }) => candidate.id === second.id);
    expect(rewoundSecond).toEqual(
      expect.objectContaining({
        in_count: 1,
        skip_count: 0,
        viewer_vote: null
      })
    );
    expect(
      rewound.body.session.progress.members.find((member: { role: string }) => member.role === "creator").swiped_count
    ).toBe(1);
    expect(
      rewound.body.session.progress.members.find((member: { role: string }) => member.role === "member").swiped_count
    ).toBe(1);

    const friendView = await request(app)
      .get(`/api/v1/decision-sessions/${sessionId}`)
      .set("Authorization", `Bearer ${friend.token}`)
      .expect(200);
    const friendSecond = friendView.body.candidates.find((candidate: { id: string }) => candidate.id === second.id);
    expect(friendSecond).toEqual(
      expect.objectContaining({
        in_count: 1,
        skip_count: 0,
        viewer_vote: "in"
      })
    );
  }, 120000);

  it("rewinds fixed-deck swipes without deleting suggested candidate support", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Suggest Rewind Host", "sug_rw_host");
    const friend = await createEligibleProfile("Suggest Rewind Friend", "sug_rw_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;
    const first = created.body.deck_candidates[0];
    const suggestedVenueId = await findVenueOutsideSession(
      marketId,
      created.body.candidates.map((candidate: { venue_id: string }) => candidate.venue_id)
    );

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/votes`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ candidate_id: first.id, vote: "in" })
      .expect(200);

    const suggested = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ venue_id: suggestedVenueId })
      .expect(201);
    const suggestedCandidate = suggested.body.candidates.find(
      (candidate: { venue_id: string }) => candidate.venue_id === suggestedVenueId
    );
    expect(suggested.body.session.deck_state.last_swiped_candidate_id).toBe(first.id);
    expect(suggestedCandidate).toEqual(
      expect.objectContaining({
        viewer_vote: "in",
        in_count: 1
      })
    );

    const rewound = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/rewind`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    expect(rewound.body.session.deck_state.last_swiped_candidate_id).toBeNull();
    expect(rewound.body.session.deck_state.next_candidate_id).toBe(first.id);
    expect(rewound.body.session.deck_state.can_rewind).toBe(false);
    expect(rewound.body.deck_candidates[0].id).toBe(first.id);
    const rewoundFirst = rewound.body.candidates.find((candidate: { id: string }) => candidate.id === first.id);
    expect(rewoundFirst.viewer_vote).toBeNull();
    const rewoundSuggested = rewound.body.candidates.find(
      (candidate: { id: string }) => candidate.id === suggestedCandidate.id
    );
    expect(rewoundSuggested).toEqual(
      expect.objectContaining({
        viewer_vote: "in",
        in_count: 1
      })
    );
  }, 120000);

  it("rejects rewind after shortlist voting begins", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("No Rewind Host", "no_rw_host");
    const friend = await createEligibleProfile("No Rewind Friend", "no_rw_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);
    const sessionId = created.body.session.id;

    for (const candidate of created.body.deck_candidates.slice(0, 4)) {
      await request(app)
        .post(`/api/v1/decision-sessions/${sessionId}/votes`)
        .set("Authorization", `Bearer ${host.token}`)
        .send({ candidate_id: candidate.id, vote: "in" })
        .expect(200);
    }

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/advance-shortlist`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(200);

    const rejected = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/rewind`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(409);

    expect(rejected.body.error.code).toBe("DECISION_STAGE_LOCKED");
  }, 120000);

  it("returns NO_REWIND_AVAILABLE when the viewer has no swipe to rewind", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Empty Rewind Host", "empty_rw_host");
    const friend = await createEligibleProfile("Empty Rewind Friend", "empty_rw_friend");
    await requestAndAccept(host, friend);

    const created = await createSession(host, marketId, [friend.userId]).expect(201);

    const rejected = await request(app)
      .post(`/api/v1/decision-sessions/${created.body.session.id}/rewind`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({})
      .expect(409);

    expect(rejected.body.error.code).toBe("NO_REWIND_AVAILABLE");
  }, 120000);

  it("enforces candidate suggestion cap, removal permissions, and initial candidate protection", async () => {
    const marketId = await getSfMarketId();
    const host = await createEligibleProfile("Suggest Host", "suggest_host");
    const friend = await createEligibleProfile("Suggest Friend", "suggest_friend");
    const other = await createEligibleProfile("Suggest Other", "suggest_other");
    await requestAndAccept(host, friend);
    await requestAndAccept(host, other);

    const created = await createSession(host, marketId, [friend.userId, other.userId]).expect(201);
    const sessionId = created.body.session.id;
    const candidateVenueIds = new Set<string>(
      created.body.candidates.map((candidate: { venue_id: string }) => candidate.venue_id)
    );

    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({})
      .expect(200);
    await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/join`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({})
      .expect(200);

    const venues = await pool.query<{ id: string }>(
      `
        select id
        from venues
        where market_id = $1::uuid
          and is_active = true
          and admin_status = 'approved'
          and not (id = any($2::uuid[]))
        order by name asc
        limit 7
      `,
      [marketId, Array.from(candidateVenueIds)]
    );
    expect(venues.rows).toHaveLength(7);

    let removableCandidateId = "";
    for (const [index, venue] of venues.rows.entries()) {
      const response = await request(app)
        .post(`/api/v1/decision-sessions/${sessionId}/candidates`)
        .set("Authorization", `Bearer ${friend.token}`)
        .send({ venue_id: venue.id });
      if (index < 6) {
        expect(response.status).toBe(201);
        const added = response.body.candidates.find(
          (candidate: { venue_id: string }) => candidate.venue_id === venue.id
        );
        if (index === 0) removableCandidateId = added.id;
      } else {
        expect(response.status).toBe(409);
      }
    }

    await request(app)
      .delete(`/api/v1/decision-sessions/${sessionId}/candidates/${created.body.candidates[0].id}`)
      .set("Authorization", `Bearer ${host.token}`)
      .expect(409);
    await request(app)
      .delete(`/api/v1/decision-sessions/${sessionId}/candidates/${removableCandidateId}`)
      .set("Authorization", `Bearer ${other.token}`)
      .expect(403);
    const removed = await request(app)
      .delete(`/api/v1/decision-sessions/${sessionId}/candidates/${removableCandidateId}`)
      .set("Authorization", `Bearer ${host.token}`)
      .expect(200);
    expect(removed.body.candidates.some((candidate: { id: string }) => candidate.id === removableCandidateId)).toBe(false);
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
    const suggestedVenueId = await findVenueOutsideSession(
      marketId,
      created.body.candidates.map((candidate: { venue_id: string }) => candidate.venue_id)
    );
    const suggested = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/candidates`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ venue_id: suggestedVenueId })
      .expect(201);
    const suggestedCandidate = suggested.body.candidates.find(
      (candidate: { venue_id: string }) => candidate.venue_id === suggestedVenueId
    );
    const message = await request(app)
      .post(`/api/v1/decision-sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ type: "text", text: "Delete-safe room note." })
      .expect(201);

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
          (select count(*)::text from decision_sessions where creator_user_id = $1::uuid) as sessions,
          (select count(*)::text from decision_session_candidates where suggested_by_user_id = $1::uuid) as suggestions,
          (select count(*)::text from decision_session_messages where actor_user_id = $1::uuid) as messages
      `,
      [friend.userId]
    );
    expect(counts.rows[0]).toEqual({ memberships: "0", votes: "0", sessions: "0", suggestions: "0", messages: "0" });

    const hostView = await request(app)
      .get(`/api/v1/decision-sessions/${sessionId}`)
      .set("Authorization", `Bearer ${host.token}`)
      .expect(200);
    const anonymizedCandidate = hostView.body.candidates.find(
      (candidate: { id: string }) => candidate.id === suggestedCandidate.id
    );
    expect(anonymizedCandidate.suggested_by).toEqual(
      expect.objectContaining({ id: null, display_name: "Deleted user" })
    );
    const anonymizedMessage = hostView.body.messages.find(
      (item: { id: string }) => item.id === message.body.messages[0].id
    );
    expect(anonymizedMessage.actor).toEqual(
      expect.objectContaining({ id: null, display_name: "Deleted user" })
    );
    expect(deletedAuthUserIds).toContain(friend.authUserId);
  }, 120000);
});
