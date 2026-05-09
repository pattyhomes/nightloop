import { createHash, randomBytes } from "crypto";
import { ApiError, notFoundError, validationError } from "../../lib/apiError";
import { dbQuery, dbTransaction, type DBClient } from "../../lib/db";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";
import {
  decisionRoomEventBus,
  type DecisionRoomEventInput,
  type DecisionRoomEventType
} from "./decisionRoomEvents";
import {
  enqueueRoomNotification,
  type RoomNotificationCategory
} from "./notificationService";
import { findMarketByIdOrSlug } from "./marketService";
import { listRecommendations } from "./recommendationService";
import { getVenue, listVenues } from "./venueService";

type DecisionStatus = "active" | "ended" | "expired";
type DecisionStage = "swiping" | "shortlist_voting" | "finalized";
type MemberRole = "creator" | "member";
type MemberStatus = "invited" | "joined";
type VoteValue = "in" | "skip";
type PulseFilter = "chill" | "active" | "packed";
type CandidateSource = "initial" | "suggested";
type DecisionMessageType = "text" | "emoji";
type DecisionEmoji = "fire" | "eyes" | "thumbs_up" | "thinking" | "down";

type RecommendationResponse = Awaited<ReturnType<typeof listRecommendations>>;
type RecommendationItemPayload = RecommendationResponse["items"][number];
type VenuePayload = RecommendationItemPayload["venue"];

export type DecisionFilters = {
  neighborhood?: string;
  category?: string;
  pulse?: PulseFilter;
};

type SessionRow = {
  id: string;
  creator_user_id: string;
  market_id: string;
  market_slug: string;
  market_short_label: string;
  status: DecisionStatus;
  stage: DecisionStage;
  code_hint: string | null;
  code_revoked_at: string | null;
  filters: DecisionFilters | null;
  final_candidate_id: string | null;
  final_venue_id: string | null;
  final_locked_by_user_id: string | null;
  final_locked_by_display_name: string | null;
  final_locked_by_username: string | null;
  final_locked_by_avatar_kind: string | null;
  finalized_at: string | null;
  final_meetup_at: string | null;
  final_note: string | null;
  expires_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  id: string;
  session_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  source: "creator" | "invited" | "code";
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

type CandidateSnapshot = {
  venue: VenuePayload;
  recommendation: {
    rank: number;
    score: number;
    reason: string;
    confidence: string | null;
    liveness: unknown;
    expected_pulse_basis: string[];
    factors: unknown;
  };
};

type CandidateRow = {
  id: string;
  session_id: string;
  venue_id: string;
  original_rank: number;
  base_score: string | number;
  snapshot: CandidateSnapshot;
  source: CandidateSource;
  suggested_by_user_id: string | null;
  suggested_by_display_name: string | null;
  suggested_by_username: string | null;
  suggested_by_avatar_kind: string | null;
  suggested_at: string | null;
  in_count: string | number;
  skip_count: string | number;
  viewer_vote: VoteValue | null;
  shortlist_vote_count: string | number;
  viewer_shortlist_vote: boolean | null;
};

type MemberProgressRow = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_kind: string;
  role: MemberRole;
  swiped_count: string | number;
};

type DeckState = {
  deck_size: number;
  cards_total: number;
  cards_remaining: number;
  next_candidate_id: string | null;
  last_swiped_candidate_id: string | null;
  can_rewind: boolean;
};

type DecisionMessageRow = {
  id: string;
  session_id: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_username: string | null;
  actor_avatar_kind: string | null;
  type: DecisionMessageType;
  text: string | null;
  emoji: DecisionEmoji | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type JoinedPreferenceRow = {
  user_id: string;
  preferences: Record<string, string[]>;
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_SIZE = 12;
const DECK_SIZE = 8;
const SHORTLIST_SIZE = 5;
const MIN_SWIPES_FOR_SHORTLIST = 4;
const MAX_SUGGESTED_CANDIDATES = 6;
const MAX_ROOM_MESSAGES = 50;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function generateDecisionCode(): string {
  const chars = Array.from(randomBytes(8)).map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `ND-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

function codeHint(code: string): string {
  return normalizeCode(code).slice(-4);
}

function normalizeText(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePreferenceKey(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function safeFilters(filters?: DecisionFilters): DecisionFilters {
  return {
    ...(filters?.neighborhood ? { neighborhood: filters.neighborhood.trim() } : {}),
    ...(filters?.category ? { category: filters.category.trim() } : {}),
    ...(filters?.pulse ? { pulse: filters.pulse } : {})
  };
}

function candidateMatchesFilters(item: RecommendationItemPayload, filters: DecisionFilters): boolean {
  if (filters.neighborhood) {
    const wanted = normalizePreferenceKey(filters.neighborhood);
    const actual = normalizePreferenceKey(item.venue.neighborhood);
    if (wanted && actual !== wanted) return false;
  }
  if (filters.category) {
    const wanted = normalizePreferenceKey(filters.category);
    const actual = normalizePreferenceKey(item.venue.category);
    if (wanted && actual !== wanted) return false;
  }
  return true;
}

function buildSnapshot(item: RecommendationItemPayload): CandidateSnapshot {
  return {
    venue: item.venue,
    recommendation: {
      rank: item.rank,
      score: item.score,
      reason: item.reason,
      confidence: item.confidence ?? null,
      liveness: item.liveness ?? null,
      expected_pulse_basis: item.expected_pulse_basis ?? [],
      factors: item.factors ?? null
    }
  };
}

function buildSuggestedSnapshot(venue: VenuePayload, rank: number): CandidateSnapshot {
  return {
    venue,
    recommendation: {
      rank,
      score: Number(venue.pulse?.score ?? 0),
      reason: "Suggested by the room.",
      confidence: venue.confidence ?? null,
      liveness: venue.liveness ?? null,
      expected_pulse_basis: Array.isArray(venue.pulse?.basis) ? venue.pulse.basis : [],
      factors: null
    }
  };
}

function textSet(values?: string[]): Set<string> {
  return new Set((values ?? []).map(normalizePreferenceKey).filter(Boolean));
}

function scoreMemberFit(venue: VenuePayload, preferences: Record<string, string[]>): number {
  const neighborhoods = textSet(preferences.neighborhoods);
  const vibe = textSet(preferences.vibe);
  const music = textSet(preferences.music);
  const crowd = textSet(preferences.crowd);
  const category = normalizePreferenceKey(venue.category);
  const neighborhood = normalizePreferenceKey(venue.neighborhood);

  let score = 0.18;
  if (neighborhoods.has(neighborhood)) score += 0.34;
  if (vibe.has(category) || music.has(category) || crowd.has(category)) score += 0.18;
  if (category.includes("club") && (vibe.has("dance") || crowd.has("packed"))) score += 0.14;
  if (category.includes("bar") && (vibe.has("cocktails") || vibe.has("conversation"))) score += 0.1;
  if (category.includes("live") && music.size > 0) score += 0.12;
  if (venue.event) score += 0.08;
  return Math.min(1, Math.max(0, score));
}

function groupFitForCandidate(candidate: CandidateRow, joinedPreferences: JoinedPreferenceRow[]) {
  const memberCount = joinedPreferences.length;
  if (memberCount === 0) {
    return {
      score: 0,
      memberCount,
      reason: "Group fit updates after friends join."
    };
  }

  const venue = candidate.snapshot.venue;
  const average =
    joinedPreferences.reduce((sum, row) => sum + scoreMemberFit(venue, row.preferences), 0) / memberCount;
  const inCount = Number(candidate.in_count ?? 0);
  const skipCount = Number(candidate.skip_count ?? 0);
  const score = Math.min(100, Math.max(0, average * 100 + inCount * 4 - skipCount * 2));
  const reason =
    memberCount === 1
      ? `Group fit is based on the creator's saved picks.`
      : `Group fit blends ${memberCount} joined friends' saved picks.`;

  return {
    score: Math.round(score * 10) / 10,
    memberCount,
    reason
  };
}

function effectiveStage(session: SessionRow): DecisionStage {
  if (session.finalized_at) return "finalized";
  return session.stage ?? "swiping";
}

function profilePayload(input: {
  id: string | null;
  displayName: string | null;
  username: string | null;
  avatarKind: string | null;
}) {
  if (!input.id) {
    return {
      id: null,
      display_name: "Deleted user",
      username: "deleted",
      avatar_kind: "initials"
    };
  }
  return {
    id: input.id,
    display_name: input.displayName ?? "Nightloop user",
    username: input.username ?? "nightloop",
    avatar_kind: input.avatarKind ?? "initials"
  };
}

function publishDecisionRoomEvent(input: {
  account: AccountState;
  sessionId: string;
  type: DecisionRoomEventType;
  candidateId?: string;
  messageId?: string;
  stage?: DecisionStage;
  includeActor?: boolean;
}): void {
  const event: DecisionRoomEventInput = {
    session_id: input.sessionId,
    type: input.type,
    ...(input.includeActor === false
      ? {}
      : {
          actor: {
            id: input.account.user.id,
            display_name: input.account.profile.display_name,
            username: input.account.profile.username,
            avatar_kind: input.account.profile.avatar_kind
          }
        }),
    ...(input.candidateId ? { candidate_id: input.candidateId } : {}),
    ...(input.messageId ? { message_id: input.messageId } : {}),
    ...(input.stage ? { stage: input.stage } : {})
  };
  decisionRoomEventBus.publish(event);
}

function enqueueRoomNotificationFailSoft(input: {
  sessionId: string;
  recipientUserId: string;
  category: RoomNotificationCategory;
  actorDisplayName?: string;
}): void {
  void enqueueRoomNotification(
    input.sessionId,
    input.recipientUserId,
    input.category,
    input.actorDisplayName
  ).catch((error) => {
    logRoomNotificationEnqueueFailure(input.category, error);
  });
}

function enqueueJoinedRoomNotificationsFailSoft(input: {
  sessionId: string;
  actorUserId: string;
  category: RoomNotificationCategory;
  actorDisplayName?: string;
}): void {
  void (async () => {
    const recipients = await dbQuery<{ user_id: string }>(
      `
        SELECT user_id
        FROM decision_session_members
        WHERE session_id = $1::uuid
          AND status = 'joined'
          AND user_id <> $2::uuid
        ORDER BY joined_at ASC NULLS LAST, created_at ASC
      `,
      [input.sessionId, input.actorUserId]
    );
    await Promise.all(
      recipients.rows.map((recipient) =>
        enqueueRoomNotification(
          input.sessionId,
          recipient.user_id,
          input.category,
          input.actorDisplayName
        )
      )
    );
  })().catch((error) => {
    logRoomNotificationEnqueueFailure(input.category, error);
  });
}

function logRoomNotificationEnqueueFailure(category: RoomNotificationCategory, error: unknown): void {
  const apiCode = error instanceof ApiError ? error.code : undefined;
  const message = error instanceof Error ? error.message : "Unknown notification enqueue failure.";
  console.warn("[notifications] room enqueue failed", {
    category,
    ...(apiCode ? { code: apiCode } : {}),
    message
  });
}

function formatCandidate(
  candidate: CandidateRow,
  joinedPreferences: JoinedPreferenceRow[],
  session: SessionRow,
  viewerUserId: string
) {
  const groupFit = groupFitForCandidate(candidate, joinedPreferences);
  const suggestedBy = candidate.source === "suggested"
    ? profilePayload({
        id: candidate.suggested_by_user_id,
        displayName: candidate.suggested_by_display_name,
        username: candidate.suggested_by_username,
        avatarKind: candidate.suggested_by_avatar_kind
      })
    : null;
  const canRemove =
    !session.finalized_at &&
    candidate.source === "suggested" &&
    (session.creator_user_id === viewerUserId || candidate.suggested_by_user_id === viewerUserId);

  return {
    id: candidate.id,
    venue_id: candidate.venue_id,
    original_rank: Number(candidate.original_rank),
    base_score: Number(candidate.base_score),
    source: candidate.source,
    suggested_by: suggestedBy,
    suggested_at: candidate.suggested_at,
    can_remove: canRemove,
    venue: candidate.snapshot.venue,
    recommendation: candidate.snapshot.recommendation,
    in_count: Number(candidate.in_count ?? 0),
    skip_count: Number(candidate.skip_count ?? 0),
    viewer_vote: candidate.viewer_vote,
    shortlist_vote_count: Number(candidate.shortlist_vote_count ?? 0),
    viewer_shortlist_vote: candidate.viewer_shortlist_vote === true ? true : null,
    group_fit_score: groupFit.score,
    group_fit_member_count: groupFit.memberCount,
    group_fit_reason: groupFit.reason
  };
}

function sortForShortlist(candidates: ReturnType<typeof formatCandidate>[]) {
  return [...candidates].sort((left, right) => {
    if (left.in_count !== right.in_count) return right.in_count - left.in_count;
    if (left.group_fit_score !== right.group_fit_score) return right.group_fit_score - left.group_fit_score;
    if (left.base_score !== right.base_score) return right.base_score - left.base_score;
    return left.original_rank - right.original_rank;
  });
}

function chooseFinalRecommendation(candidates: ReturnType<typeof formatCandidate>[]) {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => {
    if (candidate.shortlist_vote_count !== best.shortlist_vote_count) {
      return candidate.shortlist_vote_count > best.shortlist_vote_count ? candidate : best;
    }
    if (candidate.group_fit_score !== best.group_fit_score) {
      return candidate.group_fit_score > best.group_fit_score ? candidate : best;
    }
    return candidate.original_rank < best.original_rank ? candidate : best;
  }, candidates[0]);
}

function formatMessage(message: DecisionMessageRow) {
  return {
    id: message.id,
    session_id: message.session_id,
    type: message.type,
    text: message.text,
    emoji: message.emoji,
    actor: profilePayload({
      id: message.actor_user_id,
      displayName: message.actor_display_name,
      username: message.actor_username,
      avatarKind: message.actor_avatar_kind
    }),
    expires_at: message.expires_at,
    created_at: message.created_at,
    updated_at: message.updated_at
  };
}

function chooseLeader(candidates: ReturnType<typeof formatCandidate>[]) {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => {
    if (candidate.in_count !== best.in_count) {
      return candidate.in_count > best.in_count ? candidate : best;
    }
    if (candidate.group_fit_score !== best.group_fit_score) {
      return candidate.group_fit_score > best.group_fit_score ? candidate : best;
    }
    return candidate.original_rank < best.original_rank ? candidate : best;
  }, candidates[0]);
}

async function expireSessionIfNeeded(client: DBClient, sessionId: string): Promise<void> {
  await client.query(
    `
      UPDATE decision_sessions
      SET status = 'expired',
          updated_at = NOW()
      WHERE id = $1::uuid
        AND status = 'active'
        AND expires_at <= NOW()
    `,
    [sessionId]
  );
}

async function readSession(client: DBClient, sessionId: string): Promise<SessionRow> {
  await expireSessionIfNeeded(client, sessionId);
  const result = await client.query<SessionRow>(
    `
      SELECT
        ds.id,
        ds.creator_user_id,
        ds.market_id,
        m.slug AS market_slug,
        m.short_label AS market_short_label,
        ds.status,
        ds.stage,
        ds.code_hint,
        ds.code_revoked_at,
        ds.filters,
        ds.final_candidate_id,
        ds.final_venue_id,
        ds.final_locked_by_user_id,
        locker_profile.display_name AS final_locked_by_display_name,
        locker_profile.username AS final_locked_by_username,
        locker_profile.avatar_kind AS final_locked_by_avatar_kind,
        ds.finalized_at,
        ds.final_meetup_at,
        ds.final_note,
        ds.expires_at,
        ds.ended_at,
        ds.created_at,
        ds.updated_at
      FROM decision_sessions ds
      JOIN markets m ON m.id = ds.market_id
      LEFT JOIN user_profiles locker_profile ON locker_profile.user_id = ds.final_locked_by_user_id
      WHERE ds.id = $1::uuid
      LIMIT 1
    `,
    [sessionId]
  );
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Decision session was not found.");
  }
  return row;
}

async function readMembership(
  client: DBClient,
  sessionId: string,
  userId: string
): Promise<MembershipRow | null> {
  const result = await client.query<MembershipRow>(
    `
      SELECT id, session_id, user_id, role, status, source, joined_at, created_at, updated_at
      FROM decision_session_members
      WHERE session_id = $1::uuid
        AND user_id = $2::uuid
      LIMIT 1
    `,
    [sessionId, userId]
  );
  return result.rows[0] ?? null;
}

async function assertNoBlocksBetween(client: DBClient, leftUserId: string, rightUserId: string): Promise<void> {
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
    throw new ApiError(403, "USER_BLOCKED", "This decision session is blocked.");
  }
}

async function assertNoBlocksWithJoinedMembers(
  client: DBClient,
  sessionId: string,
  userId: string
): Promise<void> {
  const result = await client.query<{ blocked: boolean }>(
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
    [sessionId, userId]
  );
  if (result.rows[0]?.blocked) {
    throw new ApiError(403, "USER_BLOCKED", "This decision session is blocked.");
  }
}

async function assertAcceptedFriendship(client: DBClient, leftUserId: string, rightUserId: string): Promise<void> {
  const result = await client.query<{ is_friend: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM friendships
        WHERE status = 'accepted'
          AND LEAST(requester_user_id::text, addressee_user_id::text) = LEAST($1::uuid::text, $2::uuid::text)
          AND GREATEST(requester_user_id::text, addressee_user_id::text) = GREATEST($1::uuid::text, $2::uuid::text)
      ) AS is_friend
    `,
    [leftUserId, rightUserId]
  );
  if (!result.rows[0]?.is_friend) {
    throw new ApiError(403, "FRIENDSHIP_REQUIRED", "Decision sessions are friend-scoped.");
  }
}

async function assertCodeFriendshipWithJoinedMember(
  client: DBClient,
  sessionId: string,
  userId: string
): Promise<void> {
  const result = await client.query<{ is_friend: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM decision_session_members dsm
        JOIN friendships f
          ON f.status = 'accepted'
         AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST(dsm.user_id::text, $2::uuid::text)
         AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST(dsm.user_id::text, $2::uuid::text)
        WHERE dsm.session_id = $1::uuid
          AND dsm.status = 'joined'
          AND dsm.user_id <> $2::uuid
      ) AS is_friend
    `,
    [sessionId, userId]
  );
  if (!result.rows[0]?.is_friend) {
    throw new ApiError(403, "FRIENDSHIP_REQUIRED", "A session code only works for friends of joined members.");
  }
}

async function assertVisibleMember(client: DBClient, sessionId: string, userId: string): Promise<MembershipRow> {
  const membership = await readMembership(client, sessionId, userId);
  if (!membership) {
    throw notFoundError("Decision session was not found.");
  }
  await assertNoBlocksWithJoinedMembers(client, sessionId, userId);
  return membership;
}

function assertActiveSession(session: SessionRow): void {
  if (session.status !== "active") {
    throw new ApiError(409, "DECISION_SESSION_CLOSED", "This decision session is no longer active.");
  }
}

function assertUnfinalizedSession(session: SessionRow): void {
  if (session.finalized_at) {
    throw new ApiError(409, "DECISION_SESSION_FINALIZED", "This room already has a final pick.");
  }
}

function assertCreator(session: SessionRow, account: AccountState): void {
  if (session.creator_user_id !== account.user.id) {
    throw new ApiError(403, "CREATOR_REQUIRED", "Only the session creator can do this.");
  }
}

async function ensureEligibleUser(client: DBClient, userId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM users
      WHERE id = $1::uuid
        AND deleted_at IS NULL
        AND eligibility_status = 'eligible'
      LIMIT 1
    `,
    [userId]
  );
  if (!result.rows[0]) {
    throw notFoundError("User profile was not found.");
  }
}

async function sessionExpiryForMarket(client: DBClient, marketId: string): Promise<string> {
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
  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Market was not found.");
  }
  return row.expires_at;
}

async function readJoinedPreferences(client: DBClient, sessionId: string): Promise<JoinedPreferenceRow[]> {
  const result = await client.query<JoinedPreferenceRow>(
    `
      SELECT
        dsm.user_id,
        COALESCE(pref.preferences, '{}'::jsonb) AS preferences
      FROM decision_session_members dsm
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(category, keys) AS preferences
        FROM (
          SELECT category, jsonb_agg(preference_key ORDER BY position ASC) AS keys
          FROM user_preferences
          WHERE user_id = dsm.user_id
          GROUP BY category
        ) grouped
      ) pref ON true
      WHERE dsm.session_id = $1::uuid
        AND dsm.status = 'joined'
      ORDER BY dsm.joined_at ASC NULLS LAST, dsm.created_at ASC
    `,
    [sessionId]
  );
  return result.rows;
}

async function readCandidates(
  client: DBClient,
  sessionId: string,
  viewerUserId: string
): Promise<CandidateRow[]> {
  const result = await client.query<CandidateRow>(
    `
      SELECT
        dsc.id,
        dsc.session_id,
        dsc.venue_id,
        dsc.original_rank,
        dsc.base_score,
        dsc.snapshot,
        dsc.source,
        dsc.suggested_by_user_id,
        suggester_profile.display_name AS suggested_by_display_name,
        suggester_profile.username AS suggested_by_username,
        suggester_profile.avatar_kind AS suggested_by_avatar_kind,
        dsc.suggested_at,
        COALESCE(vote_counts.in_count, 0) AS in_count,
        COALESCE(vote_counts.skip_count, 0) AS skip_count,
        viewer_vote.vote AS viewer_vote,
        COALESCE(shortlist_counts.vote_count, 0) AS shortlist_vote_count,
        (viewer_shortlist_vote.user_id IS NOT NULL) AS viewer_shortlist_vote
      FROM decision_session_candidates dsc
      LEFT JOIN user_profiles suggester_profile ON suggester_profile.user_id = dsc.suggested_by_user_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE vote = 'in')::int AS in_count,
          COUNT(*) FILTER (WHERE vote = 'skip')::int AS skip_count
        FROM decision_votes dv
        WHERE dv.session_id = dsc.session_id
          AND dv.candidate_id = dsc.id
      ) vote_counts ON true
      LEFT JOIN LATERAL (
        SELECT vote
        FROM decision_votes dv
        WHERE dv.session_id = dsc.session_id
          AND dv.candidate_id = dsc.id
          AND dv.user_id = $2::uuid
        LIMIT 1
      ) viewer_vote ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS vote_count
        FROM decision_shortlist_votes dsv
        WHERE dsv.session_id = dsc.session_id
          AND dsv.candidate_id = dsc.id
      ) shortlist_counts ON true
      LEFT JOIN LATERAL (
        SELECT user_id
        FROM decision_shortlist_votes dsv
        WHERE dsv.session_id = dsc.session_id
          AND dsv.candidate_id = dsc.id
          AND dsv.user_id = $2::uuid
        LIMIT 1
      ) viewer_shortlist_vote ON true
      WHERE dsc.session_id = $1::uuid
      ORDER BY dsc.original_rank ASC
    `,
    [sessionId, viewerUserId]
  );
  return result.rows;
}

async function readMessages(client: DBClient, sessionId: string): Promise<DecisionMessageRow[]> {
  const result = await client.query<DecisionMessageRow>(
    `
      SELECT
        dsm.id,
        dsm.session_id,
        dsm.actor_user_id,
        actor_profile.display_name AS actor_display_name,
        actor_profile.username AS actor_username,
        actor_profile.avatar_kind AS actor_avatar_kind,
        dsm.type,
        dsm.text,
        dsm.emoji,
        dsm.expires_at,
        dsm.created_at,
        dsm.updated_at
      FROM decision_session_messages dsm
      LEFT JOIN user_profiles actor_profile ON actor_profile.user_id = dsm.actor_user_id
      WHERE dsm.session_id = $1::uuid
        AND dsm.expires_at > NOW()
      ORDER BY dsm.created_at ASC
      LIMIT ${MAX_ROOM_MESSAGES}
    `,
    [sessionId]
  );
  return result.rows;
}

async function countMembers(client: DBClient, sessionId: string) {
  const result = await client.query<{ joined: string; invited: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'joined')::text AS joined,
        COUNT(*) FILTER (WHERE status = 'invited')::text AS invited
      FROM decision_session_members
      WHERE session_id = $1::uuid
    `,
    [sessionId]
  );
  const row = result.rows[0];
  return {
    joined: Number(row?.joined ?? 0),
    invited: Number(row?.invited ?? 0)
  };
}

async function readMemberProgress(client: DBClient, sessionId: string, deckCandidateIds: string[]): Promise<MemberProgressRow[]> {
  const result = await client.query<MemberProgressRow>(
    `
      SELECT
        dsm.user_id,
        p.display_name,
        p.username,
        p.avatar_kind,
        dsm.role,
        COUNT(DISTINCT dv.candidate_id)::int AS swiped_count
      FROM decision_session_members dsm
      JOIN user_profiles p ON p.user_id = dsm.user_id
      LEFT JOIN decision_votes dv
        ON dv.session_id = dsm.session_id
       AND dv.user_id = dsm.user_id
       AND dv.candidate_id = ANY($2::uuid[])
      WHERE dsm.session_id = $1::uuid
        AND dsm.status = 'joined'
      GROUP BY dsm.user_id, p.display_name, p.username, p.avatar_kind, dsm.role, dsm.joined_at, dsm.created_at
      ORDER BY dsm.role = 'creator' DESC, dsm.joined_at ASC NULLS LAST, dsm.created_at ASC
    `,
    [sessionId, deckCandidateIds]
  );
  return result.rows;
}

function roomTitle(progressRows: MemberProgressRow[]): string {
  const first = progressRows[0]?.display_name ?? "Your group";
  const extraCount = Math.max(0, progressRows.length - 1);
  return extraCount > 0 ? `${first} + ${extraCount} tonight` : `${first}'s room tonight`;
}

function formatProgress(progressRows: MemberProgressRow[], deckCandidateCount: number, forcedReady: boolean) {
  const required = Math.min(MIN_SWIPES_FOR_SHORTLIST, deckCandidateCount);
  const members = progressRows.map((row) => {
    const swipedCount = Math.min(Number(row.swiped_count ?? 0), deckCandidateCount);
    return {
      user: {
        id: null,
        display_name: row.display_name,
        username: row.username,
        avatar_kind: row.avatar_kind
      },
      role: row.role,
      swiped_count: swipedCount,
      required_swipes: required,
      is_complete: required === 0 || swipedCount >= required
    };
  });
  const readyBySwipes = members.length > 0 && members.every((member) => member.is_complete);
  const completion =
    members.length === 0 || required === 0
      ? 0
      : members.reduce((sum, member) => sum + Math.min(1, member.swiped_count / required), 0) / members.length;
  const confidence = Math.round(Math.max(0, Math.min(100, completion * 100)));
  return {
    ready_for_shortlist: forcedReady || readyBySwipes,
    confidence,
    required_swipes_per_member: required,
    members
  };
}

function baseDeckCandidates(candidates: ReturnType<typeof formatCandidate>[]) {
  return candidates
    .filter((candidate) => candidate.source === "initial")
    .sort((left, right) => left.original_rank - right.original_rank)
    .slice(0, DECK_SIZE);
}

function unswipedDeckCandidates(candidates: ReturnType<typeof formatCandidate>[]) {
  return candidates
    .filter((candidate) => candidate.viewer_vote === null)
    .sort((left, right) => left.original_rank - right.original_rank);
}

async function readLatestSwipingVote(
  client: DBClient,
  sessionId: string,
  userId: string
): Promise<{ id: string; candidate_id: string; created_at: string; updated_at: string } | null> {
  const result = await client.query<{ id: string; candidate_id: string; created_at: string; updated_at: string }>(
    `
      SELECT id, candidate_id, created_at, updated_at
      FROM decision_votes
      WHERE session_id = $1::uuid
        AND user_id = $2::uuid
        AND candidate_id IN (
          SELECT id
          FROM decision_session_candidates
          WHERE session_id = $1::uuid
            AND source = 'initial'
          ORDER BY original_rank ASC
          LIMIT ${DECK_SIZE}
        )
      ORDER BY updated_at DESC, created_at DESC, id DESC
      LIMIT 1
    `,
    [sessionId, userId]
  );
  return result.rows[0] ?? null;
}

function formatDeckState(input: {
  session: SessionRow;
  stage: DecisionStage;
  membership: MembershipRow;
  baseDeck: ReturnType<typeof formatCandidate>[];
  activeDeck: ReturnType<typeof formatCandidate>[];
  latestVote: { candidate_id: string } | null;
}): DeckState {
  const canRewind =
    input.session.status === "active" &&
    !input.session.finalized_at &&
    input.stage === "swiping" &&
    input.membership.status === "joined" &&
    input.latestVote !== null;

  return {
    deck_size: DECK_SIZE,
    cards_total: input.baseDeck.length,
    cards_remaining: input.activeDeck.length,
    next_candidate_id: input.stage === "swiping" ? input.activeDeck[0]?.id ?? null : null,
    last_swiped_candidate_id: input.latestVote?.candidate_id ?? null,
    can_rewind: canRewind
  };
}

async function countSuggestedCandidates(client: DBClient, sessionId: string): Promise<number> {
  const result = await client.query<{ count: string | number }>(
    `
      SELECT COUNT(*) AS count
      FROM decision_session_candidates
      WHERE session_id = $1::uuid
        AND source = 'suggested'
    `,
    [sessionId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function nextCandidateRank(client: DBClient, sessionId: string): Promise<number> {
  const result = await client.query<{ rank: string | number }>(
    `
      SELECT COALESCE(MAX(original_rank), 0) + 1 AS rank
      FROM decision_session_candidates
      WHERE session_id = $1::uuid
    `,
    [sessionId]
  );
  return Number(result.rows[0]?.rank ?? 1);
}

function assertJoinedMember(membership: MembershipRow): void {
  if (membership.status !== "joined") {
    throw new ApiError(403, "SESSION_JOIN_REQUIRED", "Join the decision session first.");
  }
}

async function formatSessionResponse(
  client: DBClient,
  sessionId: string,
  account: AccountState,
  code?: string
) {
  const session = await readSession(client, sessionId);
  const membership = await assertVisibleMember(client, sessionId, account.user.id);
  const joinedPreferences = await readJoinedPreferences(client, sessionId);
  const candidates = (await readCandidates(client, sessionId, account.user.id)).map((candidate) =>
    formatCandidate(candidate, joinedPreferences, session, account.user.id)
  );
  const stage = effectiveStage(session);
  const baseDeck = baseDeckCandidates(candidates);
  const activeDeck = unswipedDeckCandidates(baseDeck);
  const deckCandidates = stage === "swiping" ? activeDeck : baseDeck;
  const shortlist = stage === "swiping" ? [] : sortForShortlist(candidates).slice(0, SHORTLIST_SIZE);
  const recommendedFinalCandidate = stage === "swiping" ? null : chooseFinalRecommendation(shortlist);
  const progressRows = await readMemberProgress(client, sessionId, baseDeck.map((candidate) => candidate.id));
  const progress = formatProgress(progressRows, baseDeck.length, stage !== "swiping");
  const leader = chooseLeader(candidates);
  const memberCounts = await countMembers(client, sessionId);
  const messages = (await readMessages(client, sessionId)).map(formatMessage);
  const latestVote = await readLatestSwipingVote(client, sessionId, account.user.id);
  const isJoined = membership.status === "joined";
  const isActive = session.status === "active";
  const isUnfinalized = !session.finalized_at;
  const finalCandidate = session.final_candidate_id
    ? candidates.find((candidate) => candidate.id === session.final_candidate_id) ?? null
    : null;

  return {
    session: {
      id: session.id,
      status: session.status,
      stage,
      room_title: roomTitle(progressRows),
      market: {
        id: session.market_id,
        slug: session.market_slug,
        short_label: session.market_short_label
      },
      filters: session.filters ?? {},
      final_plan: session.finalized_at
        ? {
            candidate_id: session.final_candidate_id,
            venue_id: session.final_venue_id,
            finalized_at: session.finalized_at,
            meetup_at: session.final_meetup_at,
            note: session.final_note,
            locked_by: profilePayload({
              id: session.final_locked_by_user_id,
              displayName: session.final_locked_by_display_name,
              username: session.final_locked_by_username,
              avatarKind: session.final_locked_by_avatar_kind
            }),
            venue: finalCandidate?.venue ?? null
          }
        : null,
      expires_at: session.expires_at,
      ended_at: session.ended_at,
      code_hint: session.code_hint,
      code_revoked_at: session.code_revoked_at,
      ...(code ? { code } : {}),
      member_counts: memberCounts,
      viewer_role: membership.role,
      viewer_status: membership.status,
      deck_state: formatDeckState({
        session,
        stage,
        membership,
        baseDeck,
        activeDeck,
        latestVote
      }),
      capabilities: {
        can_vote: isActive && isJoined && isUnfinalized && stage === "swiping",
        can_vote_shortlist: isActive && isJoined && isUnfinalized && stage === "shortlist_voting",
        can_force_shortlist: isActive && isJoined && isUnfinalized && stage === "swiping" && membership.role === "creator",
        can_suggest_candidates: isActive && isJoined && isUnfinalized && stage === "swiping",
        can_message: isActive && isJoined,
        can_finalize: isActive && isUnfinalized && membership.role === "creator"
      },
      progress,
      created_at: session.created_at,
      updated_at: session.updated_at
    },
    candidates,
    deck_candidates: deckCandidates,
    shortlist,
    recommended_final_candidate: recommendedFinalCandidate,
    leader,
    messages
  };
}

async function formatSessionSummary(client: DBClient, sessionId: string, account: AccountState) {
  const detail = await formatSessionResponse(client, sessionId, account);
  return {
    id: detail.session.id,
    status: detail.session.status,
    stage: detail.session.stage,
    room_title: detail.session.room_title,
    market: detail.session.market,
    expires_at: detail.session.expires_at,
    code_hint: detail.session.code_hint,
    code_revoked_at: detail.session.code_revoked_at,
    member_counts: detail.session.member_counts,
    viewer_role: detail.session.viewer_role,
    viewer_status: detail.session.viewer_status,
    progress: detail.session.progress,
    final_plan: detail.session.final_plan,
    leader: detail.leader
      ? {
          id: detail.leader.id,
          venue_id: detail.leader.venue_id,
          venue_name: detail.leader.venue.name,
          in_count: detail.leader.in_count,
          group_fit_score: detail.leader.group_fit_score
        }
      : null
  };
}

export async function listDecisionSessions(account: AccountState) {
  requireEligible(account);
  const result = await dbQuery<{ id: string }>(
    `
      SELECT ds.id
      FROM decision_sessions ds
      JOIN decision_session_members dsm ON dsm.session_id = ds.id
      WHERE dsm.user_id = $1::uuid
        AND ds.status IN ('active', 'ended')
        AND NOT EXISTS (
          SELECT 1
          FROM decision_session_members joined
          JOIN blocked_users b
            ON (b.blocker_user_id = $1::uuid AND b.blocked_user_id = joined.user_id)
            OR (b.blocker_user_id = joined.user_id AND b.blocked_user_id = $1::uuid)
          WHERE joined.session_id = ds.id
            AND joined.status = 'joined'
            AND joined.user_id <> $1::uuid
        )
      ORDER BY ds.expires_at DESC, ds.created_at DESC
      LIMIT 20
    `,
    [account.user.id]
  );

  const items = [];
  for (const row of result.rows) {
    items.push(await formatSessionSummary({ query: dbQuery }, row.id, account));
  }
  return { items };
}

export async function createDecisionSession(input: {
  account: AccountState;
  marketId: string;
  filters?: DecisionFilters;
  invitedUserIds?: string[];
}) {
  requireEligible(input.account);
  const market = await findMarketByIdOrSlug(input.marketId);
  if (market.launch_status !== "active" && market.launch_status !== "preview") {
    throw new ApiError(404, "MARKET_NOT_AVAILABLE", "This market is not available yet.");
  }

  const filters = safeFilters(input.filters);
  const recommendations = await listRecommendations({
    account: input.account,
    marketId: market.id,
    pulse: filters.pulse,
    limit: 60
  });
  const preferred = recommendations.items.filter((item) => candidateMatchesFilters(item, filters));
  const preferredIds = new Set(preferred.map((item) => item.venue.id));
  const fallback = recommendations.items.filter((item) => !preferredIds.has(item.venue.id));
  const slate = [...preferred, ...fallback].slice(0, SESSION_SIZE);

  if (slate.length < SESSION_SIZE) {
    throw new ApiError(409, "INSUFFICIENT_CANDIDATES", "Not enough venues are available for a decision session.");
  }

  const invitedUserIds = [...new Set(input.invitedUserIds ?? [])].filter((userId) => userId !== input.account.user.id);
  const code = generateDecisionCode();
  const tokenHash = hashCode(code);

  const sessionId = await dbTransaction(async (client) => {
    for (const invitedUserId of invitedUserIds) {
      await ensureEligibleUser(client, invitedUserId);
      await assertNoBlocksBetween(client, input.account.user.id, invitedUserId);
      await assertAcceptedFriendship(client, input.account.user.id, invitedUserId);
    }

    const expiresAt = await sessionExpiryForMarket(client, market.id);
    const session = await client.query<{ id: string }>(
      `
        INSERT INTO decision_sessions (
          creator_user_id,
          market_id,
          token_hash,
          code_hint,
          filters,
          metadata,
          expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz)
        RETURNING id
      `,
      [
        input.account.user.id,
        market.id,
        tokenHash,
        codeHint(code),
        JSON.stringify(filters),
        JSON.stringify({ phase: "phase_6b_decision_mvp" }),
        expiresAt
      ]
    );
    const id = session.rows[0]?.id;
    if (!id) {
      throw new Error("Failed to create decision session.");
    }

    await client.query(
      `
        INSERT INTO decision_session_members (session_id, user_id, role, status, source, joined_at)
        VALUES ($1::uuid, $2::uuid, 'creator', 'joined', 'creator', NOW())
      `,
      [id, input.account.user.id]
    );

    for (const invitedUserId of invitedUserIds) {
      await client.query(
        `
          INSERT INTO decision_session_members (session_id, user_id, role, status, source)
          VALUES ($1::uuid, $2::uuid, 'member', 'invited', 'invited')
          ON CONFLICT (session_id, user_id) DO NOTHING
        `,
        [id, invitedUserId]
      );
    }

    for (const [index, item] of slate.entries()) {
      await client.query(
        `
          INSERT INTO decision_session_candidates (
            session_id,
            venue_id,
            original_rank,
            base_score,
            snapshot
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
        `,
        [id, item.venue.id, index + 1, item.score, JSON.stringify(buildSnapshot(item))]
      );
    }

    return id;
  });

  for (const invitedUserId of invitedUserIds) {
    enqueueRoomNotificationFailSoft({
      sessionId,
      recipientUserId: invitedUserId,
      category: "room_invite",
      actorDisplayName: input.account.profile.display_name
    });
  }

  return formatSessionResponse({ query: dbQuery }, sessionId, input.account, code);
}

export async function getDecisionSession(account: AccountState, sessionId: string) {
  requireEligible(account);
  return formatSessionResponse({ query: dbQuery }, sessionId, account);
}

export async function joinDecisionSession(input: {
  account: AccountState;
  sessionId: string;
  code?: string;
}) {
  requireEligible(input.account);

  let joined = false;
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    await assertNoBlocksWithJoinedMembers(client, input.sessionId, input.account.user.id);
    const membership = await readMembership(client, input.sessionId, input.account.user.id);

    if (membership?.status === "joined") {
      return;
    }

    if (membership?.status === "invited") {
      await client.query(
        `
          UPDATE decision_session_members
          SET status = 'joined',
              joined_at = NOW()
          WHERE id = $1::uuid
        `,
        [membership.id]
      );
      joined = true;
      return;
    }

    if (!input.code) {
      throw new ApiError(403, "SESSION_CODE_REQUIRED", "A session code is required.");
    }

    const codeResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM decision_sessions
        WHERE id = $1::uuid
          AND status = 'active'
          AND expires_at > NOW()
          AND code_revoked_at IS NULL
          AND token_hash = $2
        LIMIT 1
      `,
      [input.sessionId, hashCode(input.code)]
    );
    if (!codeResult.rows[0]) {
      throw new ApiError(403, "SESSION_CODE_INVALID", "This session code is no longer available.");
    }

    await assertCodeFriendshipWithJoinedMember(client, input.sessionId, input.account.user.id);
    await client.query(
      `
        INSERT INTO decision_session_members (session_id, user_id, role, status, source, joined_at)
        VALUES ($1::uuid, $2::uuid, 'member', 'joined', 'code', NOW())
        ON CONFLICT (session_id, user_id) DO UPDATE SET
          status = 'joined',
          source = 'code',
          joined_at = COALESCE(decision_session_members.joined_at, NOW())
      `,
      [input.sessionId, input.account.user.id]
    );
    joined = true;
  });

  if (joined) {
    publishDecisionRoomEvent({
      account: input.account,
      sessionId: input.sessionId,
      type: "room_joined"
    });
  }

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function joinDecisionSessionByCode(input: {
  account: AccountState;
  code: string;
}) {
  requireEligible(input.account);

  let joined = false;
  const sessionId = await dbTransaction(async (client) => {
    const codeResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM decision_sessions
        WHERE status = 'active'
          AND expires_at > NOW()
          AND code_revoked_at IS NULL
          AND token_hash = $1
        ORDER BY expires_at DESC
        LIMIT 1
      `,
      [hashCode(input.code)]
    );
    const session = codeResult.rows[0];
    if (!session) {
      throw new ApiError(403, "SESSION_CODE_INVALID", "This room code is no longer available.");
    }

    await assertNoBlocksWithJoinedMembers(client, session.id, input.account.user.id);
    const membership = await readMembership(client, session.id, input.account.user.id);

    if (membership?.status === "joined") {
      return session.id;
    }

    if (membership?.status === "invited") {
      await client.query(
        `
          UPDATE decision_session_members
          SET status = 'joined',
              joined_at = NOW()
          WHERE id = $1::uuid
        `,
        [membership.id]
      );
      joined = true;
      return session.id;
    }

    await assertCodeFriendshipWithJoinedMember(client, session.id, input.account.user.id);
    await client.query(
      `
        INSERT INTO decision_session_members (session_id, user_id, role, status, source, joined_at)
        VALUES ($1::uuid, $2::uuid, 'member', 'joined', 'code', NOW())
        ON CONFLICT (session_id, user_id) DO UPDATE SET
          status = 'joined',
          source = 'code',
          joined_at = COALESCE(decision_session_members.joined_at, NOW()),
          updated_at = NOW()
      `,
      [session.id, input.account.user.id]
    );

    joined = true;
    return session.id;
  });

  if (joined) {
    publishDecisionRoomEvent({
      account: input.account,
      sessionId,
      type: "room_joined"
    });
  }

  return formatSessionResponse({ query: dbQuery }, sessionId, input.account);
}

export async function voteDecisionSession(input: {
  account: AccountState;
  sessionId: string;
  candidateId?: string;
  venueId?: string;
  vote: VoteValue;
}) {
  requireEligible(input.account);
  if (!input.candidateId && !input.venueId) {
    throw validationError("candidate_id or venue_id is required.", { candidate_id: "Required" });
  }

  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "swiping") {
      throw new ApiError(409, "DECISION_STAGE_LOCKED", "Swipe voting is closed for this room.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const candidate = await client.query<{ id: string }>(
      `
        SELECT id
        FROM decision_session_candidates
        WHERE session_id = $1::uuid
          AND (
            ($2::uuid IS NOT NULL AND id = $2::uuid)
            OR ($3::uuid IS NOT NULL AND venue_id = $3::uuid)
          )
        LIMIT 1
      `,
      [input.sessionId, input.candidateId ?? null, input.venueId ?? null]
    );
    const candidateId = candidate.rows[0]?.id;
    if (!candidateId) {
      throw notFoundError("Decision candidate was not found.");
    }

    await client.query(
      `
        INSERT INTO decision_votes (session_id, candidate_id, user_id, vote)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
        ON CONFLICT (session_id, candidate_id, user_id) DO UPDATE SET
          vote = EXCLUDED.vote,
          updated_at = NOW()
      `,
      [input.sessionId, candidateId, input.account.user.id, input.vote]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "vote_changed",
    stage: "swiping",
    includeActor: false
  });
  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "progress_changed",
    stage: "swiping",
    includeActor: false
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function rewindDecisionSession(input: {
  account: AccountState;
  sessionId: string;
}) {
  requireEligible(input.account);

  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "swiping") {
      throw new ApiError(409, "DECISION_STAGE_LOCKED", "Rewind is closed for this room.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const latestVote = await readLatestSwipingVote(client, input.sessionId, input.account.user.id);
    if (!latestVote) {
      throw new ApiError(409, "NO_REWIND_AVAILABLE", "There is no swipe to rewind.");
    }

    await client.query(
      `
        DELETE FROM decision_votes
        WHERE id = $1::uuid
          AND session_id = $2::uuid
          AND user_id = $3::uuid
      `,
      [latestVote.id, input.sessionId, input.account.user.id]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "vote_changed",
    stage: "swiping",
    includeActor: false
  });
  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "progress_changed",
    stage: "swiping",
    includeActor: false
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function advanceDecisionSessionShortlist(input: {
  account: AccountState;
  sessionId: string;
}) {
  requireEligible(input.account);
  let advanced = false;
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    assertCreator(session, input.account);
    if (effectiveStage(session) !== "swiping") {
      return;
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);
    await client.query(
      `
        UPDATE decision_sessions
        SET stage = 'shortlist_voting',
            shortlist_unlocked_at = COALESCE(shortlist_unlocked_at, NOW()),
            shortlist_unlocked_by_user_id = $2::uuid,
            shortlist_unlock_reason = 'creator_or_smart_minimum',
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [input.sessionId, input.account.user.id]
    );
    advanced = true;
  });

  if (advanced) {
    publishDecisionRoomEvent({
      account: input.account,
      sessionId: input.sessionId,
      type: "shortlist_ready",
      stage: "shortlist_voting"
    });
    enqueueJoinedRoomNotificationsFailSoft({
      sessionId: input.sessionId,
      actorUserId: input.account.user.id,
      category: "shortlist_ready",
      actorDisplayName: input.account.profile.display_name
    });
  }

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function voteDecisionSessionShortlist(input: {
  account: AccountState;
  sessionId: string;
  candidateId: string;
}) {
  requireEligible(input.account);
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "shortlist_voting") {
      throw new ApiError(409, "SHORTLIST_NOT_OPEN", "Shortlist voting is not open for this room.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const joinedPreferences = await readJoinedPreferences(client, input.sessionId);
    const candidates = (await readCandidates(client, input.sessionId, input.account.user.id)).map((candidate) =>
      formatCandidate(candidate, joinedPreferences, session, input.account.user.id)
    );
    const shortlistIds = new Set(sortForShortlist(candidates).slice(0, SHORTLIST_SIZE).map((candidate) => candidate.id));
    if (!shortlistIds.has(input.candidateId)) {
      throw new ApiError(409, "CANDIDATE_NOT_SHORTLISTED", "Vote for one of the shortlisted venues.");
    }

    await client.query(
      `
        INSERT INTO decision_shortlist_votes (session_id, candidate_id, user_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid)
        ON CONFLICT (session_id, user_id) DO UPDATE SET
          candidate_id = EXCLUDED.candidate_id,
          updated_at = NOW()
      `,
      [input.sessionId, input.candidateId, input.account.user.id]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "shortlist_vote_changed",
    stage: "shortlist_voting",
    includeActor: false
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function searchDecisionSessionVenues(input: {
  account: AccountState;
  sessionId: string;
  q: string;
  limit?: number;
}) {
  requireEligible(input.account);
  const session = await readSession({ query: dbQuery }, input.sessionId);
  assertActiveSession(session);
  assertUnfinalizedSession(session);
  if (effectiveStage(session) !== "swiping") {
    throw new ApiError(409, "DECISION_STAGE_LOCKED", "Suggestions are closed for this room.");
  }
  const membership = await assertVisibleMember({ query: dbQuery }, input.sessionId, input.account.user.id);
  assertJoinedMember(membership);
  const existing = await dbQuery<{ venue_id: string }>(
    `
      SELECT venue_id
      FROM decision_session_candidates
      WHERE session_id = $1::uuid
    `,
    [input.sessionId]
  );
  const existingVenueIds = new Set(existing.rows.map((row) => row.venue_id));
  const venues = await listVenues({
    account: input.account,
    marketId: session.market_id,
    q: input.q,
    limit: Math.min(Math.max(input.limit ?? 12, 1) * 3, 60)
  });

  return {
    items: venues.items
      .filter((venue) => !existingVenueIds.has(venue.id))
      .slice(0, input.limit ?? 12)
  };
}

export async function suggestDecisionCandidate(input: {
  account: AccountState;
  sessionId: string;
  venueId: string;
}) {
  requireEligible(input.account);
  let suggestedCandidateId: string | undefined;
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "swiping") {
      throw new ApiError(409, "DECISION_STAGE_LOCKED", "Suggestions are closed for this room.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const suggestedCount = await countSuggestedCandidates(client, input.sessionId);
    if (suggestedCount >= MAX_SUGGESTED_CANDIDATES) {
      throw new ApiError(409, "SUGGESTION_LIMIT_REACHED", "This room already has the maximum number of suggestions.");
    }

    const venueResponse = await getVenue(input.venueId, input.account);
    const venue = venueResponse.venue as VenuePayload;
    if (venue.market_id !== session.market_id) {
      throw notFoundError("Venue was not found.");
    }

    const duplicate = await client.query<{ id: string }>(
      `
        SELECT id
        FROM decision_session_candidates
        WHERE session_id = $1::uuid
          AND venue_id = $2::uuid
        LIMIT 1
      `,
      [input.sessionId, input.venueId]
    );
    if (duplicate.rows[0]) {
      throw new ApiError(409, "CANDIDATE_ALREADY_EXISTS", "This venue is already in the room.");
    }

    const rank = await nextCandidateRank(client, input.sessionId);
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO decision_session_candidates (
          session_id,
          venue_id,
          original_rank,
          base_score,
          snapshot,
          source,
          suggested_by_user_id,
          suggested_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, 'suggested', $6::uuid, NOW())
        RETURNING id
      `,
      [
        input.sessionId,
        input.venueId,
        rank,
        Number(venue.pulse?.score ?? 0),
        JSON.stringify(buildSuggestedSnapshot(venue, rank)),
        input.account.user.id
      ]
    );
    suggestedCandidateId = inserted.rows[0]?.id;

    await client.query(
      `
        INSERT INTO decision_votes (session_id, candidate_id, user_id, vote)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'in')
        ON CONFLICT (session_id, candidate_id, user_id) DO UPDATE SET
          vote = 'in',
          updated_at = NOW()
      `,
      [input.sessionId, inserted.rows[0]?.id, input.account.user.id]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "candidate_suggested",
    candidateId: suggestedCandidateId,
    stage: "swiping"
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function removeDecisionCandidate(input: {
  account: AccountState;
  sessionId: string;
  candidateId: string;
}) {
  requireEligible(input.account);
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    if (effectiveStage(session) !== "swiping") {
      throw new ApiError(409, "DECISION_STAGE_LOCKED", "Candidate changes are closed for this room.");
    }
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const candidate = await client.query<{
      id: string;
      source: CandidateSource;
      suggested_by_user_id: string | null;
    }>(
      `
        SELECT id, source, suggested_by_user_id
        FROM decision_session_candidates
        WHERE session_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [input.sessionId, input.candidateId]
    );
    const row = candidate.rows[0];
    if (!row) {
      throw notFoundError("Decision candidate was not found.");
    }
    if (row.source !== "suggested") {
      throw new ApiError(409, "INITIAL_CANDIDATE_LOCKED", "Initial room candidates cannot be removed.");
    }
    if (membership.role !== "creator" && row.suggested_by_user_id !== input.account.user.id) {
      throw new ApiError(403, "CANDIDATE_REMOVE_FORBIDDEN", "Only the creator or suggester can remove this venue.");
    }

    await client.query(
      `
        DELETE FROM decision_session_candidates
        WHERE id = $1::uuid
      `,
      [input.candidateId]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "candidate_removed",
    candidateId: input.candidateId,
    stage: "swiping"
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function finalizeDecisionSession(input: {
  account: AccountState;
  sessionId: string;
  candidateId: string;
  finalMeetupAt?: string | null;
  finalNote?: string | null;
}) {
  requireEligible(input.account);
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    assertUnfinalizedSession(session);
    assertCreator(session, input.account);
    if (effectiveStage(session) !== "shortlist_voting") {
      throw new ApiError(409, "SHORTLIST_REQUIRED", "Create the shortlist before locking a final pick.");
    }

    const candidate = await client.query<{ id: string; venue_id: string }>(
      `
        SELECT id, venue_id
        FROM decision_session_candidates
        WHERE session_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [input.sessionId, input.candidateId]
    );
    const row = candidate.rows[0];
    if (!row) {
      throw notFoundError("Decision candidate was not found.");
    }

    await client.query(
      `
        UPDATE decision_sessions
        SET final_candidate_id = $2::uuid,
            final_venue_id = $3::uuid,
            final_locked_by_user_id = $4::uuid,
            stage = 'finalized',
            finalized_at = NOW(),
            final_meetup_at = $5::timestamptz,
            final_note = $6,
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [
        input.sessionId,
        row.id,
        row.venue_id,
        input.account.user.id,
        input.finalMeetupAt ?? null,
        input.finalNote?.trim() || null
      ]
    );
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "final_plan_locked",
    candidateId: input.candidateId,
    stage: "finalized"
  });
  enqueueJoinedRoomNotificationsFailSoft({
    sessionId: input.sessionId,
    actorUserId: input.account.user.id,
    category: "final_plan_locked",
    actorDisplayName: input.account.profile.display_name
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function addDecisionSessionMessage(input: {
  account: AccountState;
  sessionId: string;
  type: DecisionMessageType;
  text?: string;
  emoji?: DecisionEmoji;
}) {
  requireEligible(input.account);
  let messageId: string | undefined;
  let messageStage: DecisionStage | undefined;
  await dbTransaction(async (client) => {
    const session = await readSession(client, input.sessionId);
    assertActiveSession(session);
    messageStage = effectiveStage(session);
    const membership = await assertVisibleMember(client, input.sessionId, input.account.user.id);
    assertJoinedMember(membership);

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO decision_session_messages (
          session_id,
          actor_user_id,
          type,
          text,
          emoji,
          expires_at
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz)
        RETURNING id
      `,
      [
        input.sessionId,
        input.account.user.id,
        input.type,
        input.type === "text" ? input.text?.trim() : null,
        input.type === "emoji" ? input.emoji : null,
        session.expires_at
      ]
    );
    messageId = inserted.rows[0]?.id;
  });

  publishDecisionRoomEvent({
    account: input.account,
    sessionId: input.sessionId,
    type: "message_created",
    messageId,
    stage: messageStage
  });
  enqueueJoinedRoomNotificationsFailSoft({
    sessionId: input.sessionId,
    actorUserId: input.account.user.id,
    category: "room_message",
    actorDisplayName: input.account.profile.display_name
  });

  return formatSessionResponse({ query: dbQuery }, input.sessionId, input.account);
}

export async function reportDecisionSessionMessage(input: {
  account: AccountState;
  sessionId: string;
  messageId: string;
  reason: string;
  details?: Record<string, unknown>;
}) {
  requireEligible(input.account);
  const session = await readSession({ query: dbQuery }, input.sessionId);
  assertActiveSession(session);
  const membership = await assertVisibleMember({ query: dbQuery }, input.sessionId, input.account.user.id);
  assertJoinedMember(membership);
  const message = await dbQuery<{ id: string }>(
    `
      SELECT id
      FROM decision_session_messages
      WHERE id = $1::uuid
        AND session_id = $2::uuid
      LIMIT 1
    `,
    [input.messageId, input.sessionId]
  );
  if (!message.rows[0]) {
    throw notFoundError("Decision message was not found.");
  }
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO moderation_reports (reporter_user_id, target_type, target_id, reason, details)
      VALUES ($1::uuid, 'decision_message', $2, $3, $4::jsonb)
      RETURNING id
    `,
    [
      input.account.user.id,
      input.messageId,
      input.reason,
      JSON.stringify(input.details ?? {})
    ]
  );
  return { report_id: result.rows[0]?.id };
}

export async function revokeDecisionSessionCode(account: AccountState, sessionId: string) {
  requireEligible(account);
  await dbTransaction(async (client) => {
    const session = await readSession(client, sessionId);
    assertCreator(session, account);
    await client.query(
      `
        UPDATE decision_sessions
        SET code_revoked_at = COALESCE(code_revoked_at, NOW()),
            token_hash = NULL
        WHERE id = $1::uuid
      `,
      [sessionId]
    );
  });
  return formatSessionResponse({ query: dbQuery }, sessionId, account);
}

export async function endDecisionSession(account: AccountState, sessionId: string) {
  requireEligible(account);
  let stage: DecisionStage | undefined;
  await dbTransaction(async (client) => {
    const session = await readSession(client, sessionId);
    assertCreator(session, account);
    stage = effectiveStage(session);
    await client.query(
      `
        UPDATE decision_sessions
        SET status = 'ended',
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = $1::uuid
          AND status = 'active'
      `,
      [sessionId]
    );
  });
  publishDecisionRoomEvent({
    account,
    sessionId,
    type: "room_ended",
    stage
  });
  return formatSessionResponse({ query: dbQuery }, sessionId, account);
}
