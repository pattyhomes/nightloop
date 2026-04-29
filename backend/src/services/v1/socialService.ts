import { createHash, randomBytes } from "crypto";
import { ApiError, notFoundError, validationError } from "../../lib/apiError";
import { dbQuery, dbTransaction, type DBClient } from "../../lib/db";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";

type FriendshipStatus = "none" | "pending" | "accepted" | "declined";
type Direction = "incoming" | "outgoing" | "none";
type SignalKind = "packed" | "short_line" | "long_line" | "dead" | "event_live";

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_kind: string;
  bio: string | null;
  friendship_id: string | null;
  friendship_status: FriendshipStatus | null;
  requester_user_id: string | null;
  addressee_user_id: string | null;
};

type FriendshipRow = {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: Exclude<FriendshipStatus, "none">;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type InviteRow = {
  id: string;
  user_id: string;
  code_hint: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  actor_user_id: string;
  target_user_id: string | null;
  venue_id: string | null;
  market_id: string | null;
  parent_activity_id: string | null;
  type: "signal" | "coming" | "comment" | "emoji_signal";
  signal_kind: SignalKind | null;
  text: string | null;
  expires_at: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_display_name: string;
  actor_username: string;
  actor_avatar_kind: string;
  actor_bio: string | null;
  venue_name: string | null;
  venue_neighborhood: string | null;
  venue_category: string | null;
  replies: ActivityReply[];
  viewer_has_coming: boolean | null;
  coming_count: number | null;
};

type ActivityReply = {
  id: string;
  type: "comment" | "emoji_signal";
  text: string | null;
  signal_kind: SignalKind | null;
  created_at: string;
  actor: {
    id: string;
    display_name: string;
    username: string;
    avatar_kind: string;
  };
};

const INVITE_TTL_DAYS = 7;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SIGNAL_KINDS = new Set(["packed", "short_line", "long_line", "dead", "event_live"]);

function publicProfile(row: Pick<ProfileRow, "id" | "display_name" | "username" | "avatar_kind" | "bio">) {
  return {
    id: row.id,
    display_name: row.display_name,
    username: row.username,
    avatar_kind: row.avatar_kind,
    bio: row.bio
  };
}

function friendshipDirection(
  row: { requester_user_id: string | null; addressee_user_id: string | null },
  viewerUserId: string
): Direction {
  if (!row.requester_user_id || !row.addressee_user_id) return "none";
  if (row.requester_user_id === viewerUserId) return "outgoing";
  if (row.addressee_user_id === viewerUserId) return "incoming";
  return "none";
}

function formatFriendship(row: FriendshipRow, viewerUserId: string) {
  return {
    id: row.id,
    status: row.status,
    direction: friendshipDirection(row, viewerUserId),
    requester_user_id: row.requester_user_id,
    addressee_user_id: row.addressee_user_id,
    responded_at: row.responded_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function formatProfileSearch(row: ProfileRow, viewerUserId: string) {
  return {
    ...publicProfile(row),
    friendship_status: row.friendship_status ?? "none",
    friendship_id: row.friendship_id,
    direction: friendshipDirection(row, viewerUserId)
  };
}

function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}

function generateInviteCode(): string {
  const chars = Array.from(randomBytes(8)).map((byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]);
  return `NL-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

async function findEligibleProfile(client: DBClient, userId: string): Promise<ProfileRow> {
  const result = await client.query<ProfileRow>(
    `
      SELECT
        u.id,
        p.display_name,
        p.username,
        p.avatar_kind,
        p.bio,
        NULL::uuid::text AS friendship_id,
        NULL::text AS friendship_status,
        NULL::uuid::text AS requester_user_id,
        NULL::uuid::text AS addressee_user_id
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1::uuid
        AND u.deleted_at IS NULL
        AND u.eligibility_status = 'eligible'
      LIMIT 1
    `,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("User profile was not found.");
  }
  return row;
}

async function assertNotBlocked(client: DBClient, leftUserId: string, rightUserId: string): Promise<void> {
  const result = await client.query<{ blocked: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM blocked_users
        WHERE (blocker_user_id = $1::uuid AND blocked_user_id = $2::uuid)
           OR (blocker_user_id = $2::uuid AND blocked_user_id = $1::uuid)
      ) AS blocked
    `,
    [leftUserId, rightUserId]
  );
  if (result.rows[0]?.blocked) {
    throw new ApiError(403, "USER_BLOCKED", "This social action is blocked.");
  }
}

async function readFriendshipPair(client: DBClient, leftUserId: string, rightUserId: string): Promise<FriendshipRow | null> {
  const result = await client.query<FriendshipRow>(
    `
      SELECT id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
      FROM friendships
      WHERE LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
        AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
      LIMIT 1
    `,
    [leftUserId, rightUserId]
  );
  return result.rows[0] ?? null;
}

async function assertFriendshipForActivity(client: DBClient, viewerUserId: string, actorUserId: string): Promise<void> {
  if (viewerUserId === actorUserId) return;
  await assertNotBlocked(client, viewerUserId, actorUserId);
  const friendship = await readFriendshipPair(client, viewerUserId, actorUserId);
  if (friendship?.status !== "accepted") {
    throw new ApiError(403, "FRIENDSHIP_REQUIRED", "This social activity is only visible to friends.");
  }
}

function withTestMetadata(details: Record<string, unknown> | undefined): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (details?.test_run_id && typeof details.test_run_id === "string") {
    metadata.test_run_id = details.test_run_id;
  }
  return metadata;
}

function formatInvite(row: InviteRow, code?: string) {
  return {
    id: row.id,
    ...(code ? { code } : {}),
    code_hint: row.code_hint,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at
  };
}

function formatActivity(row: ActivityRow) {
  return {
    id: row.id,
    type: row.type,
    signal_kind: row.signal_kind,
    text: row.text,
    actor: {
      id: row.actor_user_id,
      display_name: row.actor_display_name,
      username: row.actor_username,
      avatar_kind: row.actor_avatar_kind,
      bio: row.actor_bio
    },
    venue: row.venue_id
      ? {
          id: row.venue_id,
          name: row.venue_name,
          neighborhood: row.venue_neighborhood,
          category: row.venue_category
        }
      : null,
    viewer_has_coming: Boolean(row.viewer_has_coming),
    coming_count: Number(row.coming_count ?? 0),
    replies: row.replies ?? [],
    expires_at: row.expires_at,
    created_at: row.created_at
  };
}

async function insertActivityForVenue(
  client: DBClient,
  input: {
    actorUserId: string;
    venueId: string;
    type: "signal" | "coming";
    signalKind?: SignalKind;
    sourceSignalId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ActivityRow> {
  const result = await client.query<ActivityRow>(
    `
      WITH venue_context AS (
        SELECT
          v.id AS venue_id,
          v.market_id,
          (
            (
              date_trunc('day', NOW() AT TIME ZONE m.timezone)
              + CASE
                  WHEN (NOW() AT TIME ZONE m.timezone)::time < TIME '04:00'
                    THEN INTERVAL '4 hours'
                  ELSE INTERVAL '1 day 4 hours'
                END
            ) AT TIME ZONE m.timezone
          ) AS expires_at
        FROM venues v
        JOIN markets m ON m.id = v.market_id
        WHERE v.id = $2::uuid
          AND v.is_active = true
          AND v.admin_status = 'approved'
        LIMIT 1
      )
      INSERT INTO activity_events (
        actor_user_id,
        venue_id,
        market_id,
        type,
        signal_kind,
        source_signal_id,
        expires_at,
        metadata
      )
      SELECT
        $1::uuid,
        venue_id,
        market_id,
        $3,
        $4,
        $5::uuid,
        expires_at,
        $6::jsonb
      FROM venue_context
      RETURNING
        id,
        actor_user_id,
        target_user_id,
        venue_id,
        market_id,
        parent_activity_id,
        type,
        signal_kind,
        text,
        expires_at,
        created_at,
        metadata,
        (SELECT display_name FROM user_profiles WHERE user_id = $1::uuid) AS actor_display_name,
        (SELECT username FROM user_profiles WHERE user_id = $1::uuid) AS actor_username,
        (SELECT avatar_kind FROM user_profiles WHERE user_id = $1::uuid) AS actor_avatar_kind,
        (SELECT bio FROM user_profiles WHERE user_id = $1::uuid) AS actor_bio,
        (SELECT name FROM venues WHERE id = $2::uuid) AS venue_name,
        (SELECT COALESCE(metadata->>'neighborhood', metadata->>'district') FROM venues WHERE id = $2::uuid) AS venue_neighborhood,
        (SELECT COALESCE(canonical_type, metadata->>'category') FROM venues WHERE id = $2::uuid) AS venue_category,
        '[]'::jsonb AS replies,
        false AS viewer_has_coming,
        0 AS coming_count
    `,
    [
      input.actorUserId,
      input.venueId,
      input.type,
      input.signalKind ?? null,
      input.sourceSignalId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Venue was not found.");
  }
  return row;
}

export async function searchProfiles(input: { account: AccountState; q: string; limit?: number }) {
  requireEligible(input.account);
  const q = input.q.trim();
  if (q.length < 2) {
    throw validationError("Search query must be at least two characters.", { q: "Too short" });
  }
  const limit = Math.max(1, Math.min(30, Math.floor(input.limit ?? 20)));
  const result = await dbQuery<ProfileRow>(
    `
      SELECT
        u.id,
        p.display_name,
        p.username,
        p.avatar_kind,
        p.bio,
        f.id AS friendship_id,
        f.status AS friendship_status,
        f.requester_user_id,
        f.addressee_user_id
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN friendships f
        ON LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($1::uuid::text, u.id::text)
       AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($1::uuid::text, u.id::text)
      WHERE u.id <> $1::uuid
        AND u.deleted_at IS NULL
        AND u.eligibility_status = 'eligible'
        AND (p.username ILIKE '%' || $2 || '%' OR p.display_name ILIKE '%' || $2 || '%')
        AND NOT EXISTS (
          SELECT 1
          FROM blocked_users b
          WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = u.id)
             OR (b.blocker_user_id = u.id AND b.blocked_user_id = $1::uuid)
        )
      ORDER BY
        CASE WHEN p.username ILIKE $2 || '%' THEN 0 ELSE 1 END,
        p.username ASC
      LIMIT $3
    `,
    [input.account.user.id, q, limit]
  );

  return { items: result.rows.map((row) => formatProfileSearch(row, input.account.user.id)) };
}

export async function listFriends(account: AccountState) {
  requireEligible(account);
  const result = await dbQuery<ProfileRow & FriendshipRow>(
    `
      SELECT
        other_user.id,
        other_profile.display_name,
        other_profile.username,
        other_profile.avatar_kind,
        other_profile.bio,
        f.id AS friendship_id,
        f.status AS friendship_status,
        f.requester_user_id,
        f.addressee_user_id,
        f.status,
        f.responded_at,
        f.created_at,
        f.updated_at
      FROM friendships f
      JOIN users other_user ON other_user.id = CASE
        WHEN f.requester_user_id = $1::uuid THEN f.addressee_user_id
        ELSE f.requester_user_id
      END
      JOIN user_profiles other_profile ON other_profile.user_id = other_user.id
      WHERE (f.requester_user_id = $1::uuid OR f.addressee_user_id = $1::uuid)
        AND f.status IN ('pending', 'accepted')
        AND other_user.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM blocked_users b
          WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = other_user.id)
             OR (b.blocker_user_id = other_user.id AND b.blocked_user_id = $1::uuid)
        )
      ORDER BY f.updated_at DESC
    `,
    [account.user.id]
  );

  const items = result.rows.map((row) => ({
    user: publicProfile(row),
    friendship: formatFriendship(
      {
        id: row.friendship_id ?? row.id,
        requester_user_id: row.requester_user_id,
        addressee_user_id: row.addressee_user_id,
        status: row.status,
        responded_at: row.responded_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      },
      account.user.id
    )
  }));

  return {
    friends: items.filter((item) => item.friendship.status === "accepted"),
    incoming_requests: items.filter(
      (item) => item.friendship.status === "pending" && item.friendship.direction === "incoming"
    ),
    outgoing_requests: items.filter(
      (item) => item.friendship.status === "pending" && item.friendship.direction === "outgoing"
    )
  };
}

export async function sendFriendRequest(account: AccountState, targetUserId: string) {
  requireEligible(account);
  return dbTransaction(async (client) => {
    if (targetUserId === account.user.id) {
      throw validationError("You cannot friend yourself.", { user_id: "Self request" });
    }
    const target = await findEligibleProfile(client, targetUserId);
    await assertNotBlocked(client, account.user.id, targetUserId);
    const existing = await readFriendshipPair(client, account.user.id, targetUserId);
    let row: FriendshipRow | null = existing;
    let created = false;

    if (!existing) {
      const inserted = await client.query<FriendshipRow>(
        `
          INSERT INTO friendships (requester_user_id, addressee_user_id, status)
          VALUES ($1::uuid, $2::uuid, 'pending')
          RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
        `,
        [account.user.id, targetUserId]
      );
      row = inserted.rows[0] ?? null;
      created = true;
    } else if (existing.status === "declined") {
      const updated = await client.query<FriendshipRow>(
        `
          UPDATE friendships
          SET requester_user_id = $1::uuid,
              addressee_user_id = $2::uuid,
              status = 'pending',
              responded_at = NULL,
              updated_at = NOW()
          WHERE id = $3::uuid
          RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
        `,
        [account.user.id, targetUserId, existing.id]
      );
      row = updated.rows[0] ?? null;
      created = true;
    }

    if (!row) {
      throw new Error("Failed to create friend request.");
    }

    return {
      created,
      user: publicProfile(target),
      friendship: formatFriendship(row, account.user.id)
    };
  });
}

export async function acceptFriendRequest(account: AccountState, friendshipId: string) {
  requireEligible(account);
  const result = await dbQuery<FriendshipRow>(
    `
      UPDATE friendships
      SET status = 'accepted',
          responded_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND addressee_user_id = $2::uuid
        AND status = 'pending'
      RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
    `,
    [friendshipId, account.user.id]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Friend request was not found.");
  }
  return { friendship: formatFriendship(row, account.user.id) };
}

export async function declineFriendRequest(account: AccountState, friendshipId: string) {
  requireEligible(account);
  const result = await dbQuery<FriendshipRow>(
    `
      UPDATE friendships
      SET status = 'declined',
          responded_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND addressee_user_id = $2::uuid
        AND status = 'pending'
      RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
    `,
    [friendshipId, account.user.id]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Friend request was not found.");
  }
  return { friendship: formatFriendship(row, account.user.id) };
}

export async function cancelFriendRequest(account: AccountState, friendshipId: string) {
  requireEligible(account);
  const result = await dbQuery<{ id: string }>(
    `
      DELETE FROM friendships
      WHERE id = $1::uuid
        AND requester_user_id = $2::uuid
        AND status = 'pending'
      RETURNING id
    `,
    [friendshipId, account.user.id]
  );
  if (!result.rows[0]) {
    throw notFoundError("Friend request was not found.");
  }
  return { status: "cancelled" };
}

export async function unfriend(account: AccountState, friendUserId: string) {
  requireEligible(account);
  const result = await dbQuery<{ id: string }>(
    `
      DELETE FROM friendships
      WHERE status = 'accepted'
        AND LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
        AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
      RETURNING id
    `,
    [account.user.id, friendUserId]
  );
  if (!result.rows[0]) {
    throw notFoundError("Friendship was not found.");
  }
  return { status: "removed" };
}

export async function blockUser(account: AccountState, targetUserId: string) {
  requireEligible(account);
  if (targetUserId === account.user.id) {
    throw validationError("You cannot block yourself.", { user_id: "Self block" });
  }
  const target = await findEligibleProfile({ query: dbQuery }, targetUserId);
  await dbTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO blocked_users (blocker_user_id, blocked_user_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      `,
      [account.user.id, targetUserId]
    );
    await client.query(
      `
        DELETE FROM friendships
        WHERE LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
          AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
      `,
      [account.user.id, targetUserId]
    );
  });
  return { blocked: publicProfile(target) };
}

export async function unblockUser(account: AccountState, targetUserId: string) {
  requireEligible(account);
  await dbQuery(
    `
      DELETE FROM blocked_users
      WHERE blocker_user_id = $1::uuid
        AND blocked_user_id = $2::uuid
    `,
    [account.user.id, targetUserId]
  );
  return { status: "unblocked" };
}

export async function listBlocks(account: AccountState) {
  requireEligible(account);
  const result = await dbQuery<ProfileRow>(
    `
      SELECT
        u.id,
        p.display_name,
        p.username,
        p.avatar_kind,
        p.bio,
        NULL::uuid::text AS friendship_id,
        NULL::text AS friendship_status,
        NULL::uuid::text AS requester_user_id,
        NULL::uuid::text AS addressee_user_id
      FROM blocked_users b
      JOIN users u ON u.id = b.blocked_user_id
      JOIN user_profiles p ON p.user_id = u.id
      WHERE b.blocker_user_id = $1::uuid
      ORDER BY b.created_at DESC
    `,
    [account.user.id]
  );
  return { items: result.rows.map(publicProfile) };
}

export async function createFriendInvite(account: AccountState) {
  requireEligible(account);
  const code = generateInviteCode();
  const tokenHash = hashInviteCode(code);
  const result = await dbQuery<InviteRow>(
    `
      INSERT INTO friend_invites (user_id, token_hash, code_hint, expires_at)
      VALUES ($1::uuid, $2, $3, NOW() + ($4::int || ' days')::interval)
      RETURNING id, user_id, code_hint, expires_at, revoked_at, created_at, updated_at
    `,
    [account.user.id, tokenHash, code.slice(-4), INVITE_TTL_DAYS]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create invite.");
  }
  return { invite: formatInvite(row, code) };
}

export async function revokeFriendInvite(account: AccountState, inviteId: string) {
  requireEligible(account);
  const result = await dbQuery<InviteRow>(
    `
      UPDATE friend_invites
      SET revoked_at = COALESCE(revoked_at, NOW()),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND user_id = $2::uuid
      RETURNING id, user_id, code_hint, expires_at, revoked_at, created_at, updated_at
    `,
    [inviteId, account.user.id]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Invite was not found.");
  }
  return { invite: formatInvite(row) };
}

export async function acceptFriendInvite(account: AccountState, code: string) {
  requireEligible(account);
  const tokenHash = hashInviteCode(code);
  return dbTransaction(async (client) => {
    const inviteResult = await client.query<InviteRow>(
      `
        SELECT id, user_id, code_hint, expires_at, revoked_at, created_at, updated_at
        FROM friend_invites
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash]
    );
    const invite = inviteResult.rows[0];
    if (!invite || invite.user_id === account.user.id) {
      throw notFoundError("Invite was not found.");
    }
    await findEligibleProfile(client, invite.user_id);
    await assertNotBlocked(client, account.user.id, invite.user_id);

    const existing = await readFriendshipPair(client, account.user.id, invite.user_id);
    let friendship: FriendshipRow | null = existing;
    if (!existing) {
      const inserted = await client.query<FriendshipRow>(
        `
          INSERT INTO friendships (requester_user_id, addressee_user_id, status, responded_at)
          VALUES ($1::uuid, $2::uuid, 'accepted', NOW())
          RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
        `,
        [invite.user_id, account.user.id]
      );
      friendship = inserted.rows[0] ?? null;
    } else if (existing.status !== "accepted") {
      const updated = await client.query<FriendshipRow>(
        `
          UPDATE friendships
          SET status = 'accepted',
              responded_at = NOW(),
              updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, requester_user_id, addressee_user_id, status, responded_at, created_at, updated_at
        `,
        [existing.id]
      );
      friendship = updated.rows[0] ?? null;
    }

    await client.query(
      `
        UPDATE friend_invites
        SET accepted_count = accepted_count + 1,
            last_accepted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [invite.id]
    );

    if (!friendship) {
      throw new Error("Failed to accept invite.");
    }
    return { friendship: formatFriendship(friendship, account.user.id) };
  });
}

export async function createSignalActivity(input: {
  account: AccountState;
  venueId: string;
  signalId: string;
  signalKind: SignalKind;
}): Promise<void> {
  if (input.account.settings?.ghost_mode) return;
  await insertActivityForVenue({ query: dbQuery }, {
    actorUserId: input.account.user.id,
    venueId: input.venueId,
    type: "signal",
    signalKind: input.signalKind,
    sourceSignalId: input.signalId,
    metadata: { source: "signal" }
  });
}

export async function listFriendActivity(input: { account: AccountState; limit?: number }) {
  requireEligible(input.account);
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 30)));
  const result = await dbQuery<ActivityRow>(
    `
      WITH visible_activity AS (
        SELECT ae.*
        FROM activity_events ae
        LEFT JOIN user_settings actor_settings ON actor_settings.user_id = ae.actor_user_id
        WHERE ae.parent_activity_id IS NULL
          AND ae.expires_at > NOW()
          AND (
            ae.actor_user_id = $1::uuid
            OR EXISTS (
              SELECT 1
              FROM friendships f
              WHERE f.status = 'accepted'
                AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($1::uuid::text, ae.actor_user_id::text)
                AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($1::uuid::text, ae.actor_user_id::text)
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM blocked_users b
            WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = ae.actor_user_id)
               OR (b.blocker_user_id = ae.actor_user_id AND b.blocked_user_id = $1::uuid)
          )
          AND (ae.actor_user_id = $1::uuid OR COALESCE(actor_settings.ghost_mode, false) = false)
        ORDER BY ae.created_at DESC
        LIMIT $2
      )
      SELECT
        va.id,
        va.actor_user_id,
        va.target_user_id,
        va.venue_id,
        va.market_id,
        va.parent_activity_id,
        va.type,
        va.signal_kind,
        va.text,
        va.expires_at,
        va.created_at,
        va.metadata,
        p.display_name AS actor_display_name,
        p.username AS actor_username,
        p.avatar_kind AS actor_avatar_kind,
        p.bio AS actor_bio,
        v.name AS venue_name,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS venue_neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS venue_category,
        COALESCE(reply_pack.replies, '[]'::jsonb) AS replies,
        EXISTS (
          SELECT 1
          FROM attendance_intents ai
          WHERE ai.user_id = $1::uuid
            AND ai.venue_id = va.venue_id
            AND ai.status = 'active'
            AND ai.expires_at > NOW()
        ) AS viewer_has_coming,
        (
          SELECT COUNT(*)::int
          FROM attendance_intents ai
          JOIN user_settings us ON us.user_id = ai.user_id
          WHERE ai.venue_id = va.venue_id
            AND ai.status = 'active'
            AND ai.expires_at > NOW()
            AND COALESCE(us.ghost_mode, false) = false
        ) AS coming_count
      FROM visible_activity va
      JOIN user_profiles p ON p.user_id = va.actor_user_id
      LEFT JOIN venues v ON v.id = va.venue_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'type', r.type,
            'text', r.text,
            'signal_kind', r.signal_kind,
            'created_at', r.created_at,
            'actor', jsonb_build_object(
              'id', rp.user_id,
              'display_name', rp.display_name,
              'username', rp.username,
              'avatar_kind', rp.avatar_kind
            )
          )
          ORDER BY r.created_at ASC
        ) AS replies
        FROM activity_events r
        JOIN user_profiles rp ON rp.user_id = r.actor_user_id
        LEFT JOIN user_settings rs ON rs.user_id = r.actor_user_id
        WHERE r.parent_activity_id = va.id
          AND r.expires_at > NOW()
          AND (
            r.actor_user_id = $1::uuid
            OR EXISTS (
              SELECT 1
              FROM friendships f
              WHERE f.status = 'accepted'
                AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($1::uuid::text, r.actor_user_id::text)
                AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($1::uuid::text, r.actor_user_id::text)
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM blocked_users b
            WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = r.actor_user_id)
               OR (b.blocker_user_id = r.actor_user_id AND b.blocked_user_id = $1::uuid)
          )
          AND (r.actor_user_id = $1::uuid OR COALESCE(rs.ghost_mode, false) = false)
      ) reply_pack ON true
      ORDER BY va.created_at DESC
    `,
    [input.account.user.id, limit]
  );
  return { items: result.rows.map(formatActivity) };
}

export async function listFriendsTonight(input: { account: AccountState; limit?: number }) {
  requireEligible(input.account);
  const activity = await listFriendActivity({ account: input.account, limit: Math.max(input.limit ?? 30, 30) });
  const groupsByVenue = new Map<string, {
    venue: NonNullable<ReturnType<typeof formatActivity>["venue"]>;
    friends: Array<ReturnType<typeof formatActivity>["actor"]>;
    latest_activity: ReturnType<typeof formatActivity>;
    viewer_has_coming: boolean;
    coming_count: number;
  }>();

  for (const item of activity.items) {
    if (!item.venue) continue;
    const existing = groupsByVenue.get(item.venue.id);
    if (!existing) {
      groupsByVenue.set(item.venue.id, {
        venue: item.venue,
        friends: item.actor.id === input.account.user.id ? [] : [item.actor],
        latest_activity: item,
        viewer_has_coming: item.viewer_has_coming,
        coming_count: item.coming_count
      });
      continue;
    }
    if (Date.parse(item.created_at) > Date.parse(existing.latest_activity.created_at)) {
      existing.latest_activity = item;
    }
    if (item.actor.id !== input.account.user.id && !existing.friends.some((friend) => friend.id === item.actor.id)) {
      existing.friends.push(item.actor);
    }
    existing.viewer_has_coming = existing.viewer_has_coming || item.viewer_has_coming;
    existing.coming_count = Math.max(existing.coming_count, item.coming_count);
  }

  const groups = [...groupsByVenue.values()]
    .filter((group) => group.friends.length > 0 || group.viewer_has_coming)
    .sort((left, right) => Date.parse(right.latest_activity.created_at) - Date.parse(left.latest_activity.created_at))
    .slice(0, Math.max(1, Math.min(20, input.limit ?? 10)))
    .map((group) => ({
      venue: group.venue,
      friends: group.friends,
      latest_activity: group.latest_activity,
      viewer_has_coming: group.viewer_has_coming,
      coming_count: group.coming_count,
      cta: {
        primary: group.viewer_has_coming ? "You're coming" : "I'm Coming",
        can_come: !group.viewer_has_coming,
        secondary: "Pick a spot"
      }
    }));

  return {
    generated_at: new Date().toISOString(),
    groups,
    timeline: activity.items,
    counts: {
      groups: groups.length,
      timeline: activity.items.length
    },
    empty_state: groups.length === 0
      ? {
          title: "Quiet so far",
          message: "Invite friends or start a room when the night takes shape."
        }
      : null
  };
}

export async function toggleComing(input: { account: AccountState; venueId: string; isComing: boolean }) {
  requireEligible(input.account);
  if (!input.isComing) {
    await dbQuery(
      `
        UPDATE attendance_intents
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE user_id = $1::uuid
          AND venue_id = $2::uuid
          AND status = 'active'
      `,
      [input.account.user.id, input.venueId]
    );
    return { status: "cancelled" };
  }

  return dbTransaction(async (client) => {
    const existing = await client.query<ActivityRow>(
      `
        SELECT
          ae.id,
          ae.actor_user_id,
          ae.target_user_id,
          ae.venue_id,
          ae.market_id,
          ae.parent_activity_id,
          ae.type,
          ae.signal_kind,
          ae.text,
          ae.expires_at,
          ae.created_at,
          ae.metadata,
          p.display_name AS actor_display_name,
          p.username AS actor_username,
          p.avatar_kind AS actor_avatar_kind,
          p.bio AS actor_bio,
          v.name AS venue_name,
          COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS venue_neighborhood,
          COALESCE(v.canonical_type, v.metadata->>'category') AS venue_category,
          '[]'::jsonb AS replies,
          true AS viewer_has_coming,
          1 AS coming_count
        FROM attendance_intents ai
        JOIN activity_events ae ON ae.id = ai.activity_id
        JOIN user_profiles p ON p.user_id = ae.actor_user_id
        JOIN venues v ON v.id = ae.venue_id
        WHERE ai.user_id = $1::uuid
          AND ai.venue_id = $2::uuid
          AND ai.status = 'active'
          AND ai.expires_at > NOW()
        LIMIT 1
      `,
      [input.account.user.id, input.venueId]
    );
    if (existing.rows[0]) {
      return { activity: formatActivity(existing.rows[0]) };
    }

    const activity = await insertActivityForVenue(client, {
      actorUserId: input.account.user.id,
      venueId: input.venueId,
      type: "coming",
      metadata: { source: "coming" }
    });
    await client.query(
      `
        INSERT INTO attendance_intents (user_id, venue_id, market_id, status, activity_id, expires_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4::uuid, $5::timestamptz)
        ON CONFLICT (user_id, venue_id) WHERE status = 'active'
        DO UPDATE SET
          activity_id = EXCLUDED.activity_id,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `,
      [input.account.user.id, input.venueId, activity.market_id, activity.id, activity.expires_at]
    );
    return { activity: formatActivity(activity) };
  });
}

export async function addActivityReply(input: {
  account: AccountState;
  activityId: string;
  kind: "comment" | "emoji_signal";
  text?: string;
  signalKind?: SignalKind;
  details?: Record<string, unknown>;
}) {
  requireEligible(input.account);
  return dbTransaction(async (client) => {
    const parent = await client.query<{ actor_user_id: string; expires_at: string; venue_id: string | null; market_id: string | null }>(
      `
        SELECT actor_user_id, expires_at, venue_id, market_id
        FROM activity_events
        WHERE id = $1::uuid
          AND parent_activity_id IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [input.activityId]
    );
    const parentRow = parent.rows[0];
    if (!parentRow) {
      throw notFoundError("Activity was not found.");
    }
    await assertFriendshipForActivity(client, input.account.user.id, parentRow.actor_user_id);

    const text = input.text?.trim();
    if (input.kind === "comment" && (!text || text.length > 140)) {
      throw validationError("Comment replies must be between 1 and 140 characters.", { text: "Invalid length" });
    }
    if (input.kind === "emoji_signal" && (!input.signalKind || !SIGNAL_KINDS.has(input.signalKind))) {
      throw validationError("Emoji signal replies require a valid signal kind.", { signal_kind: "Invalid" });
    }

    const result = await client.query<ActivityRow>(
      `
        INSERT INTO activity_events (
          actor_user_id,
          venue_id,
          market_id,
          parent_activity_id,
          type,
          signal_kind,
          text,
          expires_at,
          metadata
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $9::jsonb
        )
        RETURNING
          id,
          actor_user_id,
          target_user_id,
          venue_id,
          market_id,
          parent_activity_id,
          type,
          signal_kind,
          text,
          expires_at,
          created_at,
          metadata,
          (SELECT display_name FROM user_profiles WHERE user_id = $1::uuid) AS actor_display_name,
          (SELECT username FROM user_profiles WHERE user_id = $1::uuid) AS actor_username,
          (SELECT avatar_kind FROM user_profiles WHERE user_id = $1::uuid) AS actor_avatar_kind,
          (SELECT bio FROM user_profiles WHERE user_id = $1::uuid) AS actor_bio,
          NULL::text AS venue_name,
          NULL::text AS venue_neighborhood,
          NULL::text AS venue_category,
          '[]'::jsonb AS replies,
          false AS viewer_has_coming,
          0 AS coming_count
      `,
      [
        input.account.user.id,
        parentRow.venue_id,
        parentRow.market_id,
        input.activityId,
        input.kind,
        input.kind === "emoji_signal" ? input.signalKind : null,
        input.kind === "comment" ? text : null,
        parentRow.expires_at,
        JSON.stringify(withTestMetadata(input.details))
      ]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to add reply.");
    }
    return { reply: formatActivity(row) };
  });
}

export async function reportActivity(input: {
  account: AccountState;
  activityId: string;
  reason: string;
  details?: Record<string, unknown>;
}) {
  requireEligible(input.account);
  const activity = await dbQuery<{ actor_user_id: string }>(
    `
      SELECT actor_user_id
      FROM activity_events
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [input.activityId]
  );
  const row = activity.rows[0];
  if (!row) {
    throw notFoundError("Activity was not found.");
  }
  await assertFriendshipForActivity({ query: dbQuery }, input.account.user.id, row.actor_user_id);
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO moderation_reports (reporter_user_id, target_type, target_id, reason, details)
      VALUES ($1::uuid, 'activity', $2, $3, $4::jsonb)
      RETURNING id
    `,
    [
      input.account.user.id,
      input.activityId,
      input.reason,
      JSON.stringify(withTestMetadata(input.details))
    ]
  );
  return { report_id: result.rows[0]?.id };
}

export async function reportProfile(input: {
  account: AccountState;
  userId: string;
  reason: string;
  details?: Record<string, unknown>;
}) {
  requireEligible(input.account);
  await findEligibleProfile({ query: dbQuery }, input.userId);
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO moderation_reports (reporter_user_id, target_type, target_id, reason, details)
      VALUES ($1::uuid, 'profile', $2, $3, $4::jsonb)
      RETURNING id
    `,
    [
      input.account.user.id,
      input.userId,
      input.reason,
      JSON.stringify(withTestMetadata(input.details))
    ]
  );
  return { report_id: result.rows[0]?.id };
}
