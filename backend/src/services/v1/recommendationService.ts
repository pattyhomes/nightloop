import { ApiError, validationError } from "../../lib/apiError";
import { dbQuery } from "../../lib/db";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";
import { findMarketByIdOrSlug, type MarketRow } from "./marketService";
import { formatVenue, type VenueFeedRow } from "./venueService";
import { buildVenueLiveness, type VenueLiveness } from "./livenessService";
import { evaluateRequestTimeSchedule } from "./providerHours";
import {
  calculateExpectedPulse,
  PUBLIC_VENUE_SQL,
  rerankForDiversity,
  selectPublicPulse,
  type ExpectedPulse,
  type PublicPulse
} from "./recommendationTrust";

type PulseFilter = "chill" | "active" | "packed";

export type RecommendationQuery = {
  account: AccountState;
  marketId: string;
  pulse?: PulseFilter;
  limit?: number;
};

type RecommendationRow = VenueFeedRow & {
  venue_source: string | null;
  venue_metadata: Record<string, unknown>;
  venue_quality_score: number | null;
  source_confidence_score: number | null;
  event_score: number | null;
  hours_confidence_score: number | null;
  baseline_score: number | null;
};

type ScoredRecommendation = {
  row: RecommendationRow;
  score: number;
  reason: string;
  mode: "tonight_preview" | "live_now";
  liveness: VenueLiveness;
  expectedPulse: ExpectedPulse;
  publicPulse: PublicPulse;
  factors: {
    venue_quality: number;
    preference_match: number;
    live_signals: number;
    event_relevance: number;
    source_confidence: number;
    hours_confidence: number;
  };
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function pulseFilterToLevel(pulse?: PulseFilter): number | undefined {
  if (!pulse) return undefined;
  if (pulse === "packed") return 3;
  if (pulse === "active") return 2;
  return 1;
}

function textSet(values?: string[]): Set<string> {
  return new Set((values ?? []).map((value) => value.toLowerCase().trim()).filter(Boolean));
}

function marketHour(market: MarketRow, now = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: market.timezone
    }).format(now);
    return Number(hour);
  } catch {
    return now.getUTCHours();
  }
}

function recommendationMode(market: MarketRow): "tonight_preview" | "live_now" {
  const hour = marketHour(market);
  return hour >= 18 || hour < 3 ? "live_now" : "tonight_preview";
}

function sourceQuality(row: RecommendationRow): number {
  const source = row.venue_source ?? "";
  const metadata = row.venue_metadata ?? {};
  const type = row.category ?? "";
  let score = Number(row.venue_quality_score ?? row.baseline_score ?? 0);

  if (!Number.isFinite(score) || score <= 0) {
    if (source.startsWith("curated:")) score = 0.82;
    else if (source === "provider:google_places") score = 0.64;
    else score = 0.62;
  }

  if (metadata.datasf_poe_record_id || source === "provider:datasf_poe") score += 0.08;
  if (metadata.google_place_id) score += 0.05;
  if (metadata.foursquare_id) score += 0.03;
  if (["club", "lounge", "live_music", "karaoke"].includes(type)) score += 0.04;

  return clamp(score);
}

function sourceConfidence(row: RecommendationRow): number {
  const metadata = row.venue_metadata ?? {};
  let score = Number(row.source_confidence_score ?? 0);
  if (!Number.isFinite(score) || score <= 0) {
    score = 0.45;
  }
  if (metadata.google_place_id) score += 0.16;
  if (metadata.datasf_poe_record_id) score += 0.14;
  if (metadata.foursquare_id) score += 0.08;
  if (row.venue_source?.startsWith("curated:")) score += 0.12;
  return clamp(score);
}

function preferenceMatch(row: RecommendationRow, preferences: Record<string, string[]>): number {
  const neighborhoods = textSet(preferences.neighborhoods);
  const vibe = textSet(preferences.vibe);
  const music = textSet(preferences.music);
  const crowd = textSet(preferences.crowd);
  const category = (row.category ?? "").toLowerCase();
  const neighborhood = (row.neighborhood ?? "").toLowerCase();

  let score = 0.2;
  if (neighborhoods.has(neighborhood.replace(/\s+/g, "-")) || neighborhoods.has(neighborhood)) score += 0.35;
  if (vibe.has(category) || music.has(category) || crowd.has(category)) score += 0.2;
  if (category.includes("club") && (vibe.has("dance") || crowd.has("packed"))) score += 0.15;
  if (category.includes("bar") && (vibe.has("cocktails") || vibe.has("conversation"))) score += 0.12;
  if (category.includes("live") && music.size > 0) score += 0.12;
  return clamp(score);
}

function liveSignalScore(row: RecommendationRow): number {
  const signalCount = Number(row.live_signal_count ?? row.recent_signal_count ?? 0);
  const uniqueUsers = Number(row.live_unique_user_count ?? 0);
  const energy = clamp(Number(row.energy_score ?? 28) / 100);
  const cap = signalCount >= 3 && uniqueUsers >= 2 ? 0.18 : signalCount >= 1 ? 0.06 : 0;
  const deadPenalty = typeof row.source_summary?.dead === "number" ? Number(row.source_summary.dead) * 0.02 : 0;
  return clamp(Math.min(energy, cap) - deadPenalty);
}

function eventScore(row: RecommendationRow): number {
  if (row.current_event) return 1;
  return clamp(Number(row.event_score ?? 0));
}

function eventTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatEventTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function eventScheduleOverride(event: Record<string, unknown> | null, timezone: string): {
  source: string;
  metadata: Record<string, unknown>;
} | null {
  if (!event) return null;
  const startsAt = eventTime(event.starts_at);
  const explicitEnd = eventTime(event.ends_at);
  if (!startsAt) return null;
  const endsAt = explicitEnd ?? new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  const now = new Date();
  if (endsAt < now) return null;
  return {
    source: typeof event.source === "string" ? event.source : "manual",
    metadata: {
      is_open_now: startsAt <= now && endsAt > now,
      opens_later: startsAt > now,
      opens_at: formatEventTime(startsAt, timezone),
      closes_at: formatEventTime(endsAt, timezone),
      event_context: {
        event_id: event.id,
        source: event.source,
        starts_at: event.starts_at,
        ends_at: event.ends_at ?? endsAt.toISOString()
      }
    }
  };
}

function hoursScore(row: RecommendationRow): number {
  if (row.schedule_status === "verified_hours") return clamp(Math.max(Number(row.schedule_confidence ?? 0.75), 0.72));
  if (row.schedule_status === "temporarily_closed") return 0.02;
  if (row.schedule_status === "manual_hold") return 0.08;
  return 0.16;
}

function reasonFor(
  row: RecommendationRow,
  mode: ScoredRecommendation["mode"],
  factors: ScoredRecommendation["factors"],
  liveness: VenueLiveness,
  expectedPulse: ExpectedPulse
): string {
  const area = row.neighborhood ?? "SF";
  if (liveness.state === "live") {
    return `${liveness.live_signal_count} verified reports from ${liveness.live_unique_user_count} people in the last 90 minutes.`;
  }
  if (liveness.state === "closed_today") {
    return "Source-backed hours say it is closed today, so it is not a tonight pick.";
  }
  if (row.current_event) {
    return expectedPulse.copy;
  }
  if (liveness.state === "opens_later" && liveness.opens_at) {
    return `Source-backed ${area} pick that opens later tonight.`;
  }
  if (liveness.hours_state === "unknown") {
    return `Potential ${area} fit, but hours are not verified yet.`;
  }
  if (mode === "tonight_preview") {
    if (factors.preference_match >= 0.55) return `A strong ${area} fit for your tonight picks.`;
    if (factors.source_confidence >= 0.7) return `Source-backed ${area} nightlife for tonight.`;
    return `Likely worth keeping on tonight's radar.`;
  }
  if (Number(row.recent_signal_count ?? 0) > 0) {
    return `${row.recent_signal_count} verified signal${Number(row.recent_signal_count) === 1 ? "" : "s"} tonight.`;
  }
  return `Reliable ${area} option with ${row.energy_label ?? "steady"} baseline energy.`;
}

function scoreRecommendation(
  row: RecommendationRow,
  account: AccountState,
  mode: ScoredRecommendation["mode"]
): ScoredRecommendation {
  const hasPreferences = Object.values(account.preferences).some((values) => values.length > 0);
  const requestTimeSchedule = evaluateRequestTimeSchedule({
    weeklyHours: row.schedule_weekly_hours,
    metadata: row.schedule_metadata,
    timezone: row.market_timezone
  });
  const eventOverride = eventScheduleOverride(row.current_event, row.market_timezone);
  const factors = {
    venue_quality: sourceQuality(row),
    preference_match: preferenceMatch(row, account.preferences),
    live_signals: liveSignalScore(row),
    event_relevance: eventScore(row),
    source_confidence: sourceConfidence(row),
    hours_confidence: hoursScore(row)
  };
  const publicPulse = selectPublicPulse({
    category: row.category,
    eventContext: { has_event_tonight: Boolean(row.current_event) },
    fsqPopularity: Number(row.venue_metadata?.foursquare_popularity ?? row.schedule_metadata?.popularity ?? NaN),
    fsqPrice: Number(row.venue_metadata?.foursquare_price ?? row.schedule_metadata?.price ?? NaN),
    sourceQuality: factors.venue_quality,
    pulseLevel: row.pulse_level,
    energyScore: row.energy_score,
    energyLabel: row.energy_label,
    liveStateComputedAt: row.computed_at,
    liveStateExpiresAt: row.live_state_expires_at
  });
  const liveness = buildVenueLiveness({
    scheduleStatus: eventOverride ? "verified_hours" : row.schedule_status,
    scheduleSource: eventOverride?.source ?? row.schedule_source,
    scheduleConfidence: row.schedule_confidence,
    scheduleVerifiedAt: row.schedule_verified_at,
    scheduleFetchedAt: row.schedule_fetched_at,
    scheduleMetadata: eventOverride ? { ...requestTimeSchedule.metadata, ...eventOverride.metadata } : requestTimeSchedule.metadata,
    pulseLevel: publicPulse.level,
    recentSignalCount: row.recent_signal_count,
    liveSignalCount: row.live_signal_count,
    liveUniqueUserCount: row.live_unique_user_count
  });
  const expectedPulse = calculateExpectedPulse({
    category: row.category,
    eventContext: { has_event_tonight: Boolean(row.current_event) },
    fsqPopularity: Number(row.venue_metadata?.foursquare_popularity ?? row.schedule_metadata?.popularity ?? NaN),
    fsqPrice: Number(row.venue_metadata?.foursquare_price ?? row.schedule_metadata?.price ?? NaN),
    sourceQuality: factors.venue_quality
  });

  const score = hasPreferences
    ? factors.venue_quality * 0.34 +
      factors.source_confidence * 0.20 +
      factors.hours_confidence * 0.20 +
      factors.preference_match * 0.16 +
      factors.live_signals * 0.06 +
      factors.event_relevance * 0.04
    : factors.venue_quality * 0.44 +
      factors.source_confidence * 0.25 +
      factors.hours_confidence * 0.20 +
      factors.live_signals * 0.06 +
      factors.event_relevance * 0.05;

  const adjusted =
    liveness.state === "closed_today"
      ? score * 0.12
      : row.schedule_status === "temporarily_closed"
      ? score * 0.08
      : row.schedule_status === "manual_hold"
        ? score * 0.35
        : row.schedule_status === "unknown" || !row.schedule_status
          ? score * 0.72
          : score;
  return {
    row,
    score: adjusted,
    mode,
    liveness,
    expectedPulse,
    publicPulse,
    factors,
    reason: reasonFor(row, mode, factors, liveness, expectedPulse)
  };
}

export async function listRecommendations(query: RecommendationQuery) {
  requireEligible(query.account);
  if (!query.marketId) {
    throw validationError("market_id is required.", { market_id: "Required" });
  }

  const market = await findMarketByIdOrSlug(query.marketId);
  const limit = Math.max(1, Math.min(60, Math.floor(query.limit ?? 20)));
  const pulseLevel = pulseFilterToLevel(query.pulse);
  const mode = recommendationMode(market);
  const viewerUserId = query.account.user.id;

  if (market.launch_status !== "active" && market.launch_status !== "preview") {
    throw new ApiError(404, "MARKET_NOT_AVAILABLE", "This market is not available yet.");
  }

  const result = await dbQuery<RecommendationRow>(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        m.short_label AS market_short_label,
        m.timezone AS market_timezone,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        v.latitude,
        v.longitude,
        v.source AS venue_source,
        COALESCE(v.metadata, '{}'::jsonb) AS venue_metadata,
        COALESCE(vls.pulse_level, 1) AS pulse_level,
        COALESCE(vls.energy_score, 28) AS energy_score,
        COALESCE(vls.energy_label, 'Chill') AS energy_label,
        COALESCE(vls.trend, 'steady') AS trend,
        vls.wait_minutes,
        COALESCE(vls.signal_count, 0) AS signal_count,
        COALESCE(vls.recent_signal_count, 0) AS recent_signal_count,
        COALESCE(signal_pack.live_signal_count, COALESCE(vls.recent_signal_count, 0)) AS live_signal_count,
        COALESCE(signal_pack.live_unique_user_count, 0) AS live_unique_user_count,
        COALESCE(vls.confidence, 0.25) AS confidence,
        vls.last_signal_at,
        vls.computed_at,
        vls.expires_at AS live_state_expires_at,
        COALESCE(vls.source_summary, '{}'::jsonb) AS source_summary,
        COALESCE(asset_pack.assets, '[]'::jsonb) AS assets,
        event_pack.current_event,
        schedule_pack.status AS schedule_status,
        schedule_pack.source AS schedule_source,
        COALESCE(schedule_pack.weekly_hours, '{}'::jsonb) AS schedule_weekly_hours,
        schedule_pack.confidence AS schedule_confidence,
        schedule_pack.verified_at AS schedule_verified_at,
        schedule_pack.fetched_at AS schedule_fetched_at,
        COALESCE(schedule_pack.metadata, '{}'::jsonb) AS schedule_metadata,
        COALESCE(friend_pack.friends_here_count, 0) AS friends_here_count,
        friend_pack.first_friend_name,
        vri.venue_quality_score,
        vri.source_confidence_score,
        vri.event_score,
        vri.hours_confidence_score,
        vri.baseline_score
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      LEFT JOIN venue_live_states vls ON vls.venue_id = v.id
      LEFT JOIN venue_recommendation_inputs vri ON vri.venue_id = v.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS live_signal_count,
          COUNT(DISTINCT s.user_id)::int AS live_unique_user_count
        FROM signals s
        WHERE s.venue_id = v.id
          AND s.kind IS NOT NULL
          AND s.expires_at > NOW()
      ) signal_pack ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', va.id,
            'asset_type', va.asset_type,
            'url', va.url,
            'alt_text', va.alt_text,
            'credit_text', va.credit_text,
            'credit_url', va.credit_url,
            'license_name', va.license_name,
            'license_url', va.license_url,
            'rights_status', va.rights_status,
            'source', va.source
          )
          ORDER BY va.sort_order ASC, va.created_at ASC
        ) AS assets
        FROM venue_assets va
        WHERE va.venue_id = v.id
          AND va.is_approved = true
      ) asset_pack ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'source', e.source,
          'url', e.url
        ) AS current_event
        FROM events e
        WHERE e.venue_id = v.id
          AND e.is_approved = true
          AND e.starts_at <= NOW() + INTERVAL '18 hours'
          AND COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours') >= NOW() - INTERVAL '6 hours'
        ORDER BY e.starts_at ASC
        LIMIT 1
      ) event_pack ON true
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN vs.source = 'provider:openstreetmap' THEN 'unknown'
            WHEN vs.source IN ('provider:google_places', 'provider:foursquare', 'venue_website') AND vs.expires_at IS NOT NULL AND vs.expires_at <= NOW() THEN 'unknown'
            ELSE vs.status
          END AS status,
          vs.source,
          vs.weekly_hours,
          vs.confidence,
          vs.verified_at,
          vs.fetched_at,
          vs.metadata
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE
            WHEN vs.source = 'manual' AND vs.status = 'verified_hours' THEN 0
            WHEN vs.source = 'venue_website' AND vs.status = 'verified_hours' AND (vs.expires_at IS NULL OR vs.expires_at > NOW()) THEN 1
            WHEN vs.source = 'provider:google_places' AND vs.status = 'verified_hours' AND (vs.expires_at IS NULL OR vs.expires_at > NOW()) THEN 2
            WHEN vs.source = 'provider:foursquare' AND vs.status = 'verified_hours' AND (vs.expires_at IS NULL OR vs.expires_at > NOW()) THEN 3
            WHEN vs.status = 'temporarily_closed' THEN 4
            WHEN vs.status = 'manual_hold' THEN 5
            ELSE 6
          END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) schedule_pack ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT ae.actor_user_id)::int AS friends_here_count,
          MIN(p.display_name) AS first_friend_name
        FROM activity_events ae
        JOIN user_profiles p ON p.user_id = ae.actor_user_id
        JOIN user_settings us ON us.user_id = ae.actor_user_id
        JOIN friendships f
          ON f.status = 'accepted'
         AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($2::uuid::text, ae.actor_user_id::text)
         AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($2::uuid::text, ae.actor_user_id::text)
        WHERE ae.venue_id = v.id
          AND ae.parent_activity_id IS NULL
          AND ae.type IN ('signal', 'coming')
          AND ae.expires_at > NOW()
          AND ae.actor_user_id <> $2::uuid
          AND COALESCE(us.ghost_mode, false) = false
          AND NOT EXISTS (
            SELECT 1
            FROM blocked_users b
            WHERE (b.blocker_user_id = $2::uuid AND b.blocked_user_id = ae.actor_user_id)
               OR (b.blocker_user_id = ae.actor_user_id AND b.blocked_user_id = $2::uuid)
          )
      ) friend_pack ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
      LIMIT 300
    `,
    [market.id, viewerUserId]
  );

  const allScored = result.rows
    .map((row) => scoreRecommendation(row, query.account, mode));
  const pulseFiltered = pulseLevel
    ? allScored.filter((item) => item.publicPulse.level === pulseLevel)
    : allScored;
  const scored = rerankForDiversity(
    pulseFiltered
      .sort((left, right) => right.score - left.score)
      .map((item) => ({
        ...item,
        id: item.row.id,
        neighborhood: item.row.neighborhood,
        category: item.row.category
      })),
    {
      neighborhoodSoftCap: 5,
      categorySoftCap: 12,
      window: 20
    }
  )
    .slice(0, limit);

  const counts = { all: 0, packed: 0, active: 0, chill: 0, friends: 0 };
  for (const item of allScored) {
    counts.all += 1;
    if (Number(item.row.friends_here_count ?? 0) > 0) counts.friends += 1;
    if (item.publicPulse.level >= 3) counts.packed += 1;
    else if (item.publicPulse.level >= 2) counts.active += 1;
    else counts.chill += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    mode,
    market: {
      id: market.id,
      short_label: market.short_label
    },
    items: scored.map((item, index) => ({
      rank: index + 1,
      score: Math.round(item.score * 1000) / 10,
      mode: item.mode,
      reason: item.reason,
      confidence: item.liveness.confidence,
      liveness: item.liveness,
      expected_pulse_basis: item.expectedPulse.basis,
      venue: formatVenue(item.row),
      factors: {
        venue_quality: Math.round(item.factors.venue_quality * 100),
        preference_match: Math.round(item.factors.preference_match * 100),
        live_signals: Math.round(item.factors.live_signals * 100),
        event_relevance: Math.round(item.factors.event_relevance * 100),
        source_confidence: Math.round(item.factors.source_confidence * 100),
        hours_confidence: Math.round(item.factors.hours_confidence * 100)
      }
    })),
    counts,
    next_cursor: null
  };
}
