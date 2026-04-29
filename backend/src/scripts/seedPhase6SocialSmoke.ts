import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, dbTransaction, getDBClient, type DBClient } from "../lib/db";
import type { AccountState } from "../services/v1/accountService";
import {
  addDecisionSessionMessage,
  advanceDecisionSessionShortlist,
  createDecisionSession,
  finalizeDecisionSession,
  joinDecisionSession,
  suggestDecisionCandidate,
  voteDecisionSession
} from "../services/v1/decisionService";
import {
  PHASE6_SOCIAL_SMOKE_SEED_TAG,
  PHASE6_SOCIAL_SMOKE_USERS,
  collectPhase6SocialSmokeSnapshot,
  validatePhase6SocialSmokeSnapshot
} from "../services/v1/socialSmokeAudit";

type SeedUser = {
  authUserId: string;
  displayName: string;
  username: string;
  preferences: Record<string, readonly string[]>;
};

type SeededUser = SeedUser & {
  id: string;
};

type Args = {
  market: string;
  reset: boolean;
};

type SeedSummary = {
  market: string;
  market_id: string;
  venue: string;
  users: Array<{ id: string; username: string; auth_user_id: string }>;
  audit: ReturnType<typeof validatePhase6SocialSmokeSnapshot>;
};

const USERS: readonly SeedUser[] = PHASE6_SOCIAL_SMOKE_USERS;

function parseArgs(argv: string[]): Args {
  return {
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    reset: argv.includes("--reset")
  };
}

async function getMarket(client: DBClient, market: string) {
  const result = await client.query<{ id: string; slug: string; short_label: string; timezone: string }>(
    `
      SELECT id, slug, short_label, timezone
      FROM markets
      WHERE id::text = $1 OR slug = $1
      LIMIT 1
    `,
    [market]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Market not found: ${market}`);
  return row;
}

async function getVenue(client: DBClient, marketId: string) {
  const result = await client.query<{ id: string; name: string }>(
    `
      SELECT id, name
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
      ORDER BY
        CASE
          WHEN name ILIKE '%1015%' THEN 0
          WHEN name ILIKE '%Cafe Du Nord%' THEN 1
          ELSE 2
        END,
        name ASC
      LIMIT 1
    `,
    [marketId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Expected at least one approved venue for social smoke seed.");
  return row;
}

async function nightlifeEnd(client: DBClient, marketId: string): Promise<string> {
  const result = await client.query<{ expires_at: string }>(
    `
      SELECT (
        (
          date_trunc('day', NOW() AT TIME ZONE timezone)
          + CASE
              WHEN (NOW() AT TIME ZONE timezone)::time < TIME '04:00'
                THEN INTERVAL '4 hours'
              ELSE INTERVAL '1 day 4 hours'
            END
        ) AT TIME ZONE timezone
      ) AS expires_at
      FROM markets
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [marketId]
  );
  return result.rows[0]?.expires_at ?? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
}

async function resetSeed(client: DBClient): Promise<void> {
  const authIds = USERS.map((user) => user.authUserId);
  await client.query(
    `
      DELETE FROM signals
      WHERE payload->>'seed' = $1
         OR user_id IN (SELECT id FROM users WHERE auth_user_id = any($2::uuid[]))
    `,
    [PHASE6_SOCIAL_SMOKE_SEED_TAG, authIds]
  );
  await client.query("DELETE FROM users WHERE auth_user_id = any($1::uuid[])", [authIds]);
}

async function upsertUser(client: DBClient, user: SeedUser, marketId: string): Promise<SeededUser> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (auth_user_id, eligibility_status, age_attested_at, deleted_at)
      VALUES ($1::uuid, 'eligible', NOW(), NULL)
      ON CONFLICT (auth_user_id) DO UPDATE SET
        eligibility_status = 'eligible',
        age_attested_at = COALESCE(users.age_attested_at, NOW()),
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING id
    `,
    [user.authUserId]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Failed to seed ${user.username}.`);

  await client.query(
    `
      INSERT INTO user_profiles (user_id, display_name, username, selected_market_id, avatar_kind, bio)
      VALUES ($1::uuid, $2, $3, $4::uuid, 'initials', $5)
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        username = EXCLUDED.username,
        selected_market_id = EXCLUDED.selected_market_id,
        avatar_kind = EXCLUDED.avatar_kind,
        bio = EXCLUDED.bio,
        updated_at = NOW()
    `,
    [id, user.displayName, user.username, marketId, "Phase 6 dev smoke profile."]
  );
  await client.query(
    `
      INSERT INTO user_settings (user_id, ghost_mode)
      VALUES ($1::uuid, false)
      ON CONFLICT (user_id) DO UPDATE SET
        ghost_mode = false,
        updated_at = NOW()
    `,
    [id]
  );
  await client.query("DELETE FROM user_preferences WHERE user_id = $1::uuid", [id]);
  for (const [category, keys] of Object.entries(user.preferences)) {
    for (const [position, key] of keys.entries()) {
      await client.query(
        `
          INSERT INTO user_preferences (user_id, category, preference_key, position)
          VALUES ($1::uuid, $2, $3, $4)
        `,
        [id, category, key, position]
      );
    }
  }

  return { ...user, id };
}

async function upsertFriendship(client: DBClient, leftUserId: string, rightUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO friendships (requester_user_id, addressee_user_id, status, responded_at)
      VALUES ($1::uuid, $2::uuid, 'accepted', NOW())
      ON CONFLICT (
        LEAST(requester_user_id::text, addressee_user_id::text),
        GREATEST(requester_user_id::text, addressee_user_id::text)
      ) DO UPDATE SET
        status = 'accepted',
        responded_at = NOW(),
        updated_at = NOW()
    `,
    [leftUserId, rightUserId]
  );
}

async function seedSocialRows(
  client: DBClient,
  users: SeededUser[],
  marketId: string,
  venueId: string,
  expiresAt: string
): Promise<void> {
  const [alex, maya, jules, blocked] = users;
  await upsertFriendship(client, alex.id, maya.id);
  await upsertFriendship(client, alex.id, jules.id);
  await client.query(
    `
      DELETE FROM friendships
      WHERE LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
        AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
    `,
    [alex.id, blocked.id]
  );
  await client.query(
    `
      INSERT INTO blocked_users (blocker_user_id, blocked_user_id)
      VALUES ($1::uuid, $2::uuid)
      ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
    `,
    [alex.id, blocked.id]
  );

  const signal = await client.query<{ id: string }>(
    `
      INSERT INTO signals (
        venue_id,
        signal_type,
        signal_value,
        confidence,
        observed_at,
        source,
        payload,
        user_id,
        kind,
        points_awarded,
        trust_weight,
        expires_at
      )
      VALUES ($1::uuid, 'crowd_level', 0.82, 0.92, NOW(), 'user_signal', $2::jsonb, $3::uuid, 'packed', 3, 1, $4::timestamptz)
      RETURNING id
    `,
    [venueId, JSON.stringify({ seed: PHASE6_SOCIAL_SMOKE_SEED_TAG, sanitized: true }), maya.id, expiresAt]
  );
  const signalActivity = await client.query<{ id: string }>(
    `
      INSERT INTO activity_events (
        actor_user_id,
        venue_id,
        market_id,
        source_signal_id,
        type,
        visibility,
        signal_kind,
        expires_at,
        metadata
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'signal', 'friends', 'packed', $5::timestamptz, $6::jsonb)
      RETURNING id
    `,
    [maya.id, venueId, marketId, signal.rows[0]?.id, expiresAt, JSON.stringify({ seed: PHASE6_SOCIAL_SMOKE_SEED_TAG })]
  );
  const comingActivity = await client.query<{ id: string }>(
    `
      INSERT INTO activity_events (
        actor_user_id,
        venue_id,
        market_id,
        type,
        visibility,
        expires_at,
        metadata
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'coming', 'friends', $4::timestamptz, $5::jsonb)
      RETURNING id
    `,
    [alex.id, venueId, marketId, expiresAt, JSON.stringify({ seed: PHASE6_SOCIAL_SMOKE_SEED_TAG })]
  );
  await client.query(
    `
      INSERT INTO attendance_intents (user_id, venue_id, market_id, status, activity_id, expires_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4::uuid, $5::timestamptz)
      ON CONFLICT (user_id, venue_id) WHERE status = 'active' DO UPDATE SET
        activity_id = EXCLUDED.activity_id,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `,
    [alex.id, venueId, marketId, comingActivity.rows[0]?.id, expiresAt]
  );
  await client.query(
    `
      INSERT INTO activity_events (
        actor_user_id,
        target_user_id,
        parent_activity_id,
        type,
        visibility,
        text,
        expires_at,
        metadata
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'comment', 'friends', 'I am leaning yes.', $4::timestamptz, $5::jsonb)
    `,
    [jules.id, maya.id, signalActivity.rows[0]?.id, expiresAt, JSON.stringify({ seed: PHASE6_SOCIAL_SMOKE_SEED_TAG })]
  );
}

function accountForSeededUser(user: SeededUser, marketId: string): AccountState {
  const now = new Date().toISOString();
  return {
    user: {
      id: user.id,
      auth_user_id: user.authUserId,
      eligibility_status: "eligible",
      age_attested_at: now,
      signal_scout_points: 0,
      deleted_at: null,
      created_at: now,
      updated_at: now
    },
    profile: {
      user_id: user.id,
      display_name: user.displayName,
      username: user.username,
      selected_market_id: marketId,
      avatar_kind: "initials",
      bio: "Phase 6 dev smoke profile.",
      created_at: now,
      updated_at: now
    },
    settings: {
      user_id: user.id,
      ghost_mode: false,
      map_show_neighborhood_labels: true,
      map_show_street_grid: true,
      push_social_enabled: true,
      push_decision_enabled: true,
      push_favorite_venue_alerts_enabled: false,
      created_at: now,
      updated_at: now
    },
    preferences: Object.fromEntries(
      Object.entries(user.preferences).map(([category, values]) => [category, [...values]])
    )
  };
}

async function markSeededDecisionRoom(sessionId: string, label: string): Promise<void> {
  await dbQuery(
    `
      UPDATE decision_sessions
      SET metadata = metadata || $2::jsonb
      WHERE id = $1::uuid
    `,
    [
      sessionId,
      JSON.stringify({
        seed: PHASE6_SOCIAL_SMOKE_SEED_TAG,
        smoke_label: label
      })
    ]
  );
}

async function venueOutsideCandidates(marketId: string, candidateVenueIds: string[]): Promise<string> {
  const result = await dbQuery<{ id: string }>(
    `
      SELECT id
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
        AND NOT (id = ANY($2::uuid[]))
      ORDER BY name ASC
      LIMIT 1
    `,
    [marketId, candidateVenueIds]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Expected a suggestion venue outside the initial decision slate.");
  return row.id;
}

async function seedDecisionRooms(users: SeededUser[], marketId: string): Promise<void> {
  const [alex, maya, jules] = users;
  const alexAccount = accountForSeededUser(alex, marketId);
  const mayaAccount = accountForSeededUser(maya, marketId);
  const julesAccount = accountForSeededUser(jules, marketId);

  const openRoom = await createDecisionSession({
    account: alexAccount,
    marketId,
    invitedUserIds: [maya.id, jules.id]
  });
  await markSeededDecisionRoom(openRoom.session.id, "open_group_pick");
  await joinDecisionSession({ account: mayaAccount, sessionId: openRoom.session.id });
  await joinDecisionSession({ account: julesAccount, sessionId: openRoom.session.id });
  const suggestedVenueId = await venueOutsideCandidates(
    marketId,
    openRoom.candidates.map((candidate) => candidate.venue_id)
  );
  const suggested = await suggestDecisionCandidate({
    account: mayaAccount,
    sessionId: openRoom.session.id,
    venueId: suggestedVenueId
  });
  const suggestedCandidate = suggested.candidates.find((candidate) => candidate.venue_id === suggestedVenueId);
  if (!suggestedCandidate) {
    throw new Error("Expected suggested smoke candidate to exist.");
  }
  await voteDecisionSession({
    account: julesAccount,
    sessionId: openRoom.session.id,
    candidateId: suggestedCandidate.id,
    vote: "in"
  });
  await addDecisionSessionMessage({
    account: mayaAccount,
    sessionId: openRoom.session.id,
    type: "text",
    text: "This one feels right for tonight."
  });
  await addDecisionSessionMessage({
    account: alexAccount,
    sessionId: openRoom.session.id,
    type: "emoji",
    emoji: "fire"
  });

  const finalizedRoom = await createDecisionSession({
    account: alexAccount,
    marketId,
    invitedUserIds: [maya.id]
  });
  await markSeededDecisionRoom(finalizedRoom.session.id, "finalized_group_pick");
  await joinDecisionSession({ account: mayaAccount, sessionId: finalizedRoom.session.id });
  await advanceDecisionSessionShortlist({
    account: alexAccount,
    sessionId: finalizedRoom.session.id
  });
  const meetupAt = new Date(Date.parse(finalizedRoom.session.expires_at) - 2 * 60 * 60 * 1000).toISOString();
  await finalizeDecisionSession({
    account: alexAccount,
    sessionId: finalizedRoom.session.id,
    candidateId: finalizedRoom.candidates[0].id,
    finalMeetupAt: meetupAt,
    finalNote: "Meet near the entrance."
  });
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

  const args = parseArgs(process.argv.slice(2));
  let summary: SeedSummary | undefined;

  await dbTransaction(async (client) => {
    if (args.reset) {
      await resetSeed(client);
    }
    const market = await getMarket(client, args.market);
    const venue = await getVenue(client, market.id);
    const expiresAt = await nightlifeEnd(client, market.id);
    const users = [];
    for (const user of USERS) {
      users.push(await upsertUser(client, user, market.id));
    }
    await seedSocialRows(client, users, market.id, venue.id, expiresAt);
    summary = {
      market: market.slug,
      market_id: market.id,
      venue: venue.name,
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        auth_user_id: user.authUserId
      })),
      audit: {
        ok: false,
        failures: [],
        snapshot: await collectPhase6SocialSmokeSnapshot(client, market.slug)
      }
    };
  });

  const seededSummary = summary;
  if (!seededSummary) {
    throw new Error("Phase 6 social smoke seed failed before summary.");
  }
  const seededUsers = seededSummary.users.map((row) => {
    const template = USERS.find((user) => user.username === row.username);
    if (!template) throw new Error(`Missing smoke template for ${row.username}`);
    return { ...template, id: row.id };
  });
  await seedDecisionRooms(seededUsers, seededSummary.market_id);
  const audit = validatePhase6SocialSmokeSnapshot(
    await collectPhase6SocialSmokeSnapshot({ query: dbQuery }, seededSummary.market)
  );
  if (!audit.ok) {
    throw new Error(`Phase 6 social smoke audit failed: ${audit.failures.map((failure) => failure.code).join(", ")}`);
  }
  seededSummary.audit = audit;

  console.log("Phase 6 social smoke seed ready.");
  console.log("Phase 6 social smoke audit passed.");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Note: these are database dev profiles, not Supabase Auth sign-in credentials.");
}

main()
  .catch((error) => {
    console.error("[phase6:social-smoke] ERROR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDBClient().close?.();
  });
