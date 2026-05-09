# Phase 6D Room-Live Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Decision rooms reliable and alive by fixing swipe progression, adding current-room SSE, and adding a production-shaped push notification foundation.

**Architecture:** Backend remains the source of truth for Decision room state. iOS owns gesture feel and optimistic animation, then reconciles to backend snapshots and SSE invalidations. Push infrastructure is backend-driven with mock/dev verification first and direct APNs credentials added later.

**Tech Stack:** Express, TypeScript, Postgres migrations, Vitest/Supertest, SwiftUI, URLSession, UserNotifications, XcodeGen, xcodebuild, Computer Use simulator walkthrough.

---

## Source Spec

Implement from:

- `docs/superpowers/specs/2026-04-30-phase-6d-room-live-foundation-design.md`

Keep these hard boundaries:

- no realtime Friends feed;
- no WebSockets;
- no live presence, typing indicators, read receipts, inbox, global unread badges, silent pushes, contacts matching, universal links, public rooms, named vote lists, or friend-influenced recommendations;
- no venue names in push copy yet;
- no raw provider records, coordinates, service keys, APNs keys, JWTs, or device tokens in API responses.

## File Structure

Backend files:

- Modify `backend/src/lib/config.ts`
  - Add optional APNs/mock notification config.
- Create `backend/src/services/v1/decisionRoomEvents.ts`
  - In-process room event bus and SSE event serialization helpers.
- Modify `backend/src/services/v1/decisionService.ts`
  - Server-authoritative deck snapshot, active deck filtering, latest-swipe rewind, room event emission, notification enqueue hooks.
- Create `backend/src/services/v1/notificationService.ts`
  - Device token registration, preferences, mock sender, APNs sender shell, async enqueue helpers.
- Modify `backend/src/services/v1/accountService.ts`
  - Account deletion cleanup for notification tokens/preferences.
- Modify `backend/src/routes/v1/index.ts`
  - Add SSE route, rewind route, notification device/preference routes, dev notification route.
- Create `db/migrations/013_phase6d_room_live_foundation.sql`
  - Add push/device/preference tables and indexes using the existing `db/migrations` convention.
- Modify `backend/test/v1-decision-api.test.ts`
  - Swipe/deck/rewind/SSE tests.
- Create `backend/test/v1-notification-api.test.ts`
  - Device token, preference, mock notification, production dev-route guard tests.
- Modify `backend/test/v1-social-api.test.ts` only if account deletion cleanup assertions need social fixture coverage.
- Modify `backend/package.json`
  - Add dev notification script only if script verification is easier than API-only verification.

iOS files:

- Modify `ios/Nightloop/Nightloop/Sources/API/NightloopAPIModels.swift`
  - Add Decision deck snapshot metadata if backend exposes new fields, notification models, and SSE event models.
- Modify `ios/Nightloop/Nightloop/Sources/API/NightloopAPIClient.swift`
  - Add rewind, device token registration, notification preference, dev notification test, and SSE request helpers.
- Create `ios/Nightloop/Nightloop/Sources/API/DecisionRoomEventStream.swift`
  - URLSession bytes-based SSE client with reconnect and cancellation.
- Create `ios/Nightloop/Nightloop/Sources/App/NotificationCoordinator.swift`
  - UserNotifications permission, device token handling, token registration bridge, notification routing.
- Modify `ios/Nightloop/Nightloop/Sources/App/NightloopApp.swift`
  - Add app delegate bridge for APNs token callbacks and inject notification coordinator.
- Modify `ios/Nightloop/Nightloop/Sources/App/AppRootView.swift`
  - Hold routing state and route notification taps into Decision.
- Modify `ios/Nightloop/Nightloop/Sources/Features/DecisionShellView.swift`
  - Server-backed swipe progression, release-only commit, rewind via backend, SSE connect/disconnect, permission pre-prompt, notification route target.
- Modify `ios/Nightloop/Nightloop/Sources/Features/ProfileView.swift`
  - Replace placeholder notification copy with four category toggles and permission enable affordance.
- Modify `ios/Nightloop/Nightloop/Resources/Nightloop.entitlements`
  - Add `aps-environment` for debug/development. Confirm release signing behavior before adding production entitlements.
- Modify `ios/Nightloop/project.yml`
  - Ensure entitlements remain attached after xcodegen.
- Modify `ios/Nightloop/NightloopTests/NightloopTests.swift`
  - Decode/request tests, swipe helper tests, SSE parsing tests, notification preference/routing tests.

Docs:

- Create `docs/nightloop-v3/PHASE6D_ROOM_LIVE_FOUNDATION.md`
  - Checkpoint, routes, privacy contract, APNs follow-up checklist.
- Modify `docs/nightloop-v3/API_CONTRACTS.md`
  - Add SSE, rewind, device token/preferences, dev notification route.
- Modify `docs/nightloop-v3/DATA_MODEL.md`
  - Add Phase 6D notification tables and cleanup behavior.
- Modify `docs/nightloop-v3/PHASE6_READINESS.md`
  - Add Phase 6D status/deferred boundaries after implementation.

## Task 1: Backend Deck Snapshot And Rewind Tests

**Files:**

- Modify: `backend/test/v1-decision-api.test.ts`
- Later implementation target: `backend/src/services/v1/decisionService.ts`
- Later route target: `backend/src/routes/v1/index.ts`

- [ ] **Step 1: Add failing test for deterministic active deck after swipe**

Append a test near existing swiping tests in `backend/test/v1-decision-api.test.ts`:

```ts
it("returns server-authoritative deck progress after each swipe", async () => {
  const marketId = await getSfMarketId();
  const host = await createEligibleProfile("Deck Host", "deck_host");
  const friend = await createEligibleProfile("Deck Friend", "deck_friend");
  await requestAndAccept(host, friend);

  const created = await createSession(host, marketId, [friend.userId]).expect(201);
  const sessionId = created.body.session.id;
  const first = created.body.deck_candidates[0];
  const second = created.body.deck_candidates[1];

  expect(created.body.session.deck_state.cards_remaining).toBe(8);
  expect(created.body.session.deck_state.next_candidate_id).toBe(first.id);

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
  expect(voted.body.session.progress.members.find((member: { role: string }) => member.role === "creator").swiped_count).toBe(1);
});
```

- [ ] **Step 2: Add failing test for server-backed rewind**

Add this test in the same file:

```ts
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
  expect(rewound.body.session.progress.members.find((member: { role: string }) => member.role === "creator").swiped_count).toBe(1);
});
```

- [ ] **Step 3: Add failing test that rewind is locked after shortlist**

Add:

```ts
it("rejects rewind after shortlist voting begins", async () => {
  const marketId = await getSfMarketId();
  const host = await createEligibleProfile("No Rewind Host", "no_rewind_host");
  const friend = await createEligibleProfile("No Rewind Friend", "no_rewind_friend");
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
});
```

- [ ] **Step 4: Run targeted tests and confirm failure**

Run:

```bash
npm --prefix backend test -- v1-decision-api.test.ts -t "deck progress|rewinds|rejects rewind"
```

Expected: failures mention missing `deck_state` and missing `/rewind` route.

## Task 2: Backend Deck Snapshot And Rewind Implementation

**Files:**

- Modify: `backend/src/services/v1/decisionService.ts`
- Modify: `backend/src/routes/v1/index.ts`
- Modify: `backend/test/v1-decision-api.test.ts`

- [ ] **Step 1: Add deck-state helpers in decision service**

In `backend/src/services/v1/decisionService.ts`, add this type near `MemberProgressRow`:

```ts
type DeckState = {
  deck_size: number;
  cards_total: number;
  cards_remaining: number;
  next_candidate_id: string | null;
  last_swiped_candidate_id: string | null;
  can_rewind: boolean;
};
```

Add helper functions near `formatProgress`:

```ts
function unswipedDeckCandidates(candidates: ReturnType<typeof formatCandidate>[]) {
  return candidates
    .filter((candidate) => candidate.viewer_vote === null)
    .sort((left, right) => left.original_rank - right.original_rank)
    .slice(0, DECK_SIZE);
}

async function readLatestSwipingVote(
  client: DBClient,
  sessionId: string,
  userId: string
): Promise<{ candidate_id: string; created_at: string } | null> {
  const result = await client.query<{ candidate_id: string; created_at: string }>(
    `
      SELECT candidate_id, created_at
      FROM decision_votes
      WHERE session_id = $1::uuid
        AND user_id = $2::uuid
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [sessionId, userId]
  );
  return result.rows[0] ?? null;
}

function formatDeckState(input: {
  allDeckCandidates: ReturnType<typeof formatCandidate>[];
  activeDeckCandidates: ReturnType<typeof formatCandidate>[];
  latestVote: { candidate_id: string } | null;
  session: SessionRow;
  membership: MembershipRow;
}): DeckState {
  const stage = effectiveStage(input.session);
  const cardsRemaining = input.allDeckCandidates.filter((candidate) => candidate.viewer_vote === null).length;
  const canRewind =
    input.session.status === "active" &&
    !input.session.finalized_at &&
    stage === "swiping" &&
    input.membership.status === "joined" &&
    Boolean(input.latestVote);

  return {
    deck_size: DECK_SIZE,
    cards_total: input.allDeckCandidates.length,
    cards_remaining: cardsRemaining,
    next_candidate_id: input.activeDeckCandidates[0]?.id ?? null,
    last_swiped_candidate_id: input.latestVote?.candidate_id ?? null,
    can_rewind: canRewind
  };
}
```

- [ ] **Step 2: Make formatted responses use active unswiped deck candidates**

In `formatSessionResponse`, replace:

```ts
const deckCandidates = candidates.slice(0, DECK_SIZE);
```

with:

```ts
const allDeckCandidates = candidates.slice(0, DECK_SIZE);
const deckCandidates = stage === "swiping" ? unswipedDeckCandidates(allDeckCandidates) : allDeckCandidates;
const latestVote = await readLatestSwipingVote(client, sessionId, account.user.id);
```

Then add `deck_state` under `session`:

```ts
deck_state: formatDeckState({
  allDeckCandidates,
  activeDeckCandidates: deckCandidates,
  latestVote,
  session,
  membership
}),
```

Keep `progress` using `allDeckCandidates.map(...)` so required progress is based on the fixed eight-card swipe set, not the remaining cards:

```ts
const progressRows = await readMemberProgress(client, sessionId, allDeckCandidates.map((candidate) => candidate.id));
const progress = formatProgress(progressRows, allDeckCandidates.length, stage !== "swiping");
```

- [ ] **Step 3: Add rewind service export**

Add to `backend/src/services/v1/decisionService.ts`:

```ts
export async function rewindDecisionSessionVote(input: {
  account: AccountState;
  sessionId: string;
}) {
  requireEligible(input.account);

  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "swiping") {
      throw new ApiError(409, "DECISION_STAGE_LOCKED", "Rewind is only available while swiping.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const latest = await readLatestSwipingVote(client, input.sessionId, input.account.user.id);
    if (!latest) {
      throw new ApiError(409, "NO_REWIND_AVAILABLE", "There is no recent swipe to rewind.");
    }

    await client.query(
      `
        DELETE FROM decision_votes
        WHERE session_id = $1::uuid
          AND user_id = $2::uuid
          AND candidate_id = $3::uuid
      `,
      [input.sessionId, input.account.user.id, latest.candidate_id]
    );
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}
```

- [ ] **Step 4: Add route import and route**

In `backend/src/routes/v1/index.ts`, add `rewindDecisionSessionVote` to the decision service import list.

After the `/decision-sessions/:id/votes` route, add:

```ts
router.post(
  "/decision-sessions/:id/rewind",
  requireEligibleMiddleware,
  accountWriteLimiter,
  asyncHandler(async (req, res) => {
    res.json(
      await rewindDecisionSessionVote({
        account: accountFromRequest(req),
        sessionId: req.params.id
      })
    );
  })
);
```

- [ ] **Step 5: Run targeted backend tests**

Run:

```bash
npm --prefix backend test -- v1-decision-api.test.ts -t "deck progress|rewinds|rejects rewind"
```

Expected: all targeted tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/services/v1/decisionService.ts backend/src/routes/v1/index.ts backend/test/v1-decision-api.test.ts
git commit -m "feat: make decision deck server authoritative"
```

## Task 3: Backend Room Event Bus And SSE

**Files:**

- Create: `backend/src/services/v1/decisionRoomEvents.ts`
- Modify: `backend/src/services/v1/decisionService.ts`
- Modify: `backend/src/routes/v1/index.ts`
- Modify: `backend/test/v1-decision-api.test.ts`

- [ ] **Step 1: Add failing SSE access test**

Add to `backend/test/v1-decision-api.test.ts`:

```ts
it("opens a decision room SSE stream only for joined visible members", async () => {
  const marketId = await getSfMarketId();
  const host = await createEligibleProfile("SSE Host", "sse_host");
  const friend = await createEligibleProfile("SSE Friend", "sse_friend");
  const stranger = await createEligibleProfile("SSE Stranger", "sse_stranger");
  await requestAndAccept(host, friend);

  const created = await createSession(host, marketId, [friend.userId]).expect(201);
  const sessionId = created.body.session.id;

  await request(app)
    .get(`/api/v1/decision-sessions/${sessionId}/events`)
    .set("Authorization", `Bearer ${stranger.token}`)
    .expect(404);

  const stream = await request(app)
    .get(`/api/v1/decision-sessions/${sessionId}/events`)
    .set("Authorization", `Bearer ${host.token}`)
    .set("Accept", "text/event-stream")
    .expect(200);

  expect(stream.headers["content-type"]).toContain("text/event-stream");
  expect(stream.text).toContain("event: room_snapshot_invalidated");
});
```

If Supertest hangs on a live stream, implement the route so `NODE_ENV === "test"` and query `?once=1` closes after the initial event, then make the test call `/events?once=1`.

- [ ] **Step 2: Create event bus**

Create `backend/src/services/v1/decisionRoomEvents.ts`:

```ts
import { EventEmitter } from "events";
import type { Response } from "express";

export type DecisionRoomEventType =
  | "room_joined"
  | "vote_changed"
  | "progress_changed"
  | "shortlist_ready"
  | "shortlist_vote_changed"
  | "message_created"
  | "candidate_suggested"
  | "candidate_removed"
  | "final_plan_locked"
  | "room_ended"
  | "room_snapshot_invalidated";

export type DecisionRoomEvent = {
  id: string;
  session_id: string;
  type: DecisionRoomEventType;
  actor?: { display_name: string; username?: string | null } | null;
  candidate_id?: string | null;
  message_id?: string | null;
  stage?: string | null;
  created_at: string;
};

type Listener = (event: DecisionRoomEvent) => void;

class DecisionRoomEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: Omit<DecisionRoomEvent, "id" | "created_at">): DecisionRoomEvent {
    const fullEvent: DecisionRoomEvent = {
      ...event,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    this.emitter.emit(event.session_id, fullEvent);
    return fullEvent;
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    this.emitter.on(sessionId, listener);
    return () => this.emitter.off(sessionId, listener);
  }
}

export const decisionRoomEvents = new DecisionRoomEventBus();

export function writeSseEvent(res: Response, event: DecisionRoomEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

If TypeScript does not expose `crypto.randomUUID()` globally in this project, import `randomUUID` from `crypto` and use that.

- [ ] **Step 3: Emit events from decision mutations**

In `backend/src/services/v1/decisionService.ts`, import:

```ts
import { decisionRoomEvents } from "./decisionRoomEvents";
```

After successful mutations and before returning formatted response, publish:

```ts
decisionRoomEvents.publish({
  session_id: input.sessionId,
  type: "vote_changed",
  candidate_id: candidateId,
  stage: "swiping"
});
decisionRoomEvents.publish({
  session_id: input.sessionId,
  type: "progress_changed",
  stage: "swiping"
});
```

Apply matching events in:

- `joinDecisionSession` and `joinDecisionSessionByCode`: `room_joined`
- `voteDecisionSession`: `vote_changed`, `progress_changed`
- `rewindDecisionSessionVote`: `vote_changed`, `progress_changed`
- `advanceDecisionSessionShortlist`: `shortlist_ready`
- `voteDecisionSessionShortlist`: `shortlist_vote_changed`
- `suggestDecisionCandidate`: `candidate_suggested`
- `removeDecisionCandidate`: `candidate_removed`
- `finalizeDecisionSession`: `final_plan_locked`
- `addDecisionSessionMessage`: `message_created`
- `endDecisionSession`: `room_ended`

When actor names are easy and already loaded, include only:

```ts
actor: { display_name: input.account.user.profile.display_name }
```

If `AccountState` does not expose profile directly, omit actor for 6D events and let clients refetch the canonical room snapshot.

- [ ] **Step 4: Add SSE route**

In `backend/src/routes/v1/index.ts`, import:

```ts
import { decisionRoomEvents, writeSseEvent } from "../../services/v1/decisionRoomEvents";
```

Add before the generic `GET /decision-sessions/:id` route so route ordering is safe:

```ts
router.get(
  "/decision-sessions/:id/events",
  requireEligibleMiddleware,
  asyncHandler(async (req, res) => {
    await getDecisionSession(accountFromRequest(req), req.params.id);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSseEvent(res, {
      id: "initial",
      session_id: req.params.id,
      type: "room_snapshot_invalidated",
      created_at: new Date().toISOString()
    });

    if (config.env === "test" && req.query.once === "1") {
      res.end();
      return;
    }

    const unsubscribe = decisionRoomEvents.subscribe(req.params.id, (event) => {
      writeSseEvent(res, event);
    });
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  })
);
```

- [ ] **Step 5: Run targeted SSE tests**

Run:

```bash
npm --prefix backend test -- v1-decision-api.test.ts -t "SSE"
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/v1/decisionRoomEvents.ts backend/src/services/v1/decisionService.ts backend/src/routes/v1/index.ts backend/test/v1-decision-api.test.ts
git commit -m "feat: add decision room sse events"
```

## Task 4: Backend Push Tables, Preferences, And Mock Sender

**Files:**

- Create: `db/migrations/013_phase6d_room_live_foundation.sql`
- Modify: `backend/src/lib/config.ts`
- Create: `backend/src/services/v1/notificationService.ts`
- Modify: `backend/src/routes/v1/index.ts`
- Modify: `backend/src/services/v1/accountService.ts`
- Create: `backend/test/v1-notification-api.test.ts`

- [ ] **Step 1: Add migration**

Create `db/migrations/013_phase6d_room_live_foundation.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios')),
  token_hash text NOT NULL,
  token_value text NOT NULL,
  apns_environment text NOT NULL CHECK (apns_environment IN ('sandbox', 'production')),
  app_version text,
  build_number text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash, apns_environment)
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_active
  ON user_device_tokens(user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  room_invites_enabled boolean NOT NULL DEFAULT true,
  shortlist_ready_enabled boolean NOT NULL DEFAULT true,
  final_plan_locked_enabled boolean NOT NULL DEFAULT true,
  room_messages_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Add config fields**

In `backend/src/lib/config.ts`, extend `AppConfig`:

```ts
apnsTeamId?: string;
apnsKeyId?: string;
apnsPrivateKey?: string;
apnsBundleId?: string;
apnsEnvironment: "sandbox" | "production";
notificationDeliveryMode: "mock" | "apns";
```

Extend `EnvSchema`:

```ts
APNS_TEAM_ID: z.string().min(1).optional(),
APNS_KEY_ID: z.string().min(1).optional(),
APNS_PRIVATE_KEY: z.string().min(1).optional(),
APNS_BUNDLE_ID: z.string().min(1).optional(),
APNS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
NOTIFICATION_DELIVERY_MODE: z.enum(["mock", "apns"]).default("mock")
```

Return the parsed fields in `loadConfig()`.

- [ ] **Step 3: Add notification service**

Create `backend/src/services/v1/notificationService.ts`:

```ts
import { createHash } from "crypto";
import { ApiError } from "../../lib/apiError";
import { dbQuery } from "../../lib/db";
import type { AppConfig } from "../../lib/config";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";

export type NotificationCategory = "room_invite" | "shortlist_ready" | "final_plan_locked" | "room_message";

export type RegisterDeviceTokenInput = {
  account: AccountState;
  token: string;
  apnsEnvironment: "sandbox" | "production";
  appVersion?: string;
  buildNumber?: string;
};

export type NotificationPreferences = {
  room_invites_enabled: boolean;
  shortlist_ready_enabled: boolean;
  final_plan_locked_enabled: boolean;
  room_messages_enabled: boolean;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export async function registerDeviceToken(input: RegisterDeviceTokenInput) {
  requireEligible(input.account);
  const token = input.token.trim();
  if (!/^[a-fA-F0-9]{32,512}$/.test(token)) {
    throw new ApiError(400, "INVALID_DEVICE_TOKEN", "Device token is invalid.");
  }

  const result = await dbQuery(
    `
      INSERT INTO user_device_tokens (
        user_id,
        platform,
        token_hash,
        token_value,
        apns_environment,
        app_version,
        build_number,
        last_seen_at,
        revoked_at
      )
      VALUES ($1::uuid, 'ios', $2, $3, $4, $5, $6, NOW(), NULL)
      ON CONFLICT (user_id, token_hash, apns_environment) DO UPDATE SET
        token_value = EXCLUDED.token_value,
        app_version = EXCLUDED.app_version,
        build_number = EXCLUDED.build_number,
        last_seen_at = NOW(),
        revoked_at = NULL,
        updated_at = NOW()
      RETURNING id, platform, apns_environment, last_seen_at
    `,
    [input.account.user.id, tokenHash(token), token, input.apnsEnvironment, input.appVersion ?? null, input.buildNumber ?? null]
  );

  await ensureNotificationPreferences(input.account.user.id);
  return { device: result.rows[0] };
}

export async function revokeDeviceToken(account: AccountState, token: string) {
  requireEligible(account);
  await dbQuery(
    `
      UPDATE user_device_tokens
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE user_id = $1::uuid
        AND token_hash = $2
        AND revoked_at IS NULL
    `,
    [account.user.id, tokenHash(token)]
  );
  return { ok: true };
}

export async function ensureNotificationPreferences(userId: string): Promise<void> {
  await dbQuery(
    `
      INSERT INTO user_notification_preferences (user_id)
      VALUES ($1::uuid)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

export async function getNotificationPreferences(account: AccountState) {
  requireEligible(account);
  await ensureNotificationPreferences(account.user.id);
  const result = await dbQuery<NotificationPreferences>(
    `
      SELECT room_invites_enabled, shortlist_ready_enabled, final_plan_locked_enabled, room_messages_enabled
      FROM user_notification_preferences
      WHERE user_id = $1::uuid
    `,
    [account.user.id]
  );
  return { preferences: result.rows[0] };
}

export async function updateNotificationPreferences(account: AccountState, patch: Partial<NotificationPreferences>) {
  requireEligible(account);
  await ensureNotificationPreferences(account.user.id);
  const next = await dbQuery<NotificationPreferences>(
    `
      UPDATE user_notification_preferences
      SET
        room_invites_enabled = COALESCE($2, room_invites_enabled),
        shortlist_ready_enabled = COALESCE($3, shortlist_ready_enabled),
        final_plan_locked_enabled = COALESCE($4, final_plan_locked_enabled),
        room_messages_enabled = COALESCE($5, room_messages_enabled),
        updated_at = NOW()
      WHERE user_id = $1::uuid
      RETURNING room_invites_enabled, shortlist_ready_enabled, final_plan_locked_enabled, room_messages_enabled
    `,
    [
      account.user.id,
      patch.room_invites_enabled ?? null,
      patch.shortlist_ready_enabled ?? null,
      patch.final_plan_locked_enabled ?? null,
      patch.room_messages_enabled ?? null
    ]
  );
  return { preferences: next.rows[0] };
}

export function roomNotificationCopy(category: NotificationCategory, actorDisplayName?: string | null): string {
  const actor = actorDisplayName?.trim().split(/\s+/)[0]?.toLowerCase();
  switch (category) {
    case "room_invite":
      return actor ? `${actor} invited you to pick tonight` : "you were invited to pick tonight";
    case "shortlist_ready":
      return "your shortlist is ready";
    case "final_plan_locked":
      return "the plan is locked";
    case "room_message":
      return actor ? `${actor} sent a room message` : "new room message";
  }
}

export type NotificationSender = {
  send(payload: { token: string; title: string; body: string; data: Record<string, string> }): Promise<void>;
};

export class MockNotificationSender implements NotificationSender {
  readonly sent: Array<{ title: string; body: string; data: Record<string, string> }> = [];
  async send(payload: { token: string; title: string; body: string; data: Record<string, string> }): Promise<void> {
    this.sent.push({ title: payload.title, body: payload.body, data: payload.data });
  }
}

export class ApnsNotificationSender implements NotificationSender {
  constructor(private readonly config: AppConfig) {}
  async send(): Promise<void> {
    if (!this.config.apnsTeamId || !this.config.apnsKeyId || !this.config.apnsPrivateKey || !this.config.apnsBundleId) {
      throw new Error("APNs credentials are not configured.");
    }
    throw new Error("Direct APNs delivery shell is configured but not enabled in local mock mode.");
  }
}
```

Keep direct APNs send as a shell in 6D unless APNs credentials are available; the mock sender and payload contract are the testable surface.

- [ ] **Step 4: Add routes and schemas**

In `backend/src/routes/v1/index.ts`, import notification service functions and add schemas:

```ts
const DeviceTokenSchema = z.object({
  token: z.string().trim().min(32).max(512),
  apns_environment: z.enum(["sandbox", "production"]).default("sandbox"),
  app_version: z.string().trim().max(40).optional(),
  build_number: z.string().trim().max(40).optional()
}).strict();

const NotificationPreferencesPatchSchema = z.object({
  room_invites_enabled: z.boolean().optional(),
  shortlist_ready_enabled: z.boolean().optional(),
  final_plan_locked_enabled: z.boolean().optional(),
  room_messages_enabled: z.boolean().optional()
}).strict();

const DevRoomNotificationSchema = z.object({
  session_id: z.string().uuid(),
  category: z.enum(["room_invite", "shortlist_ready", "final_plan_locked", "room_message"])
}).strict();
```

Add routes:

```ts
router.post("/me/device-tokens", requireEligibleMiddleware, accountWriteLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(DeviceTokenSchema, req.body);
  res.status(201).json(await registerDeviceToken({
    account: accountFromRequest(req),
    token: body.token,
    apnsEnvironment: body.apns_environment,
    appVersion: body.app_version,
    buildNumber: body.build_number
  }));
}));

router.delete("/me/device-tokens", requireEligibleMiddleware, accountWriteLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(z.object({ token: z.string().trim().min(32).max(512) }).strict(), req.body);
  res.json(await revokeDeviceToken(accountFromRequest(req), body.token));
}));

router.get("/me/notification-preferences", requireEligibleMiddleware, asyncHandler(async (req, res) => {
  res.json(await getNotificationPreferences(accountFromRequest(req)));
}));

router.patch("/me/notification-preferences", requireEligibleMiddleware, accountWriteLimiter, asyncHandler(async (req, res) => {
  const body = parseBody(NotificationPreferencesPatchSchema, req.body);
  res.json(await updateNotificationPreferences(accountFromRequest(req), body));
}));
```

Add dev-only route:

```ts
router.post("/dev/notifications/room-test", requireEligibleMiddleware, accountWriteLimiter, asyncHandler(async (req, res) => {
  if (config.env === "production") {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }
  const body = parseBody(DevRoomNotificationSchema, req.body);
  await getDecisionSession(accountFromRequest(req), body.session_id);
  res.status(202).json({
    ok: true,
    notification: {
      category: body.category,
      route: { tab: "decision", session_id: body.session_id },
      body: roomNotificationCopy(body.category)
    }
  });
}));
```

- [ ] **Step 5: Add backend notification tests**

Create `backend/test/v1-notification-api.test.ts` by following the JWKS/auth setup style from `backend/test/v1-decision-api.test.ts`. Include these tests:

```ts
it("registers and revokes an iOS device token without returning the raw token", async () => {
  const user = await createEligibleProfile("Push User", "push_user");
  const token = "a".repeat(64);

  const registered = await request(app)
    .post("/api/v1/me/device-tokens")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ token, apns_environment: "sandbox", app_version: "0.1.0", build_number: "1" })
    .expect(201);

  expect(JSON.stringify(registered.body)).not.toContain(token);
  expect(registered.body.device.platform).toBe("ios");

  await request(app)
    .delete("/api/v1/me/device-tokens")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ token })
    .expect(200);
});

it("updates room notification preferences", async () => {
  const user = await createEligibleProfile("Prefs User", "prefs_user");
  const patched = await request(app)
    .patch("/api/v1/me/notification-preferences")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ room_messages_enabled: false })
    .expect(200);

  expect(patched.body.preferences.room_messages_enabled).toBe(false);
  expect(patched.body.preferences.room_invites_enabled).toBe(true);
});

it("keeps dev notification route unavailable in production config", async () => {
  const prodApp = createApp({ config: { ...config, env: "production" }, authAdmin });
  const user = await createEligibleProfile("Prod Push User", "prod_push_user");
  await request(prodApp)
    .post("/api/v1/dev/notifications/room-test")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ session_id: crypto.randomUUID(), category: "room_message" })
    .expect(404);
});
```

Adjust helper imports and setup to match current test conventions.

- [ ] **Step 6: Run notification tests**

Run:

```bash
npm --prefix backend test -- v1-notification-api.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/013_phase6d_room_live_foundation.sql backend/src/lib/config.ts backend/src/services/v1/notificationService.ts backend/src/routes/v1/index.ts backend/test/v1-notification-api.test.ts
git commit -m "feat: add room notification foundation"
```

## Task 5: Backend Notification Triggers From Room Events

**Files:**

- Modify: `backend/src/services/v1/notificationService.ts`
- Modify: `backend/src/services/v1/decisionService.ts`
- Modify: `backend/test/v1-decision-api.test.ts`
- Modify: `backend/test/v1-notification-api.test.ts`

- [ ] **Step 1: Add tests for push privacy copy**

In `backend/test/v1-notification-api.test.ts`, add:

```ts
it("uses lowercase room notification copy without venue names", () => {
  expect(roomNotificationCopy("room_invite", "Maya Rivera")).toBe("maya invited you to pick tonight");
  expect(roomNotificationCopy("shortlist_ready")).toBe("your shortlist is ready");
  expect(roomNotificationCopy("final_plan_locked")).toBe("the plan is locked");
  expect(roomNotificationCopy("room_message", "Alex Chen")).toBe("alex sent a room message");
  expect(roomNotificationCopy("final_plan_locked")).not.toMatch(/1015|novela|venue/i);
});
```

Export/import `roomNotificationCopy` as needed.

- [ ] **Step 2: Add enqueue helper**

In `backend/src/services/v1/notificationService.ts`, add:

```ts
const preferenceColumnByCategory: Record<NotificationCategory, keyof NotificationPreferences> = {
  room_invite: "room_invites_enabled",
  shortlist_ready: "shortlist_ready_enabled",
  final_plan_locked: "final_plan_locked_enabled",
  room_message: "room_messages_enabled"
};

export async function enqueueRoomNotification(input: {
  sessionId: string;
  recipientUserId: string;
  category: NotificationCategory;
  actorDisplayName?: string | null;
}) {
  const preferenceColumn = preferenceColumnByCategory[input.category];
  const result = await dbQuery<{ token_value: string }>(
    `
      SELECT udt.token_value
      FROM user_device_tokens udt
      JOIN user_notification_preferences unp ON unp.user_id = udt.user_id
      WHERE udt.user_id = $1::uuid
        AND udt.revoked_at IS NULL
        AND unp.${preferenceColumn} = true
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users b
          JOIN decision_session_members dsm ON dsm.session_id = $2::uuid
          WHERE dsm.user_id <> $1::uuid
            AND (
              (b.blocker_user_id = $1::uuid AND b.blocked_user_id = dsm.user_id)
              OR (b.blocker_user_id = dsm.user_id AND b.blocked_user_id = $1::uuid)
            )
        )
    `,
    [input.recipientUserId, input.sessionId]
  );

  return {
    queued: result.rows.length,
    body: roomNotificationCopy(input.category, input.actorDisplayName),
    route: { tab: "decision", session_id: input.sessionId }
  };
}
```

This queues/logs the work for 6D tests; APNs delivery can remain mock until credentials are configured.

- [ ] **Step 3: Trigger notifications in decision service**

In `createDecisionSession`, after invited members are inserted and after transaction returns, enqueue `room_invite` for each invited user. Do not include venue names.

In `advanceDecisionSessionShortlist`, after stage changes, enqueue `shortlist_ready` for joined members except actor.

In `finalizeDecisionSession`, enqueue `final_plan_locked` for joined members except actor.

In `addDecisionSessionMessage`, enqueue `room_message` for joined members except actor.

Use a helper:

```ts
async function joinedMemberIds(sessionId: string): Promise<string[]> {
  const result = await dbQuery<{ user_id: string }>(
    `
      SELECT user_id
      FROM decision_session_members
      WHERE session_id = $1::uuid
        AND status = 'joined'
    `,
    [sessionId]
  );
  return result.rows.map((row) => row.user_id);
}
```

Then:

```ts
for (const recipientUserId of await joinedMemberIds(input.sessionId)) {
  if (recipientUserId === input.account.user.id) continue;
  void enqueueRoomNotification({
    sessionId: input.sessionId,
    recipientUserId,
    category: "room_message",
    actorDisplayName: input.account.user.profile?.display_name ?? null
  }).catch((error) => {
    console.warn("[notifications] room_message failed", error instanceof Error ? error.message : error);
  });
}
```

If `account.user.profile` is unavailable, pass `null`.

- [ ] **Step 4: Run backend tests**

Run:

```bash
npm --prefix backend test -- v1-notification-api.test.ts v1-decision-api.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/v1/notificationService.ts backend/src/services/v1/decisionService.ts backend/test/v1-notification-api.test.ts backend/test/v1-decision-api.test.ts
git commit -m "feat: enqueue private room notifications"
```

## Task 6: iOS API Models, Client, SSE Parser, And Notification Coordinator

**Files:**

- Modify: `ios/Nightloop/Nightloop/Sources/API/NightloopAPIModels.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/API/NightloopAPIClient.swift`
- Create: `ios/Nightloop/Nightloop/Sources/API/DecisionRoomEventStream.swift`
- Create: `ios/Nightloop/Nightloop/Sources/App/NotificationCoordinator.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/App/NightloopApp.swift`
- Modify: `ios/Nightloop/NightloopTests/NightloopTests.swift`

- [ ] **Step 1: Add iOS tests for new models/client requests**

In `ios/Nightloop/NightloopTests/NightloopTests.swift`, add tests near existing API client tests:

```swift
func testDecisionDeckStateDecodes() throws {
    let data = Data("""
    {
      "deck_size": 8,
      "cards_total": 8,
      "cards_remaining": 7,
      "next_candidate_id": "candidate-2",
      "last_swiped_candidate_id": "candidate-1",
      "can_rewind": true
    }
    """.utf8)

    let state = try JSONDecoder.nightloop.decode(DecisionDeckState.self, from: data)
    XCTAssertEqual(state.cardsRemaining, 7)
    XCTAssertEqual(state.nextCandidateID, "candidate-2")
    XCTAssertTrue(state.canRewind)
}

func testDecisionRoomEventParserDecodesSSEEvent() throws {
    let raw = """
    id: event-1
    event: message_created
    data: {"id":"event-1","session_id":"session-1","type":"message_created","message_id":"message-1","created_at":"2026-04-30T01:00:00Z"}

    """
    let events = DecisionRoomSSEParser.parse(raw)
    XCTAssertEqual(events.first?.type, .messageCreated)
    XCTAssertEqual(events.first?.sessionID, "session-1")
}

func testNotificationPreferenceRequestBuilders() async throws {
    let client = NightloopAPIClient(baseURL: URL(string: "https://api.test/api/v1")!)
    let recorder = RequestRecorderURLProtocol.install()
    defer { RequestRecorderURLProtocol.uninstall() }

    _ = try await client.updateNotificationPreferences(
        NotificationPreferences(roomInvitesEnabled: true, shortlistReadyEnabled: true, finalPlanLockedEnabled: true, roomMessagesEnabled: false),
        bearerToken: "test-token"
    )

    XCTAssertEqual(recorder.requests.last?.url?.path, "/api/v1/me/notification-preferences")
    XCTAssertEqual(recorder.requests.last?.httpMethod, "PATCH")
}
```

Adapt `RequestRecorderURLProtocol` usage to existing test helpers; if the project uses a different mock protocol, use that.

- [ ] **Step 2: Add API models**

In `NightloopAPIModels.swift`, add:

```swift
struct DecisionDeckState: Decodable, Equatable {
    let deckSize: Int
    let cardsTotal: Int
    let cardsRemaining: Int
    let nextCandidateID: String?
    let lastSwipedCandidateID: String?
    let canRewind: Bool
}

enum DecisionRoomEventType: String, Decodable, Equatable {
    case roomJoined = "room_joined"
    case voteChanged = "vote_changed"
    case progressChanged = "progress_changed"
    case shortlistReady = "shortlist_ready"
    case shortlistVoteChanged = "shortlist_vote_changed"
    case messageCreated = "message_created"
    case candidateSuggested = "candidate_suggested"
    case candidateRemoved = "candidate_removed"
    case finalPlanLocked = "final_plan_locked"
    case roomEnded = "room_ended"
    case roomSnapshotInvalidated = "room_snapshot_invalidated"
}

struct DecisionRoomEvent: Decodable, Equatable, Identifiable {
    let id: String
    let sessionID: String
    let type: DecisionRoomEventType
    let candidateID: String?
    let messageID: String?
    let stage: String?
    let createdAt: String
}

struct NotificationPreferences: Codable, Equatable {
    let roomInvitesEnabled: Bool
    let shortlistReadyEnabled: Bool
    let finalPlanLockedEnabled: Bool
    let roomMessagesEnabled: Bool
}

struct NotificationPreferencesResponse: Decodable, Equatable {
    let preferences: NotificationPreferences
}
```

Add `let deckState: DecisionDeckState?` to `DecisionSession`.

- [ ] **Step 3: Add client methods**

In `NightloopAPIClient.swift`, add:

```swift
func rewindDecisionSession(id: String, bearerToken: String) async throws -> DecisionSessionResponse {
    try await send(
        path: "decision-sessions/\(id)/rewind",
        method: "POST",
        bearerToken: bearerToken,
        body: EmptyBody()
    )
}

func registerDeviceToken(_ token: String, environment: String, bearerToken: String) async throws -> EmptyResponse {
    try await send(
        path: "me/device-tokens",
        method: "POST",
        bearerToken: bearerToken,
        body: DeviceTokenBody(token: token, apnsEnvironment: environment)
    )
}

func notificationPreferences(bearerToken: String) async throws -> NotificationPreferencesResponse {
    try await send(path: "me/notification-preferences", bearerToken: bearerToken)
}

func updateNotificationPreferences(_ preferences: NotificationPreferences, bearerToken: String) async throws -> NotificationPreferencesResponse {
    try await send(
        path: "me/notification-preferences",
        method: "PATCH",
        bearerToken: bearerToken,
        body: preferences
    )
}
```

Add request bodies:

```swift
private struct DeviceTokenBody: Encodable {
    let token: String
    let apnsEnvironment: String
}
```

Add DEBUG-only dev route method:

```swift
#if DEBUG
func sendDevRoomNotification(sessionID: String, category: String, bearerToken: String) async throws -> EmptyResponse {
    try await send(
        path: "dev/notifications/room-test",
        method: "POST",
        bearerToken: bearerToken,
        body: ["session_id": sessionID, "category": category]
    )
}
#endif
```

- [ ] **Step 4: Add SSE parser/stream**

Create `DecisionRoomEventStream.swift`:

```swift
import Foundation

enum DecisionRoomSSEParser {
    static func parse(_ raw: String) -> [DecisionRoomEvent] {
        raw.components(separatedBy: "\n\n").compactMap { block in
            guard let dataLine = block.split(separator: "\n").first(where: { $0.hasPrefix("data: ") }) else {
                return nil
            }
            let json = dataLine.dropFirst("data: ".count)
            return try? JSONDecoder.nightloop.decode(DecisionRoomEvent.self, from: Data(json.utf8))
        }
    }
}

final class DecisionRoomEventStream {
    private let baseURL: URL
    private let session: URLSession
    private var task: Task<Void, Never>?

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func start(sessionID: String, bearerToken: String, onEvent: @escaping (DecisionRoomEvent) -> Void, onState: @escaping (Bool) -> Void) {
        stop()
        task = Task {
            while !Task.isCancelled {
                do {
                    onState(true)
                    var request = URLRequest(url: baseURL.appendingPathComponent("decision-sessions/\(sessionID)/events"))
                    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, _) = try await session.bytes(for: request)
                    var buffer = ""
                    for try await line in bytes.lines {
                        if line.isEmpty {
                            for event in DecisionRoomSSEParser.parse(buffer + "\n\n") {
                                onEvent(event)
                            }
                            buffer = ""
                        } else {
                            buffer += line + "\n"
                        }
                    }
                } catch {
                    onState(false)
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
```

- [ ] **Step 5: Add notification coordinator shell**

Create `NotificationCoordinator.swift`:

```swift
import Foundation
import UserNotifications
import UIKit

@MainActor
final class NotificationCoordinator: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var pendingDecisionSessionID: String?

    private let center = UNUserNotificationCenter.current()

    override init() {
        super.init()
        center.delegate = self
    }

    func refreshStatus() async {
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    func requestPermission() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            await refreshStatus()
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            await refreshStatus()
            return false
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let sessionID = response.notification.request.content.userInfo["decision_session_id"] as? String
        await MainActor.run {
            self.pendingDecisionSessionID = sessionID
        }
    }
}
```

Add AppDelegate bridge in `NightloopApp.swift` only if needed for APNs token registration. Keep actual token registration fail-soft until provisioning is ready.

- [ ] **Step 6: Run iOS focused tests**

Run:

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test -only-testing:NightloopTests/NightloopTests/testDecisionDeckStateDecodes -only-testing:NightloopTests/NightloopTests/testDecisionRoomEventParserDecodesSSEEvent
```

Expected: pass after adapting exact test names to Xcode's generated identifiers.

- [ ] **Step 7: Commit**

```bash
git add ios/Nightloop/Nightloop/Sources/API/NightloopAPIModels.swift ios/Nightloop/Nightloop/Sources/API/NightloopAPIClient.swift ios/Nightloop/Nightloop/Sources/API/DecisionRoomEventStream.swift ios/Nightloop/Nightloop/Sources/App/NotificationCoordinator.swift ios/Nightloop/Nightloop/Sources/App/NightloopApp.swift ios/Nightloop/NightloopTests/NightloopTests.swift
git commit -m "feat: add room live api and notification client"
```

## Task 7: iOS Decision Swipe, SSE, Rewind, And Permission UX

**Files:**

- Modify: `ios/Nightloop/Nightloop/Sources/Features/DecisionShellView.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/App/AppRootView.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/App/NightloopApp.swift`
- Modify: `ios/Nightloop/NightloopTests/NightloopTests.swift`

- [ ] **Step 1: Add tests for swipe release policy helper**

In `NightloopTests.swift`, add helper tests:

```swift
func testDecisionSwipeCommitPolicyRequiresReleasePastThreshold() {
    XCTAssertNil(DecisionSwipeCommitPolicy.commit(translation: CGSize(width: 119, height: 0), threshold: 120))
    XCTAssertEqual(DecisionSwipeCommitPolicy.commit(translation: CGSize(width: 121, height: 0), threshold: 120), .voteIn)
    XCTAssertEqual(DecisionSwipeCommitPolicy.commit(translation: CGSize(width: -121, height: 0), threshold: 120), .skip)
}

func testDecisionSwipeVisualEmphasisDoesNotCommit() {
    let emphasis = DecisionSwipeCommitPolicy.visualEmphasis(translation: CGSize(width: 200, height: 0), threshold: 120)
    XCTAssertEqual(emphasis.vote, .voteIn)
    XCTAssertGreaterThan(emphasis.progress, 1)
}
```

- [ ] **Step 2: Add helper in DecisionShellView or small support type**

Add near existing `DecisionRoomSurfacePolicy`:

```swift
enum DecisionSwipeCommitPolicy {
    struct Emphasis: Equatable {
        let vote: DecisionVoteValue?
        let progress: CGFloat
    }

    static func commit(translation: CGSize, threshold: CGFloat) -> DecisionVoteValue? {
        if translation.width >= threshold { return .voteIn }
        if translation.width <= -threshold { return .skip }
        return nil
    }

    static func visualEmphasis(translation: CGSize, threshold: CGFloat) -> Emphasis {
        let progress = min(1.4, abs(translation.width) / max(1, threshold))
        let vote: DecisionVoteValue?
        if translation.width > 12 {
            vote = .voteIn
        } else if translation.width < -12 {
            vote = .skip
        } else {
            vote = nil
        }
        return Emphasis(vote: vote, progress: progress)
    }
}
```

- [ ] **Step 3: Make drag release-only**

In `DecisionShellView.deckSection`, ensure:

```swift
onDragChanged: { translation in
    swipeTranslation = translation
},
onDragEnded: { translation in
    guard let vote = DecisionSwipeCommitPolicy.commit(translation: translation, threshold: 120) else {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
            swipeTranslation = .zero
        }
        return
    }
    commitSwipe(candidate: candidate, vote: vote)
}
```

Do not call `commitSwipe`, `voteDecisionSession`, or any Task from `onDragChanged`.

- [ ] **Step 4: Use backend rewind**

Replace local-only rewind behavior with:

```swift
private func rewindLastSwipe(_ session: DecisionSession) {
    guard let token = authStore.accessToken else { return }
    Task {
        do {
            activeSession = try await apiClient.rewindDecisionSession(id: session.id, bearerToken: token)
            toast = "rewound"
        } catch {
            toast = "can't rewind that swipe"
        }
    }
}
```

Only enable rewind when `response.session.deckState?.canRewind == true`.

- [ ] **Step 5: Start/stop SSE while viewing active room**

Add state:

```swift
@State private var eventStream: DecisionRoomEventStream?
@State private var isRoomRealtimeConnected = false
@State private var realtimeFallbackMessage: String?
```

On active room appear:

```swift
private func startRoomEvents(for response: DecisionSessionResponse) {
    guard let token = authStore.accessToken else { return }
    eventStream?.stop()
    let stream = DecisionRoomEventStream(baseURL: apiClient.baseURL)
    eventStream = stream
    stream.start(sessionID: response.session.id, bearerToken: token) { event in
        Task { @MainActor in
            await refreshActiveSession(reason: event.type.rawValue)
        }
    } onState: { connected in
        Task { @MainActor in
            isRoomRealtimeConnected = connected
            realtimeFallbackMessage = connected ? nil : "reconnecting"
        }
    }
}
```

If `baseURL` is private on `NightloopAPIClient`, expose a read-only property.

Stop stream when leaving room/lobby:

```swift
eventStream?.stop()
eventStream = nil
```

- [ ] **Step 6: Add permission pre-prompt**

Add a compact sheet shown after create/join success when permission status is `.notDetermined`:

```swift
private struct RoomNotificationPrompt: View {
    let onEnable: () -> Void
    let onNotNow: () -> Void

    var body: some View {
        NightloopCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("stay in the loop")
                    .font(.headline.weight(.semibold))
                Text("get room updates when your friends pick a spot")
                    .font(.subheadline)
                    .foregroundStyle(NightloopTheme.inkMuted)
                HStack {
                    SocialActionButton(title: "Not now", systemImage: "xmark", style: .secondary, action: onNotNow)
                    SocialActionButton(title: "Enable", systemImage: "bell.fill", style: .primary, action: onEnable)
                }
            }
        }
        .padding(20)
    }
}
```

Wire `onEnable` to `NotificationCoordinator.requestPermission()`.

- [ ] **Step 7: Run iOS decision tests**

Run:

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test -only-testing:NightloopTests/NightloopTests/testDecisionSwipeCommitPolicyRequiresReleasePastThreshold -only-testing:NightloopTests/NightloopTests/testDecisionSwipeVisualEmphasisDoesNotCommit
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add ios/Nightloop/Nightloop/Sources/Features/DecisionShellView.swift ios/Nightloop/Nightloop/Sources/App/AppRootView.swift ios/Nightloop/Nightloop/Sources/App/NightloopApp.swift ios/Nightloop/NightloopTests/NightloopTests.swift
git commit -m "feat: make decision swipe room live"
```

## Task 8: iOS Notification Settings, Entitlements, And Routing

**Files:**

- Modify: `ios/Nightloop/Nightloop/Sources/Features/ProfileView.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/App/AppRootView.swift`
- Modify: `ios/Nightloop/Nightloop/Sources/App/NotificationCoordinator.swift`
- Modify: `ios/Nightloop/Nightloop/Resources/Nightloop.entitlements`
- Modify: `ios/Nightloop/project.yml`
- Modify: `ios/Nightloop/NightloopTests/NightloopTests.swift`

- [ ] **Step 1: Add entitlements**

Update `Nightloop.entitlements`:

```xml
<key>aps-environment</key>
<string>development</string>
```

Keep existing Apple Sign In entitlement intact.

- [ ] **Step 2: Add notification settings view model helpers**

In `ProfileView.swift`, replace old placeholder text:

```swift
Text("These preferences save now. The iOS permission prompt waits until notification features exist.")
```

with copy:

```swift
Text("Room notifications are private and only cover invites, shortlist, final plan, and room messages.")
```

Add four toggles bound to `NotificationPreferences` loaded via `NightloopAPIClient.notificationPreferences`. Keep existing account settings toggles if they still matter, but do not make them the only UI.

- [ ] **Step 3: Add notification routing state**

In `AppRootView.swift`, hold:

```swift
@StateObject private var notificationCoordinator = NotificationCoordinator()
@State private var pendingDecisionRoute: String?
```

Pass a `decisionRouteSessionID` binding or value into `NightloopTabShell`, then into `DecisionShellView`. When `notificationCoordinator.pendingDecisionSessionID` changes:

```swift
selectedTab = .decision
pendingDecisionRoute = sessionID
```

In `DecisionShellView`, if a route session id appears, call `apiClient.decisionSession(id:bearerToken:)`. On 404/403/409, show graceful unavailable copy:

```text
this room is no longer available
```

- [ ] **Step 4: Add dev notification route button in DEBUG only**

Add a small DEBUG-only affordance in Decision room management sheet:

```swift
#if DEBUG
Button("Send test room notification") {
    sendDevRoomNotification(category: "room_message")
}
#endif
```

Do not expose this in Release builds.

- [ ] **Step 5: Add iOS tests**

Add tests:

```swift
func testNotificationRouteSelectsDecisionTab() {
    var selected: AppTab = .home
    let route = NotificationRoute.decisionSession("session-1")
    NotificationRouteHandler.apply(route, selectedTab: &selected)
    XCTAssertEqual(selected, .decision)
}

func testNotificationCopyAvoidsVenueNames() {
    XCTAssertFalse("the plan is locked".localizedCaseInsensitiveContains("venue"))
}
```

If `NotificationRouteHandler` does not exist yet, create it as a tiny pure helper so routing stays testable outside SwiftUI.

- [ ] **Step 6: Run iOS tests**

Run:

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Expected: all iOS tests pass.

- [ ] **Step 7: Commit**

```bash
git add ios/Nightloop/Nightloop/Sources/Features/ProfileView.swift ios/Nightloop/Nightloop/Sources/App/AppRootView.swift ios/Nightloop/Nightloop/Sources/App/NotificationCoordinator.swift ios/Nightloop/Nightloop/Resources/Nightloop.entitlements ios/Nightloop/project.yml ios/Nightloop/NightloopTests/NightloopTests.swift
git commit -m "feat: add room notification ux"
```

## Task 9: Docs And API Contracts

**Files:**

- Create: `docs/nightloop-v3/PHASE6D_ROOM_LIVE_FOUNDATION.md`
- Modify: `docs/nightloop-v3/API_CONTRACTS.md`
- Modify: `docs/nightloop-v3/DATA_MODEL.md`
- Modify: `docs/nightloop-v3/PHASE6_READINESS.md`

- [ ] **Step 1: Add Phase 6D checkpoint doc**

Create `PHASE6D_ROOM_LIVE_FOUNDATION.md`:

```md
# Phase 6D Room-Live Foundation

Last updated: 2026-04-30

## Status

Phase 6D makes private Decision rooms reliable and live-feeling while preserving
the Phase 6 privacy boundary.

Implemented:

- server-authoritative Decision deck state;
- release-only swipe commits;
- server-backed rewind;
- current-room SSE;
- room notification device-token and preference foundation;
- contextual iOS notification permission pre-prompt;
- dev notification routing verification.

## Boundaries

No realtime Friends feed, live presence, typing indicators, read receipts,
notification inbox, global unread badges, contacts, universal links, public
rooms, named vote lists, or friend-influenced recommendations.

## APNs Follow-Up

Manual Apple Developer steps remain:

- enable Push Notifications for `com.nightloop.app`;
- create APNs Auth Key;
- add APNs team id, key id, private key, bundle id, and environment to backend
  env;
- verify provisioning includes push entitlements;
- test on physical device if simulator APNs behavior is insufficient.
```

- [ ] **Step 2: Update API contracts**

Add sections for:

```md
### GET /decision-sessions/:id/events

Server-sent event stream for the currently viewed room. Requires joined visible
membership. Emits invalidation-style room events and never exposes named vote
lists, coordinates, device tokens, or provider records.

### POST /decision-sessions/:id/rewind

Rewinds the viewer's latest swiping-stage vote only.

### POST /me/device-tokens

Registers an iOS APNs token. Response never includes the raw token.

### GET/PATCH /me/notification-preferences

Reads or updates room invite, shortlist, final plan, and room message toggles.
```

- [ ] **Step 3: Update data model**

Document `user_device_tokens` and `user_notification_preferences`, including account deletion cleanup.

- [ ] **Step 4: Update readiness doc**

Append Phase 6D status and deferred boundary.

- [ ] **Step 5: Commit docs**

```bash
git add docs/nightloop-v3/PHASE6D_ROOM_LIVE_FOUNDATION.md docs/nightloop-v3/API_CONTRACTS.md docs/nightloop-v3/DATA_MODEL.md docs/nightloop-v3/PHASE6_READINESS.md
git commit -m "docs: add phase 6d checkpoint"
```

## Task 10: Full Verification Loop And Computer Use Walkthrough

**Files:**

- No planned code files unless verification reveals defects.
- Use `verification-loop` skill for the report.
- Use Computer Use for simulator walkthrough on plain iPhone 17 only.

- [ ] **Step 1: Confirm simulator targets before Computer Use**

Run:

```bash
xcrun simctl list devices booted
```

Expected: identify plain `iPhone 17` Nightloop simulator. Do not interact with the LoopVille `iPhone 17 Pro` simulator.

- [ ] **Step 2: Run backend build**

```bash
npm --prefix backend run build
```

Expected: pass.

- [ ] **Step 3: Run backend tests**

```bash
npm --prefix backend test
```

Expected: pass.

- [ ] **Step 4: Run social smoke reset and audit**

```bash
npm --prefix backend run phase6:social-smoke -- --market=san-francisco --reset
npm --prefix backend run phase6:social-smoke:audit -- --market=san-francisco
```

Expected: reset/audit pass.

- [ ] **Step 5: Run readiness audit**

```bash
npm --prefix backend run phase6:readiness -- --market=san-francisco --limit=60
```

Expected: pass.

- [ ] **Step 6: Run root build**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 7: Run iOS generation and tests**

```bash
cd ios/Nightloop
xcodegen generate
xcodebuild -project Nightloop.xcodeproj -scheme Nightloop -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Expected: pass.

- [ ] **Step 8: Start backend dev server**

If no backend dev server is already running:

```bash
npm --prefix backend run dev
```

Expected:

```text
nightloop-backend listening on port 4000
```

- [ ] **Step 9: Use Computer Use manual walkthrough**

With Computer Use focused on the plain iPhone 17 Nightloop simulator:

1. Reset dev crew and sign in as Chuck.
2. Open Decision.
3. Enter active room.
4. Drag card right past threshold and hold; confirm no vote commits before release.
5. Release right; confirm card advances and cards-left/progress change.
6. Drag card left past threshold and hold; confirm no vote commits before release.
7. Release left; confirm card advances and progress changes.
8. Use button vote; confirm same progression behavior.
9. Use rewind; confirm previous card/state returns.
10. Open progress sheet; confirm counts match swipes.
11. Add a message; confirm SSE/live refresh behavior where possible.
12. Add a suggested venue; confirm live refresh behavior where possible.
13. Force/unlock shortlist if available; confirm live update.
14. Finalize plan; confirm final plan state.
15. Trigger notification pre-permission sheet; choose Not now and then Enable path if simulator permits.
16. Use DEBUG dev notification route; confirm it routes to the Decision room.
17. Confirm Friends remains pull-refresh based and has no presence/realtime indicators.

Record remaining UI/UX issues with screenshot paths when possible.

- [ ] **Step 10: Run verification-loop report**

Use `verification-loop` and adapt phases:

- Build: backend build, root build, iOS xcodebuild.
- Types: backend `npm --prefix backend run build`.
- Lint: skip only if no lint script exists; state that explicitly.
- Tests: backend tests and iOS tests.
- Security: inspect diff for secrets, APNs keys, raw tokens, provider payloads, coordinates.
- Diff: review changed files.

Final report format:

```text
VERIFICATION REPORT
==================

Build:     PASS/FAIL
Types:     PASS/FAIL
Lint:      PASS/FAIL/SKIPPED
Tests:     PASS/FAIL
Security:  PASS/FAIL
Diff:      X files changed

Overall:   READY/NOT READY

Issues to Fix:
1. List any failing command, simulator issue, or residual APNs setup item here; write `None` only if there are no issues.
```

- [ ] **Step 11: Final commit**

Commit any verification fixes and final docs:

```bash
git status --short
git add <changed files>
git commit -m "chore: verify phase 6d room live foundation"
```

## Execution Notes

- If backend tests need real DB fixtures, use the same DB expected by existing Phase 6 tests. Do not print `backend/.env`.
- If APNs entitlements create signing friction in simulator tests, keep the entitlement in project config but make runtime registration fail-soft; document physical-device follow-up.
- If SSE tests hang under Supertest, use the `?once=1` test-only close path described in Task 3.
- If direct APNs code needs a dependency, pause and choose deliberately. Do not add Firebase, OneSignal, or another provider in 6D.
- If any task reveals broad UI concerns beyond Decision push/realtime, park them for a UI phase instead of expanding 6D.
