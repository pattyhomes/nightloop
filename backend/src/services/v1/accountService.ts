import type { DBClient } from "../../lib/db";
import { dbQuery, dbTransaction } from "../../lib/db";
import { ApiError } from "../../lib/apiError";
import type { AuthAdminClient } from "../../lib/authAdmin";

export type EligibilityStatus = "unknown" | "eligible" | "ineligible";

export type UserRow = {
  id: string;
  auth_user_id: string;
  eligibility_status: EligibilityStatus;
  age_attested_at: string | null;
  signal_scout_points: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  user_id: string;
  display_name: string;
  username: string;
  selected_market_id: string | null;
  avatar_kind: string;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type SettingsRow = {
  user_id: string;
  ghost_mode: boolean;
  map_show_neighborhood_labels: boolean;
  map_show_street_grid: boolean;
  push_social_enabled: boolean;
  push_decision_enabled: boolean;
  push_favorite_venue_alerts_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountState = {
  user: UserRow;
  profile: ProfileRow;
  settings: SettingsRow | null;
  preferences: Record<string, string[]>;
};

export type ProfilePatch = {
  displayName?: string;
  username?: string;
  selectedMarketId?: string;
  bio?: string | null;
};

export type SettingsPatch = Partial<
  Pick<
    SettingsRow,
    | "ghost_mode"
    | "map_show_neighborhood_labels"
    | "map_show_street_grid"
    | "push_social_enabled"
    | "push_decision_enabled"
    | "push_favorite_venue_alerts_enabled"
  >
>;

export const REQUIRED_PREFERENCE_CATEGORIES = ["vibe", "music", "crowd", "neighborhoods"] as const;

function defaultUsername(authUserId: string): string {
  return `nl_${authUserId.replace(/-/g, "").slice(0, 12)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function getDefaultMarketId(client: DBClient): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM markets
      WHERE launch_status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return result.rows[0]?.id ?? null;
}

async function readPreferences(client: DBClient, userId: string): Promise<Record<string, string[]>> {
  const result = await client.query<{ category: string; preference_key: string }>(
    `
      SELECT category, preference_key
      FROM user_preferences
      WHERE user_id = $1::uuid
      ORDER BY category ASC, position ASC, preference_key ASC
    `,
    [userId]
  );

  return result.rows.reduce<Record<string, string[]>>((acc, row) => {
    acc[row.category] ??= [];
    acc[row.category]?.push(row.preference_key);
    return acc;
  }, {});
}

async function readAccountByUserId(client: DBClient, userId: string): Promise<AccountState> {
  const userResult = await client.query<UserRow>(
    `
      SELECT
        id,
        auth_user_id,
        eligibility_status,
        age_attested_at,
        signal_scout_points,
        deleted_at,
        created_at,
        updated_at
      FROM users
      WHERE id = $1::uuid
    `,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "User was not found.");
  }

  if (user.deleted_at) {
    throw new ApiError(410, "ACCOUNT_DELETED", "This account has been deleted.");
  }

  const profileResult = await client.query<ProfileRow>(
    `
      SELECT
        user_id,
        display_name,
        username,
        selected_market_id,
        avatar_kind,
        bio,
        created_at,
        updated_at
      FROM user_profiles
      WHERE user_id = $1::uuid
    `,
    [userId]
  );

  const profile = profileResult.rows[0];
  if (!profile) {
    throw new ApiError(500, "PROFILE_MISSING", "User profile is missing.");
  }

  const settingsResult = await client.query<SettingsRow>(
    `
      SELECT
        user_id,
        ghost_mode,
        map_show_neighborhood_labels,
        map_show_street_grid,
        push_social_enabled,
        push_decision_enabled,
        push_favorite_venue_alerts_enabled,
        created_at,
        updated_at
      FROM user_settings
      WHERE user_id = $1::uuid
    `,
    [userId]
  );

  return {
    user,
    profile,
    settings: settingsResult.rows[0] ?? null,
    preferences: await readPreferences(client, userId)
  };
}

export async function ensureAccountForAuthUser(authUserId: string): Promise<AccountState> {
  return dbTransaction(async (client) => {
    const userResult = await client.query<UserRow>(
      `
        INSERT INTO users (auth_user_id)
        VALUES ($1::uuid)
        ON CONFLICT (auth_user_id) DO UPDATE SET updated_at = users.updated_at
        RETURNING
          id,
          auth_user_id,
          eligibility_status,
          age_attested_at,
          signal_scout_points,
          deleted_at,
          created_at,
          updated_at
      `,
      [authUserId]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new ApiError(500, "USER_CREATE_FAILED", "Failed to create user.");
    }

    if (user.deleted_at) {
      throw new ApiError(410, "ACCOUNT_DELETED", "This account has been deleted.");
    }

    const defaultMarketId = await getDefaultMarketId(client);
    await client.query(
      `
        INSERT INTO user_profiles (user_id, display_name, username, selected_market_id)
        VALUES ($1::uuid, 'Nightloop User', $2, $3::uuid)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id, defaultUsername(authUserId), defaultMarketId]
    );

    await client.query(
      `
        INSERT INTO user_settings (user_id)
        VALUES ($1::uuid)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [user.id]
    );

    return readAccountByUserId(client, user.id);
  });
}

export function requireEligible(account: AccountState): void {
  if (account.user.eligibility_status !== "eligible") {
    throw new ApiError(
      403,
      "ELIGIBILITY_REQUIRED",
      "You must complete 21+ eligibility attestation before using this feature."
    );
  }
}

export function toMeResponse(account: AccountState) {
  const missingSteps: string[] = [];
  if (account.user.eligibility_status !== "eligible") {
    missingSteps.push("age_attestation");
  }
  if (account.profile.display_name === "Nightloop User") {
    missingSteps.push("profile");
  }

  const hasAllPreferences = REQUIRED_PREFERENCE_CATEGORIES.every(
    (category) => (account.preferences[category]?.length ?? 0) >= 3
  );
  if (!hasAllPreferences) {
    missingSteps.push("preferences");
  }

  return {
    user: {
      id: account.user.id,
      auth_user_id: account.user.auth_user_id,
      eligibility_status: account.user.eligibility_status,
      age_attested_at: account.user.age_attested_at,
      signal_scout_points: Number(account.user.signal_scout_points),
      created_at: account.user.created_at
    },
    profile: {
      display_name: account.profile.display_name,
      username: account.profile.username,
      avatar_kind: account.profile.avatar_kind,
      bio: account.profile.bio,
      selected_market_id: account.profile.selected_market_id
    },
    settings: account.settings
      ? {
          ghost_mode: account.settings.ghost_mode,
          map_show_neighborhood_labels: account.settings.map_show_neighborhood_labels,
          map_show_street_grid: account.settings.map_show_street_grid,
          push_social_enabled: account.settings.push_social_enabled,
          push_decision_enabled: account.settings.push_decision_enabled,
          push_favorite_venue_alerts_enabled:
            account.settings.push_favorite_venue_alerts_enabled
        }
      : null,
    onboarding: {
      status: missingSteps.length === 0 ? "complete" : "incomplete",
      missing_steps: missingSteps
    }
  };
}

export async function attestAge(account: AccountState, is21OrOver: boolean): Promise<AccountState> {
  const status: EligibilityStatus = is21OrOver ? "eligible" : "ineligible";
  await dbQuery(
    `
      UPDATE users
      SET eligibility_status = $2,
          age_attested_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [account.user.id, status]
  );

  return ensureAccountForAuthUser(account.user.auth_user_id);
}

export async function patchProfile(account: AccountState, patch: ProfilePatch): Promise<AccountState> {
  requireEligible(account);

  if (patch.username) {
    const conflict = await dbQuery<{ user_id: string }>(
      `
        SELECT user_id
        FROM user_profiles
        WHERE username = $1
          AND user_id <> $2::uuid
        LIMIT 1
      `,
      [patch.username, account.user.id]
    );

    if (conflict.rowCount > 0) {
      throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken.");
    }
  }

  if (patch.selectedMarketId) {
    const market = await dbQuery<{ id: string }>(
      "SELECT id FROM markets WHERE id = $1::uuid LIMIT 1",
      [patch.selectedMarketId]
    );
    if (market.rowCount === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "selected_market_id is not a known market.");
    }
  }

  try {
    await dbQuery(
      `
        UPDATE user_profiles
        SET display_name = COALESCE($2, display_name),
            username = COALESCE($3, username),
            selected_market_id = COALESCE($4::uuid, selected_market_id),
            bio = CASE WHEN $5::boolean THEN $6 ELSE bio END,
            updated_at = NOW()
        WHERE user_id = $1::uuid
      `,
      [
        account.user.id,
        patch.displayName ?? null,
        patch.username ?? null,
        patch.selectedMarketId ?? null,
        Object.prototype.hasOwnProperty.call(patch, "bio"),
        patch.bio ?? null
      ]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken.");
    }
    throw error;
  }

  return ensureAccountForAuthUser(account.user.auth_user_id);
}

export async function patchSettings(account: AccountState, patch: SettingsPatch): Promise<AccountState> {
  requireEligible(account);

  await dbQuery(
    `
      UPDATE user_settings
      SET ghost_mode = COALESCE($2, ghost_mode),
          map_show_neighborhood_labels = COALESCE($3, map_show_neighborhood_labels),
          map_show_street_grid = COALESCE($4, map_show_street_grid),
          push_social_enabled = COALESCE($5, push_social_enabled),
          push_decision_enabled = COALESCE($6, push_decision_enabled),
          push_favorite_venue_alerts_enabled = COALESCE($7, push_favorite_venue_alerts_enabled),
          updated_at = NOW()
      WHERE user_id = $1::uuid
    `,
    [
      account.user.id,
      patch.ghost_mode ?? null,
      patch.map_show_neighborhood_labels ?? null,
      patch.map_show_street_grid ?? null,
      patch.push_social_enabled ?? null,
      patch.push_decision_enabled ?? null,
      patch.push_favorite_venue_alerts_enabled ?? null
    ]
  );

  return ensureAccountForAuthUser(account.user.auth_user_id);
}

export async function replacePreferences(
  account: AccountState,
  preferences: Record<string, string[]>
): Promise<Record<string, string[]>> {
  requireEligible(account);

  await dbTransaction(async (client) => {
    await client.query("DELETE FROM user_preferences WHERE user_id = $1::uuid", [account.user.id]);

    for (const [category, keys] of Object.entries(preferences)) {
      for (const [position, key] of keys.entries()) {
        await client.query(
          `
            INSERT INTO user_preferences (user_id, category, preference_key, position)
            VALUES ($1::uuid, $2, $3, $4)
            ON CONFLICT (user_id, category, preference_key) DO UPDATE SET
              position = EXCLUDED.position
          `,
          [account.user.id, category, key, position]
        );
      }
    }
  });

  return readPreferences({ query: dbQuery }, account.user.id);
}

export async function getPreferences(account: AccountState): Promise<Record<string, string[]>> {
  requireEligible(account);
  return readPreferences({ query: dbQuery }, account.user.id);
}

export async function deleteAccount(
  account: AccountState,
  authAdmin: AuthAdminClient
): Promise<void> {
  await dbTransaction(async (client) => {
    await client.query(
      `
        UPDATE signals
        SET user_id = NULL,
            trust_weight = 0,
            payload = payload - 'user_id',
            updated_at = NOW()
        WHERE user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        DELETE FROM attendance_intents
        WHERE user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        DELETE FROM activity_events
        WHERE actor_user_id = $1::uuid
           OR target_user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        DELETE FROM friend_invites
        WHERE user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        DELETE FROM blocked_users
        WHERE blocker_user_id = $1::uuid
           OR blocked_user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        DELETE FROM friendships
        WHERE requester_user_id = $1::uuid
           OR addressee_user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query("DELETE FROM user_preferences WHERE user_id = $1::uuid", [account.user.id]);
    await client.query("DELETE FROM user_settings WHERE user_id = $1::uuid", [account.user.id]);
    await client.query(
      `
        UPDATE user_profiles
        SET display_name = 'Deleted User',
            username = CONCAT('deleted_', REPLACE($1::text, '-', '')),
            avatar_kind = 'initials',
            bio = NULL,
            selected_market_id = NULL,
            updated_at = NOW()
        WHERE user_id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        UPDATE users
        SET deleted_at = COALESCE(deleted_at, NOW()),
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [account.user.id]
    );
    await client.query(
      `
        INSERT INTO audit_logs (actor_user_id, target_user_id, action, metadata)
        VALUES ($1::uuid, $1::uuid, 'account.delete', '{"phase": "phase_1"}'::jsonb)
      `,
      [account.user.id]
    );
  });

  await authAdmin.deleteUser(account.user.auth_user_id);
}
