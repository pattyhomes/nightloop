import { dbQuery } from "../../lib/db";
import { notFoundError, validationError } from "../../lib/apiError";
import type { AccountState } from "./accountService";
import { findMarketByIdOrSlug } from "./marketService";
import { buildVenueLiveness } from "./livenessService";
import { PUBLIC_VENUE_SQL, selectPublicPulse } from "./recommendationTrust";
import { evaluateRequestTimeSchedule } from "./providerHours";

export type VenueFeedRow = {
  id: string;
  slug: string | null;
  name: string;
  market_id: string;
  market_short_label: string;
  market_timezone: string;
  venue_source?: string | null;
  venue_metadata?: Record<string, unknown> | null;
  neighborhood: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  pulse_level: number | null;
  energy_score: number | null;
  energy_label: string | null;
  trend: string | null;
  wait_minutes: number | null;
  signal_count: number | null;
  recent_signal_count: number | null;
  live_signal_count?: number | null;
  live_unique_user_count?: number | null;
  confidence: number | null;
  last_signal_at: string | null;
  computed_at: string | null;
  live_state_expires_at?: string | null;
  source_summary: Record<string, unknown> | null;
  assets: Array<Record<string, unknown>> | null;
  current_event: Record<string, unknown> | null;
  schedule_status: string | null;
  schedule_source: string | null;
  schedule_weekly_hours: Record<string, unknown> | null;
  schedule_confidence: number | null;
  schedule_verified_at: string | null;
  schedule_fetched_at: string | null;
  schedule_metadata: Record<string, unknown> | null;
  friends_here_count?: number | null;
  first_friend_name?: string | null;
  venue_quality_score?: number | string | null;
};

export type VenueQuery = {
  account?: AccountState;
  marketId: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  pulse?: "chill" | "active" | "packed";
  q?: string;
  limit?: number;
};

function confidenceLabel(value: number | null): "low" | "medium" | "high" {
  const normalized = value ?? 0.25;
  if (normalized >= 0.7) return "high";
  if (normalized >= 0.4) return "medium";
  return "low";
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
  const isOpenNow = startsAt <= now && endsAt > now;
  return {
    source: typeof event.source === "string" ? event.source : "manual",
    metadata: {
      is_open_now: isOpenNow,
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

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatVenue(row: VenueFeedRow, origin?: { lat: number; lng: number }) {
  const requestTimeSchedule = evaluateRequestTimeSchedule({
    weeklyHours: row.schedule_weekly_hours,
    metadata: row.schedule_metadata,
    timezone: row.market_timezone
  });
  const eventOverride = eventScheduleOverride(row.current_event, row.market_timezone);
  const publicPulse = selectPublicPulse({
    category: row.category,
    eventContext: { has_event_tonight: Boolean(row.current_event) },
    fsqPopularity: Number(row.venue_metadata?.foursquare_popularity ?? row.schedule_metadata?.popularity ?? NaN),
    fsqPrice: Number(row.venue_metadata?.foursquare_price ?? row.schedule_metadata?.price ?? NaN),
    sourceQuality: Number(row.venue_quality_score ?? 0.55),
    pulseLevel: row.pulse_level,
    energyScore: row.energy_score,
    energyLabel: row.energy_label,
    liveStateComputedAt: row.computed_at,
    liveStateExpiresAt: row.live_state_expires_at
  });
  const effectiveScheduleStatus = eventOverride ? "verified_hours" : row.schedule_status;
  const effectiveScheduleSource = eventOverride?.source ?? row.schedule_source;
  const effectiveScheduleMetadata = eventOverride
    ? { ...requestTimeSchedule.metadata, ...eventOverride.metadata }
    : requestTimeSchedule.metadata;
  const liveness = buildVenueLiveness({
    scheduleStatus: effectiveScheduleStatus,
    scheduleSource: effectiveScheduleSource,
    scheduleConfidence: row.schedule_confidence,
    scheduleVerifiedAt: row.schedule_verified_at,
    scheduleFetchedAt: row.schedule_fetched_at,
    scheduleMetadata: effectiveScheduleMetadata,
    pulseLevel: publicPulse.level,
    recentSignalCount: row.recent_signal_count,
    liveSignalCount: row.live_signal_count,
    liveUniqueUserCount: row.live_unique_user_count
  });
  const distanceMiles = origin
    ? Math.round(haversineMiles(origin.lat, origin.lng, Number(row.latitude), Number(row.longitude)) * 10) / 10
    : null;

  const assets = row.assets ?? [];
  const image = assets.find((asset) => asset.asset_type === "image") ?? null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    market_id: row.market_id,
    neighborhood: row.neighborhood ?? "Unknown",
    category: row.category ?? "bar",
    coordinate: {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude)
    },
    distance_miles: distanceMiles,
    pulse: {
      level: publicPulse.level,
      label: publicPulse.label,
      score: publicPulse.score,
      source: publicPulse.source,
      is_expected: publicPulse.is_expected,
      copy: publicPulse.copy,
      basis: publicPulse.basis
    },
    trend: row.trend ?? "steady",
    wait_minutes: row.wait_minutes == null ? null : Number(row.wait_minutes),
    signal_count: Number(row.signal_count ?? 0),
    recent_signal_count: Number(row.recent_signal_count ?? 0),
    confidence: confidenceLabel(row.confidence),
    liveness,
    event: row.current_event,
    hours: {
      status: effectiveScheduleStatus ?? "unknown",
      source: effectiveScheduleSource ?? "unknown",
      hours_state: liveness.hours_state,
      confidence: confidenceLabel(row.schedule_confidence),
      verified_at: row.schedule_verified_at,
      fetched_at: row.schedule_fetched_at,
      opens_at: liveness.opens_at,
      closes_at: liveness.closes_at,
      label:
        effectiveScheduleStatus === "verified_hours"
          ? "Hours verified"
          : effectiveScheduleStatus === "temporarily_closed"
            ? "Temporarily closed"
            : effectiveScheduleStatus === "manual_hold"
              ? "Hours under review"
              : "Hours unknown",
      claims_open_now: liveness.state === "live",
      weekly_hours: row.schedule_weekly_hours ?? {},
      metadata: effectiveScheduleMetadata ?? {}
    },
    friend_summary: {
      friends_here_count: Number(row.friends_here_count ?? 0),
      first_friend_name: row.first_friend_name ?? null
    },
    image,
    assets,
    why_short: `${publicPulse.label} energy in ${row.neighborhood ?? "this area"}.`,
    last_signal_at: row.last_signal_at,
    computed_at: row.computed_at,
    source_summary: row.source_summary ?? {}
  };
}

function pulseFilterToLevel(pulse?: VenueQuery["pulse"]): number | undefined {
  if (!pulse) return undefined;
  if (pulse === "packed") return 3;
  if (pulse === "active") return 2;
  return 1;
}

export async function listVenues(query: VenueQuery) {
  if (!query.marketId) {
    throw validationError("market_id is required.", { market_id: "Required" });
  }

  const market = await findMarketByIdOrSlug(query.marketId);
  const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 30)));
  const pulseLevel = pulseFilterToLevel(query.pulse);
  const origin =
    query.lat == null || query.lng == null ? undefined : { lat: query.lat, lng: query.lng };
  const viewerUserId = query.account?.user.id ?? null;

  const rows = await dbQuery<VenueFeedRow>(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        m.short_label AS market_short_label,
        m.timezone AS market_timezone,
        v.source AS venue_source,
        COALESCE(v.metadata, '{}'::jsonb) AS venue_metadata,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        v.latitude,
        v.longitude,
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
        vri.venue_quality_score
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
         AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($3::uuid::text, ae.actor_user_id::text)
         AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($3::uuid::text, ae.actor_user_id::text)
        WHERE $3::uuid IS NOT NULL
          AND ae.venue_id = v.id
          AND ae.parent_activity_id IS NULL
          AND ae.type IN ('signal', 'coming')
          AND ae.expires_at > NOW()
          AND ae.actor_user_id <> $3::uuid
          AND COALESCE(us.ghost_mode, false) = false
          AND NOT EXISTS (
            SELECT 1
            FROM blocked_users b
            WHERE (b.blocker_user_id = $3::uuid AND b.blocked_user_id = ae.actor_user_id)
               OR (b.blocker_user_id = ae.actor_user_id AND b.blocked_user_id = $3::uuid)
          )
      ) friend_pack ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
        AND (
          $2::text IS NULL
          OR v.name ILIKE '%' || $2 || '%'
          OR COALESCE(v.metadata->>'neighborhood', '') ILIKE '%' || $2 || '%'
        )
      ORDER BY COALESCE(vls.energy_score, 28) DESC, v.name ASC
      LIMIT 300
    `,
    [market.id, query.q ?? null, viewerUserId]
  );

  const allItems = rows.rows
    .map((row) => formatVenue(row, origin))
    .sort((left, right) => {
      if (left.pulse.score === right.pulse.score) {
        return left.name.localeCompare(right.name);
      }
      return right.pulse.score - left.pulse.score;
    });
  const counts = { all: 0, packed: 0, active: 0, chill: 0, friends: 0 };
  for (const item of allItems) {
    counts.all += 1;
    if (item.pulse.level >= 3) counts.packed += 1;
    else if (item.pulse.level >= 2) counts.active += 1;
    else counts.chill += 1;
  }
  if (viewerUserId) {
    const friendCount = await dbQuery<{ count: string }>(
      `
        SELECT COUNT(DISTINCT ae.venue_id)::text AS count
        FROM activity_events ae
        JOIN venues v ON v.id = ae.venue_id
        JOIN user_settings us ON us.user_id = ae.actor_user_id
        JOIN friendships f
          ON f.status = 'accepted'
         AND LEAST(f.requester_user_id::text, f.addressee_user_id::text) = LEAST($1::uuid::text, ae.actor_user_id::text)
         AND GREATEST(f.requester_user_id::text, f.addressee_user_id::text) = GREATEST($1::uuid::text, ae.actor_user_id::text)
        WHERE v.market_id = $2::uuid
          AND v.is_active = true
          AND v.admin_status = 'approved'
          ${PUBLIC_VENUE_SQL}
          AND ae.parent_activity_id IS NULL
          AND ae.type IN ('signal', 'coming')
          AND ae.expires_at > NOW()
          AND ae.actor_user_id <> $1::uuid
          AND COALESCE(us.ghost_mode, false) = false
          AND NOT EXISTS (
            SELECT 1
            FROM blocked_users b
            WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = ae.actor_user_id)
               OR (b.blocker_user_id = ae.actor_user_id AND b.blocked_user_id = $1::uuid)
          )
      `,
      [viewerUserId, market.id]
    );
    counts.friends = Number(friendCount.rows[0]?.count ?? 0);
  }

  const filteredItems = pulseLevel ? allItems.filter((item) => item.pulse.level === pulseLevel) : allItems;

  return {
    generated_at: new Date().toISOString(),
    market: {
      id: market.id,
      short_label: market.short_label
    },
    items: filteredItems.slice(0, limit),
    counts,
    next_cursor: null
  };
}

export async function getVenue(idOrSlug: string, account?: AccountState) {
  const viewerUserId = account?.user.id ?? null;
  const result = await dbQuery<VenueFeedRow>(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        m.short_label AS market_short_label,
        m.timezone AS market_timezone,
        v.source AS venue_source,
        COALESCE(v.metadata, '{}'::jsonb) AS venue_metadata,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS neighborhood,
        COALESCE(v.canonical_type, v.metadata->>'category') AS category,
        v.latitude,
        v.longitude,
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
        vri.venue_quality_score
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
        WHERE $2::uuid IS NOT NULL
          AND ae.venue_id = v.id
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
      WHERE (v.id::text = $1 OR v.slug = $1)
        AND v.is_active = true
        AND v.admin_status = 'approved'
        ${PUBLIC_VENUE_SQL}
      LIMIT 1
    `,
    [idOrSlug, viewerUserId]
  );

  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Venue was not found.");
  }

  const trendBuckets = await dbQuery(
    `
      SELECT bucket_start, energy_score, pulse_level, signal_count
      FROM venue_trend_buckets
      WHERE venue_id = $1::uuid
      ORDER BY bucket_start DESC
      LIMIT 24
    `,
    [row.id]
  );

  return {
    venue: formatVenue(row),
    trend_buckets: trendBuckets.rows
  };
}
