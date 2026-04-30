import { createHash } from "crypto";
import type { AppConfig } from "../../lib/config";
import { loadConfig } from "../../lib/config";
import { ApiError, validationError } from "../../lib/apiError";
import { dbQuery, dbTransaction, type DBClient } from "../../lib/db";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";

export type ApnsEnvironment = "sandbox" | "production";
export type NotificationDeliveryMode = "mock" | "apns";
export type RoomNotificationCategory =
  | "room_invite"
  | "shortlist_ready"
  | "final_plan_locked"
  | "room_message";

export type NotificationPreferencePatch = Partial<
  Pick<
    NotificationPreferenceRow,
    | "room_invites_enabled"
    | "shortlist_ready_enabled"
    | "final_plan_locked_enabled"
    | "room_messages_enabled"
  >
>;

type DeviceTokenRow = {
  id: string;
  user_id: string;
  platform: "ios";
  token_hash: string;
  token_value: string;
  apns_environment: ApnsEnvironment;
  app_version: string | null;
  build_number: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationPreferenceRow = {
  user_id: string;
  room_invites_enabled: boolean;
  shortlist_ready_enabled: boolean;
  final_plan_locked_enabled: boolean;
  room_messages_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type NotificationRoute = {
  type: "decision_session";
  session_id: string;
};

type NotificationSendInput = {
  tokens: DeviceTokenRow[];
  copy: string;
  route: NotificationRoute;
  category: RoomNotificationCategory;
};

type NotificationSendResult = {
  delivered_count: number;
  delivery_mode: NotificationDeliveryMode;
};

const TOKEN_PATTERN = /^[a-f0-9]{32,512}$/;

function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeDeviceToken(token: string): string {
  const normalized = token.trim().replace(/\s+/g, "").toLowerCase();
  if (!TOKEN_PATTERN.test(normalized)) {
    throw validationError("Device token must be a hex APNs token.", { token: "Invalid device token." });
  }
  return normalized;
}

function safeDeviceToken(row: DeviceTokenRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    platform: row.platform,
    apns_environment: row.apns_environment,
    app_version: row.app_version,
    build_number: row.build_number,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function safePreferences(row: NotificationPreferenceRow) {
  return {
    user_id: row.user_id,
    room_invites_enabled: row.room_invites_enabled,
    shortlist_ready_enabled: row.shortlist_ready_enabled,
    final_plan_locked_enabled: row.final_plan_locked_enabled,
    room_messages_enabled: row.room_messages_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function preferenceFieldForCategory(category: RoomNotificationCategory): keyof NotificationPreferencePatch {
  switch (category) {
    case "room_invite":
      return "room_invites_enabled";
    case "shortlist_ready":
      return "shortlist_ready_enabled";
    case "final_plan_locked":
      return "final_plan_locked_enabled";
    case "room_message":
      return "room_messages_enabled";
  }
}

function actorName(actorDisplayName?: string): string | null {
  const normalized = (actorDisplayName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _.-]/g, "")
    .replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function roomNotificationCopy(
  category: RoomNotificationCategory,
  actorDisplayName?: string
): string {
  const actor = actorName(actorDisplayName);
  switch (category) {
    case "room_invite":
      return actor ? `${actor} invited you to pick tonight` : "you were invited to pick tonight";
    case "shortlist_ready":
      return "your shortlist is ready";
    case "final_plan_locked":
      return "the plan is locked";
    case "room_message":
      return actor ? `${actor} sent a room message` : "you have a new room message";
  }
}

export class MockNotificationSender {
  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    return {
      delivered_count: input.tokens.length,
      delivery_mode: "mock"
    };
  }
}

export class ApnsNotificationSender {
  constructor(private readonly config: AppConfig) {}

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (
      !this.config.apnsTeamId ||
      !this.config.apnsKeyId ||
      !this.config.apnsPrivateKey ||
      !this.config.apnsBundleId
    ) {
      throw new ApiError(500, "APNS_CONFIG_MISSING", "APNs delivery is not configured.");
    }

    throw new ApiError(501, "APNS_DELIVERY_NOT_IMPLEMENTED", "Direct APNs delivery is not implemented yet.");
  }
}

function senderForConfig(config: AppConfig): MockNotificationSender | ApnsNotificationSender {
  return config.notificationDeliveryMode === "apns"
    ? new ApnsNotificationSender(config)
    : new MockNotificationSender();
}

export async function registerDeviceToken(
  account: AccountState,
  token: string,
  environment: ApnsEnvironment,
  appVersion?: string,
  buildNumber?: string
) {
  requireEligible(account);
  const normalizedToken = normalizeDeviceToken(token);
  const tokenHash = hashDeviceToken(normalizedToken);
  const result = await dbTransaction(async (client) => {
    await client.query(
      `
        UPDATE user_device_tokens
        SET revoked_at = COALESCE(revoked_at, NOW()),
            updated_at = NOW()
        WHERE token_hash = $1
          AND apns_environment = $2
          AND user_id <> $3::uuid
          AND revoked_at IS NULL
      `,
      [tokenHash, environment, account.user.id]
    );

    return client.query<DeviceTokenRow>(
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
        RETURNING
          id,
          user_id,
          platform,
          token_hash,
          token_value,
          apns_environment,
          app_version,
          build_number,
          last_seen_at,
          revoked_at,
          created_at,
          updated_at
      `,
      [
        account.user.id,
        tokenHash,
        normalizedToken,
        environment,
        appVersion?.trim() || null,
        buildNumber?.trim() || null
      ]
    );
  });

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "DEVICE_TOKEN_REGISTER_FAILED", "Failed to register device token.");
  }
  return safeDeviceToken(row);
}

export async function revokeDeviceToken(account: AccountState, token: string) {
  requireEligible(account);
  const normalizedToken = normalizeDeviceToken(token);
  const tokenHash = hashDeviceToken(normalizedToken);
  const result = await dbQuery<{ id: string }>(
    `
      UPDATE user_device_tokens
      SET revoked_at = COALESCE(revoked_at, NOW()),
          updated_at = NOW()
      WHERE user_id = $1::uuid
        AND token_hash = $2
        AND revoked_at IS NULL
      RETURNING id
    `,
    [account.user.id, tokenHash]
  );

  return {
    revoked_count: result.rowCount
  };
}

export async function ensureNotificationPreferencesByUserId(
  userId: string,
  client: DBClient = { query: dbQuery }
) {
  const result = await client.query<NotificationPreferenceRow>(
    `
      INSERT INTO user_notification_preferences (user_id)
      VALUES ($1::uuid)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = user_notification_preferences.updated_at
      RETURNING
        user_id,
        room_invites_enabled,
        shortlist_ready_enabled,
        final_plan_locked_enabled,
        room_messages_enabled,
        created_at,
        updated_at
    `,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "NOTIFICATION_PREFERENCES_FAILED", "Failed to read notification preferences.");
  }
  return safePreferences(row);
}

export async function getNotificationPreferences(account: AccountState) {
  requireEligible(account);
  return ensureNotificationPreferencesByUserId(account.user.id);
}

export async function updateNotificationPreferences(
  account: AccountState,
  patch: NotificationPreferencePatch
) {
  requireEligible(account);
  await ensureNotificationPreferencesByUserId(account.user.id);
  const result = await dbQuery<NotificationPreferenceRow>(
    `
      UPDATE user_notification_preferences
      SET room_invites_enabled = COALESCE($2, room_invites_enabled),
          shortlist_ready_enabled = COALESCE($3, shortlist_ready_enabled),
          final_plan_locked_enabled = COALESCE($4, final_plan_locked_enabled),
          room_messages_enabled = COALESCE($5, room_messages_enabled),
          updated_at = NOW()
      WHERE user_id = $1::uuid
      RETURNING
        user_id,
        room_invites_enabled,
        shortlist_ready_enabled,
        final_plan_locked_enabled,
        room_messages_enabled,
        created_at,
        updated_at
    `,
    [
      account.user.id,
      patch.room_invites_enabled ?? null,
      patch.shortlist_ready_enabled ?? null,
      patch.final_plan_locked_enabled ?? null,
      patch.room_messages_enabled ?? null
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "NOTIFICATION_PREFERENCES_FAILED", "Failed to update notification preferences.");
  }
  return safePreferences(row);
}

async function readActiveDeviceTokens(userId: string): Promise<DeviceTokenRow[]> {
  const result = await dbQuery<DeviceTokenRow>(
    `
      SELECT
        id,
        user_id,
        platform,
        token_hash,
        token_value,
        apns_environment,
        app_version,
        build_number,
        last_seen_at,
        revoked_at,
        created_at,
        updated_at
      FROM user_device_tokens
      WHERE user_id = $1::uuid
        AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
    `,
    [userId]
  );
  return result.rows;
}

async function recipientIsSessionMember(sessionId: string, recipientUserId: string): Promise<boolean> {
  const result = await dbQuery<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM decision_session_members
        WHERE session_id = $1::uuid
          AND user_id = $2::uuid
      ) AS exists
    `,
    [sessionId, recipientUserId]
  );
  return result.rows[0]?.exists === true;
}

async function recipientBlockedByJoinedMember(sessionId: string, recipientUserId: string): Promise<boolean> {
  const result = await dbQuery<{ blocked: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM decision_session_members dsm
        JOIN blocked_users b
          ON (b.blocker_user_id = $2::uuid AND b.blocked_user_id = dsm.user_id)
          OR (b.blocker_user_id = dsm.user_id AND b.blocked_user_id = $2::uuid)
        WHERE dsm.session_id = $1::uuid
          AND dsm.status = 'joined'
          AND dsm.user_id <> $2::uuid
      ) AS blocked
    `,
    [sessionId, recipientUserId]
  );
  return result.rows[0]?.blocked === true;
}

export async function enqueueRoomNotification(
  sessionId: string,
  recipientUserId: string,
  category: RoomNotificationCategory,
  actorDisplayName?: string,
  config: AppConfig = loadConfig()
) {
  const copy = roomNotificationCopy(category, actorDisplayName);
  const route: NotificationRoute = {
    type: "decision_session",
    session_id: sessionId
  };

  if (!(await recipientIsSessionMember(sessionId, recipientUserId))) {
    return {
      queued_count: 0,
      skipped_reason: "recipient_not_in_room",
      copy,
      route,
      delivery_mode: config.notificationDeliveryMode
    };
  }

  const preferences = await ensureNotificationPreferencesByUserId(recipientUserId);
  const preferenceField = preferenceFieldForCategory(category);
  if (preferences[preferenceField] === false) {
    return {
      queued_count: 0,
      skipped_reason: "preference_disabled",
      copy,
      route,
      delivery_mode: config.notificationDeliveryMode
    };
  }

  if (await recipientBlockedByJoinedMember(sessionId, recipientUserId)) {
    return {
      queued_count: 0,
      skipped_reason: "blocked_room_member",
      copy,
      route,
      delivery_mode: config.notificationDeliveryMode
    };
  }

  const tokens = await readActiveDeviceTokens(recipientUserId);
  if (tokens.length === 0) {
    return {
      queued_count: 0,
      skipped_reason: "no_active_device_tokens",
      copy,
      route,
      delivery_mode: config.notificationDeliveryMode
    };
  }

  const sender = senderForConfig(config);
  const sent = await sender.send({
    tokens,
    copy,
    route,
    category
  });

  return {
    queued_count: sent.delivered_count,
    copy,
    route,
    delivery_mode: sent.delivery_mode
  };
}
