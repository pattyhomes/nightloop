import type { DBClient } from "../../lib/db";

export const PHASE6_SOCIAL_SMOKE_SEED_TAG = "phase6a1_social_smoke";

export const PHASE6_SOCIAL_SMOKE_USERS = [
  {
    key: "alex",
    authUserId: "00000000-0000-4000-8000-000000006a01",
    displayName: "Dev Social Alex",
    username: "dev_social_alex",
    preferences: {
      vibe: ["dance", "cocktails", "live"],
      music: ["house", "hiphop", "jazz"],
      crowd: ["locals", "twenties", "packed"],
      neighborhoods: ["soma", "mission", "north-beach"]
    }
  },
  {
    key: "maya",
    authUserId: "00000000-0000-4000-8000-000000006a02",
    displayName: "Dev Social Maya",
    username: "dev_social_maya",
    preferences: {
      vibe: ["dance", "queer", "wild"],
      music: ["house", "techno", "disco"],
      crowd: ["friends", "packed", "late-night"],
      neighborhoods: ["soma", "castro", "mission"]
    }
  },
  {
    key: "jules",
    authUserId: "00000000-0000-4000-8000-000000006a03",
    displayName: "Dev Social Jules",
    username: "dev_social_jules",
    preferences: {
      vibe: ["live", "conversation", "cocktails"],
      music: ["jazz", "indie", "soul"],
      crowd: ["locals", "date-night", "chill"],
      neighborhoods: ["north-beach", "mission", "hayes-valley"]
    }
  },
  {
    key: "blocked",
    authUserId: "00000000-0000-4000-8000-000000006a04",
    displayName: "Dev Social Blocked",
    username: "dev_social_blocked",
    preferences: {
      vibe: ["dance", "dive", "karaoke"],
      music: ["hiphop", "latin", "pop"],
      crowd: ["twenties", "packed", "tourists"],
      neighborhoods: ["soma", "mission", "marina"]
    }
  }
] as const;

export type Phase6SocialSmokeUserKey = (typeof PHASE6_SOCIAL_SMOKE_USERS)[number]["key"];

export const PHASE6_SOCIAL_SMOKE_USER_KEYS = PHASE6_SOCIAL_SMOKE_USERS.map((user) => user.key);

export type Phase6SocialSmokeSnapshot = {
  generated_at: string;
  market: {
    id: string;
    slug: string;
  };
  users: Array<{
    key: Phase6SocialSmokeUserKey;
    id: string | null;
    username: string;
    display_name: string | null;
    selected_market_id: string | null;
    ghost_mode: boolean | null;
    deleted_at: string | null;
    preference_count: number;
  }>;
  social: {
    accepted_friendships: string[];
    alex_blocked_friendship_count: number;
    alex_blocks_blocked: boolean;
    active_signal_count: number;
    active_signal_activity_count: number;
    active_coming_activity_count: number;
    active_reply_count: number;
    active_attendance_intent_count: number;
    raw_coordinate_activity_count: number;
  };
  decision: {
    alex_visible_accepted_friend_count: number;
    approved_candidate_count: number;
    active_open_room_count: number;
    finalized_room_count: number;
    suggested_candidate_count: number;
    room_message_count: number;
    finalized_room_frozen_count: number;
  };
};

export type Phase6SocialSmokeFailure = {
  code:
    | "MISSING_USER"
    | "USER_DELETED"
    | "USER_NOT_IN_MARKET"
    | "GHOST_MODE_ENABLED"
    | "MISSING_PREFERENCES"
    | "MISSING_ACCEPTED_FRIENDSHIP"
    | "MISSING_BLOCK"
    | "BLOCKED_FRIENDSHIP_VISIBLE"
    | "MISSING_SIGNAL"
    | "MISSING_SIGNAL_ACTIVITY"
    | "MISSING_COMING_ACTIVITY"
    | "MISSING_REPLY"
    | "MISSING_ATTENDANCE_INTENT"
    | "RAW_COORDINATES_EXPOSED"
    | "INSUFFICIENT_DECISION_FRIENDS"
    | "INSUFFICIENT_DECISION_CANDIDATES"
    | "MISSING_OPEN_DECISION_ROOM"
    | "MISSING_FINALIZED_DECISION_ROOM"
    | "MISSING_SUGGESTED_CANDIDATE"
    | "MISSING_ROOM_MESSAGE"
    | "FINALIZED_ROOM_NOT_FROZEN";
  message: string;
};

export type Phase6SocialSmokeAuditResult = {
  ok: boolean;
  failures: Phase6SocialSmokeFailure[];
  snapshot: Phase6SocialSmokeSnapshot;
};

type UserRow = {
  key: Phase6SocialSmokeUserKey;
  id: string;
  username: string;
  display_name: string | null;
  selected_market_id: string | null;
  ghost_mode: boolean | null;
  deleted_at: string | null;
  preference_count: string | number;
};

type CountRow = {
  count: string | number;
};

type PairRow = {
  pair: string;
};

type ActivityCountRow = {
  type: string;
  count: string | number;
};

function countValue(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addFailure(failures: Phase6SocialSmokeFailure[], failure: Phase6SocialSmokeFailure): void {
  failures.push(failure);
}

function userByKey(snapshot: Phase6SocialSmokeSnapshot, key: Phase6SocialSmokeUserKey) {
  return snapshot.users.find((user) => user.key === key);
}

export function validatePhase6SocialSmokeSnapshot(
  snapshot: Phase6SocialSmokeSnapshot
): Phase6SocialSmokeAuditResult {
  const failures: Phase6SocialSmokeFailure[] = [];

  for (const key of PHASE6_SOCIAL_SMOKE_USER_KEYS) {
    const user = userByKey(snapshot, key);
    if (!user?.id) {
      addFailure(failures, {
        code: "MISSING_USER",
        message: `Missing seeded user: ${key}.`
      });
      continue;
    }
    if (user.deleted_at) {
      addFailure(failures, {
        code: "USER_DELETED",
        message: `Seeded user is deleted: ${key}.`
      });
    }
    if (user.selected_market_id !== snapshot.market.id) {
      addFailure(failures, {
        code: "USER_NOT_IN_MARKET",
        message: `Seeded user is not selected into ${snapshot.market.slug}: ${key}.`
      });
    }
    if (user.ghost_mode) {
      addFailure(failures, {
        code: "GHOST_MODE_ENABLED",
        message: `Seeded user should have ghost mode off for smoke walkthroughs: ${key}.`
      });
    }
    if (user.preference_count < 3) {
      addFailure(failures, {
        code: "MISSING_PREFERENCES",
        message: `Seeded user needs preferences for recommendation/decision fit: ${key}.`
      });
    }
  }

  for (const pair of ["alex:maya", "alex:jules"]) {
    if (!snapshot.social.accepted_friendships.includes(pair)) {
      addFailure(failures, {
        code: "MISSING_ACCEPTED_FRIENDSHIP",
        message: `Missing accepted friendship ${pair}.`
      });
    }
  }

  if (!snapshot.social.alex_blocks_blocked) {
    addFailure(failures, {
      code: "MISSING_BLOCK",
      message: "Expected Alex to block the blocked smoke user."
    });
  }

  if (snapshot.social.alex_blocked_friendship_count > 0) {
    addFailure(failures, {
      code: "BLOCKED_FRIENDSHIP_VISIBLE",
      message: "Blocked smoke user still has friendship/request state with Alex."
    });
  }

  if (snapshot.social.active_signal_count < 1) {
    addFailure(failures, {
      code: "MISSING_SIGNAL",
      message: "Expected one seeded signal for friend activity."
    });
  }
  if (snapshot.social.active_signal_activity_count < 1) {
    addFailure(failures, {
      code: "MISSING_SIGNAL_ACTIVITY",
      message: "Expected one visible signal activity."
    });
  }
  if (snapshot.social.active_coming_activity_count < 1) {
    addFailure(failures, {
      code: "MISSING_COMING_ACTIVITY",
      message: "Expected one visible I'm Coming activity."
    });
  }
  if (snapshot.social.active_reply_count < 1) {
    addFailure(failures, {
      code: "MISSING_REPLY",
      message: "Expected one seeded friend reply."
    });
  }
  if (snapshot.social.active_attendance_intent_count < 1) {
    addFailure(failures, {
      code: "MISSING_ATTENDANCE_INTENT",
      message: "Expected one active attendance intent."
    });
  }
  if (snapshot.social.raw_coordinate_activity_count > 0) {
    addFailure(failures, {
      code: "RAW_COORDINATES_EXPOSED",
      message: "Seeded friend activity must not contain raw coordinates."
    });
  }

  if (snapshot.decision.alex_visible_accepted_friend_count < 2) {
    addFailure(failures, {
      code: "INSUFFICIENT_DECISION_FRIENDS",
      message: "Alex needs at least two visible friends for decision-room smoke testing."
    });
  }
  if (snapshot.decision.approved_candidate_count < 12) {
    addFailure(failures, {
      code: "INSUFFICIENT_DECISION_CANDIDATES",
      message: "Decision rooms need at least 12 approved candidate venues."
    });
  }
  if (snapshot.decision.active_open_room_count < 1) {
    addFailure(failures, {
      code: "MISSING_OPEN_DECISION_ROOM",
      message: "Expected one active unfinalized smoke decision room."
    });
  }
  if (snapshot.decision.finalized_room_count < 1) {
    addFailure(failures, {
      code: "MISSING_FINALIZED_DECISION_ROOM",
      message: "Expected one finalized smoke decision room."
    });
  }
  if (snapshot.decision.suggested_candidate_count < 1) {
    addFailure(failures, {
      code: "MISSING_SUGGESTED_CANDIDATE",
      message: "Expected one suggested candidate in smoke decision rooms."
    });
  }
  if (snapshot.decision.room_message_count < 2) {
    addFailure(failures, {
      code: "MISSING_ROOM_MESSAGE",
      message: "Expected room messages in smoke decision rooms."
    });
  }
  if (snapshot.decision.finalized_room_frozen_count < 1) {
    addFailure(failures, {
      code: "FINALIZED_ROOM_NOT_FROZEN",
      message: "Expected finalized smoke room to expose frozen decision mechanics."
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    snapshot
  };
}

export async function collectPhase6SocialSmokeSnapshot(
  client: DBClient,
  marketSlugOrId: string
): Promise<Phase6SocialSmokeSnapshot> {
  const marketResult = await client.query<{ id: string; slug: string }>(
    `
      SELECT id, slug
      FROM markets
      WHERE id::text = $1 OR slug = $1
      LIMIT 1
    `,
    [marketSlugOrId]
  );
  const market = marketResult.rows[0];
  if (!market) {
    throw new Error(`Market not found: ${marketSlugOrId}`);
  }

  const expectedByUsername = new Map(PHASE6_SOCIAL_SMOKE_USERS.map((user) => [user.username, user]));
  const userResult = await client.query<UserRow>(
    `
      SELECT
        up.username,
        u.id,
        u.deleted_at,
        up.display_name,
        up.selected_market_id,
        COALESCE(us.ghost_mode, false) AS ghost_mode,
        COUNT(pref.preference_key) AS preference_count
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      LEFT JOIN user_settings us ON us.user_id = u.id
      LEFT JOIN user_preferences pref ON pref.user_id = u.id
      WHERE up.username = ANY($1::text[])
      GROUP BY up.username, u.id, u.deleted_at, up.display_name, up.selected_market_id, us.ghost_mode
    `,
    [PHASE6_SOCIAL_SMOKE_USERS.map((user) => user.username)]
  );

  const userRowsByUsername = new Map(userResult.rows.map((row) => [row.username, row]));
  const users = PHASE6_SOCIAL_SMOKE_USERS.map((expected) => {
    const row = userRowsByUsername.get(expected.username);
    return {
      key: expected.key,
      id: row?.id ?? null,
      username: expected.username,
      display_name: row?.display_name ?? null,
      selected_market_id: row?.selected_market_id ?? null,
      ghost_mode: row?.ghost_mode ?? null,
      deleted_at: row?.deleted_at ?? null,
      preference_count: countValue(row?.preference_count)
    };
  });

  const idByKey = new Map(users.map((user) => [user.key, user.id]));
  const seedIds = users.map((user) => user.id).filter((id): id is string => Boolean(id));
  const alexId = idByKey.get("alex");
  const blockedId = idByKey.get("blocked");

  const friendshipResult = seedIds.length
    ? await client.query<PairRow>(
        `
          SELECT
            CASE
              WHEN left_profile.username = 'dev_social_alex' AND right_profile.username = 'dev_social_maya'
                OR left_profile.username = 'dev_social_maya' AND right_profile.username = 'dev_social_alex'
                THEN 'alex:maya'
              WHEN left_profile.username = 'dev_social_alex' AND right_profile.username = 'dev_social_jules'
                OR left_profile.username = 'dev_social_jules' AND right_profile.username = 'dev_social_alex'
                THEN 'alex:jules'
              ELSE left_profile.username || ':' || right_profile.username
            END AS pair
          FROM friendships f
          JOIN user_profiles left_profile ON left_profile.user_id = f.requester_user_id
          JOIN user_profiles right_profile ON right_profile.user_id = f.addressee_user_id
          WHERE f.status = 'accepted'
            AND f.requester_user_id = ANY($1::uuid[])
            AND f.addressee_user_id = ANY($1::uuid[])
        `,
        [seedIds]
      )
    : { rows: [], rowCount: 0 };

  const blockedFriendshipResult =
    alexId && blockedId
      ? await client.query<CountRow>(
          `
            SELECT COUNT(*) AS count
            FROM friendships
            WHERE LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
              AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
          `,
          [alexId, blockedId]
        )
      : { rows: [{ count: 0 }], rowCount: 1 };

  const blockResult =
    alexId && blockedId
      ? await client.query<CountRow>(
          `
            SELECT COUNT(*) AS count
            FROM blocked_users
            WHERE blocker_user_id = $1::uuid
              AND blocked_user_id = $2::uuid
          `,
          [alexId, blockedId]
        )
      : { rows: [{ count: 0 }], rowCount: 1 };

  const signalResult = seedIds.length
    ? await client.query<CountRow>(
        `
          SELECT COUNT(*) AS count
          FROM signals
          WHERE payload->>'seed' = $1
            AND user_id = ANY($2::uuid[])
            AND expires_at > NOW()
        `,
        [PHASE6_SOCIAL_SMOKE_SEED_TAG, seedIds]
      )
    : { rows: [{ count: 0 }], rowCount: 1 };

  const activityResult = seedIds.length
    ? await client.query<ActivityCountRow>(
        `
          SELECT type, COUNT(*) AS count
          FROM activity_events
          WHERE metadata->>'seed' = $1
            AND actor_user_id = ANY($2::uuid[])
            AND expires_at > NOW()
          GROUP BY type
        `,
        [PHASE6_SOCIAL_SMOKE_SEED_TAG, seedIds]
      )
    : { rows: [], rowCount: 0 };
  const activityCounts = new Map(activityResult.rows.map((row) => [row.type, countValue(row.count)]));

  const attendanceResult = seedIds.length
    ? await client.query<CountRow>(
        `
          SELECT COUNT(*) AS count
          FROM attendance_intents
          WHERE user_id = ANY($1::uuid[])
            AND market_id = $2::uuid
            AND status = 'active'
            AND expires_at > NOW()
        `,
        [seedIds, market.id]
      )
    : { rows: [{ count: 0 }], rowCount: 1 };

  const rawCoordinateResult = seedIds.length
    ? await client.query<CountRow>(
        `
          SELECT COUNT(*) AS count
          FROM activity_events
          WHERE metadata->>'seed' = $1
            AND actor_user_id = ANY($2::uuid[])
            AND (
              metadata ? 'latitude'
              OR metadata ? 'longitude'
              OR metadata ? 'coordinates'
              OR metadata ? 'raw_coordinates'
              OR metadata ? 'lat'
              OR metadata ? 'lng'
            )
        `,
        [PHASE6_SOCIAL_SMOKE_SEED_TAG, seedIds]
      )
    : { rows: [{ count: 0 }], rowCount: 1 };

  const visibleFriendResult = alexId
    ? await client.query<CountRow>(
        `
          SELECT COUNT(*) AS count
          FROM friendships f
          WHERE f.status = 'accepted'
            AND ($1::uuid IN (f.requester_user_id, f.addressee_user_id))
            AND NOT EXISTS (
              SELECT 1
              FROM blocked_users b
              WHERE (b.blocker_user_id = f.requester_user_id AND b.blocked_user_id = f.addressee_user_id)
                 OR (b.blocker_user_id = f.addressee_user_id AND b.blocked_user_id = f.requester_user_id)
            )
        `,
        [alexId]
      )
    : { rows: [{ count: 0 }], rowCount: 1 };

  const candidateResult = await client.query<CountRow>(
    `
      SELECT COUNT(*) AS count
      FROM venues
      WHERE market_id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
    `,
    [market.id]
  );

  const roomResult = seedIds.length
    ? await client.query<{
        active_open_room_count: string | number;
        finalized_room_count: string | number;
        suggested_candidate_count: string | number;
        room_message_count: string | number;
        finalized_room_frozen_count: string | number;
      }>(
        `
          SELECT
            COUNT(DISTINCT ds.id) FILTER (
              WHERE ds.status = 'active'
                AND ds.finalized_at IS NULL
                AND ds.metadata->>'seed' = $1
            ) AS active_open_room_count,
            COUNT(DISTINCT ds.id) FILTER (
              WHERE ds.status = 'active'
                AND ds.finalized_at IS NOT NULL
                AND ds.metadata->>'seed' = $1
            ) AS finalized_room_count,
            COUNT(DISTINCT dsc.id) FILTER (
              WHERE dsc.source = 'suggested'
            ) AS suggested_candidate_count,
            COUNT(DISTINCT dsm.id) AS room_message_count,
            COUNT(DISTINCT ds.id) FILTER (
              WHERE ds.finalized_at IS NOT NULL
                AND ds.final_candidate_id IS NOT NULL
                AND ds.final_venue_id IS NOT NULL
            ) AS finalized_room_frozen_count
          FROM decision_sessions ds
          LEFT JOIN decision_session_candidates dsc ON dsc.session_id = ds.id
          LEFT JOIN decision_session_messages dsm ON dsm.session_id = ds.id AND dsm.expires_at > NOW()
          WHERE ds.metadata->>'seed' = $1
            AND ds.creator_user_id = ANY($2::uuid[])
            AND ds.expires_at > NOW()
        `,
        [PHASE6_SOCIAL_SMOKE_SEED_TAG, seedIds]
      )
    : {
        rows: [
          {
            active_open_room_count: 0,
            finalized_room_count: 0,
            suggested_candidate_count: 0,
            room_message_count: 0,
            finalized_room_frozen_count: 0
          }
        ],
        rowCount: 1
      };
  const roomCounts = roomResult.rows[0];

  return {
    generated_at: new Date().toISOString(),
    market,
    users,
    social: {
      accepted_friendships: [...new Set(friendshipResult.rows.map((row) => row.pair))].sort(),
      alex_blocked_friendship_count: countValue(blockedFriendshipResult.rows[0]?.count),
      alex_blocks_blocked: countValue(blockResult.rows[0]?.count) > 0,
      active_signal_count: countValue(signalResult.rows[0]?.count),
      active_signal_activity_count: countValue(activityCounts.get("signal")),
      active_coming_activity_count: countValue(activityCounts.get("coming")),
      active_reply_count: countValue(activityCounts.get("comment")) + countValue(activityCounts.get("emoji_signal")),
      active_attendance_intent_count: countValue(attendanceResult.rows[0]?.count),
      raw_coordinate_activity_count: countValue(rawCoordinateResult.rows[0]?.count)
    },
    decision: {
      alex_visible_accepted_friend_count: countValue(visibleFriendResult.rows[0]?.count),
      approved_candidate_count: countValue(candidateResult.rows[0]?.count),
      active_open_room_count: countValue(roomCounts?.active_open_room_count),
      finalized_room_count: countValue(roomCounts?.finalized_room_count),
      suggested_candidate_count: countValue(roomCounts?.suggested_candidate_count),
      room_message_count: countValue(roomCounts?.room_message_count),
      finalized_room_frozen_count: countValue(roomCounts?.finalized_room_frozen_count)
    }
  };
}
