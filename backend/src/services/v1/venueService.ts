import { dbQuery } from "../../lib/db";
import { notFoundError, validationError } from "../../lib/apiError";
import { findMarketByIdOrSlug } from "./marketService";
import { buildVenueLiveness } from "./livenessService";

type PulseLabel = "Chill" | "Active" | "Packed";

export type VenueFeedRow = {
  id: string;
  slug: string | null;
  name: string;
  market_id: string;
  market_short_label: string;
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
};

export type VenueQuery = {
  marketId: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  pulse?: "chill" | "active" | "packed";
  q?: string;
  limit?: number;
};

function toPulseLabel(level: number): PulseLabel {
  if (level >= 3) return "Packed";
  if (level >= 2) return "Active";
  return "Chill";
}

function confidenceLabel(value: number | null): "low" | "medium" | "high" {
  const normalized = value ?? 0.25;
  if (normalized >= 0.7) return "high";
  if (normalized >= 0.4) return "medium";
  return "low";
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
  const level = Math.max(1, Math.min(3, Number(row.pulse_level ?? 1)));
  const energyScore = Math.max(0, Math.min(100, Math.round(Number(row.energy_score ?? 28))));
  const label = row.energy_label ?? toPulseLabel(level);
  const liveness = buildVenueLiveness({
    scheduleStatus: row.schedule_status,
    scheduleSource: row.schedule_source,
    scheduleConfidence: row.schedule_confidence,
    scheduleVerifiedAt: row.schedule_verified_at,
    scheduleFetchedAt: row.schedule_fetched_at,
    scheduleMetadata: row.schedule_metadata,
    pulseLevel: row.pulse_level,
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
      level,
      label,
      score: energyScore
    },
    trend: row.trend ?? "steady",
    wait_minutes: row.wait_minutes == null ? null : Number(row.wait_minutes),
    signal_count: Number(row.signal_count ?? 0),
    recent_signal_count: Number(row.recent_signal_count ?? 0),
    confidence: confidenceLabel(row.confidence),
    liveness,
    event: row.current_event,
    hours: {
      status: row.schedule_status ?? "unknown",
      source: row.schedule_source ?? "unknown",
      hours_state: liveness.hours_state,
      confidence: confidenceLabel(row.schedule_confidence),
      verified_at: row.schedule_verified_at,
      fetched_at: row.schedule_fetched_at,
      opens_at: liveness.opens_at,
      closes_at: liveness.closes_at,
      label:
        row.schedule_status === "verified_hours"
          ? "Hours verified"
          : row.schedule_status === "temporarily_closed"
            ? "Temporarily closed"
            : row.schedule_status === "manual_hold"
              ? "Hours under review"
              : "Hours unknown",
      claims_open_now: liveness.state === "live",
      weekly_hours: row.schedule_weekly_hours ?? {},
      metadata: row.schedule_metadata ?? {}
    },
    friend_summary: {
      friends_here_count: 0,
      first_friend_name: null
    },
    image,
    assets,
    why_short: `${label} energy in ${row.neighborhood ?? "this area"}.`,
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

  const rows = await dbQuery<VenueFeedRow>(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        m.short_label AS market_short_label,
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
        COALESCE(vls.source_summary, '{}'::jsonb) AS source_summary,
        COALESCE(asset_pack.assets, '[]'::jsonb) AS assets,
        event_pack.current_event,
        schedule_pack.status AS schedule_status,
        schedule_pack.source AS schedule_source,
        COALESCE(schedule_pack.weekly_hours, '{}'::jsonb) AS schedule_weekly_hours,
        schedule_pack.confidence AS schedule_confidence,
        schedule_pack.verified_at AS schedule_verified_at,
        schedule_pack.fetched_at AS schedule_fetched_at,
        COALESCE(schedule_pack.metadata, '{}'::jsonb) AS schedule_metadata
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      LEFT JOIN venue_live_states vls ON vls.venue_id = v.id
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
          AND e.starts_at >= NOW() - INTERVAL '6 hours'
        ORDER BY e.starts_at ASC
        LIMIT 1
      ) event_pack ON true
      LEFT JOIN LATERAL (
        SELECT
          vs.status,
          vs.source,
          vs.weekly_hours,
          vs.confidence,
          vs.verified_at,
          vs.fetched_at,
          vs.metadata
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) schedule_pack ON true
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
        AND ($2::int IS NULL OR COALESCE(vls.pulse_level, 1) = $2::int)
        AND (
          $3::text IS NULL
          OR v.name ILIKE '%' || $3 || '%'
          OR COALESCE(v.metadata->>'neighborhood', '') ILIKE '%' || $3 || '%'
        )
      ORDER BY COALESCE(vls.energy_score, 28) DESC, v.name ASC
      LIMIT $4
    `,
    [market.id, pulseLevel ?? null, query.q ?? null, limit]
  );

  const countRows = await dbQuery<{ pulse_level: number; count: string }>(
    `
      SELECT COALESCE(vls.pulse_level, 1) AS pulse_level, COUNT(*)::text AS count
      FROM venues v
      LEFT JOIN venue_live_states vls ON vls.venue_id = v.id
      WHERE v.market_id = $1::uuid
        AND v.is_active = true
        AND v.admin_status = 'approved'
      GROUP BY COALESCE(vls.pulse_level, 1)
    `,
    [market.id]
  );

  const counts = { all: 0, packed: 0, active: 0, chill: 0, friends: 0 };
  for (const row of countRows.rows) {
    const count = Number(row.count);
    counts.all += count;
    if (Number(row.pulse_level) >= 3) counts.packed += count;
    else if (Number(row.pulse_level) >= 2) counts.active += count;
    else counts.chill += count;
  }

  return {
    generated_at: new Date().toISOString(),
    market: {
      id: market.id,
      short_label: market.short_label
    },
    items: rows.rows.map((row) => formatVenue(row, origin)),
    counts,
    next_cursor: null
  };
}

export async function getVenue(idOrSlug: string) {
  const result = await dbQuery<VenueFeedRow>(
    `
      SELECT
        v.id,
        v.slug,
        v.name,
        v.market_id,
        m.short_label AS market_short_label,
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
        COALESCE(vls.source_summary, '{}'::jsonb) AS source_summary,
        COALESCE(asset_pack.assets, '[]'::jsonb) AS assets,
        event_pack.current_event,
        schedule_pack.status AS schedule_status,
        schedule_pack.source AS schedule_source,
        COALESCE(schedule_pack.weekly_hours, '{}'::jsonb) AS schedule_weekly_hours,
        schedule_pack.confidence AS schedule_confidence,
        schedule_pack.verified_at AS schedule_verified_at,
        schedule_pack.fetched_at AS schedule_fetched_at,
        COALESCE(schedule_pack.metadata, '{}'::jsonb) AS schedule_metadata
      FROM venues v
      JOIN markets m ON m.id = v.market_id
      LEFT JOIN venue_live_states vls ON vls.venue_id = v.id
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
          AND e.starts_at >= NOW() - INTERVAL '6 hours'
        ORDER BY e.starts_at ASC
        LIMIT 1
      ) event_pack ON true
      LEFT JOIN LATERAL (
        SELECT
          vs.status,
          vs.source,
          vs.weekly_hours,
          vs.confidence,
          vs.verified_at,
          vs.fetched_at,
          vs.metadata
        FROM venue_schedules vs
        WHERE vs.venue_id = v.id
        ORDER BY
          CASE vs.status WHEN 'verified_hours' THEN 0 WHEN 'temporarily_closed' THEN 1 WHEN 'manual_hold' THEN 2 ELSE 3 END,
          COALESCE(vs.verified_at, vs.fetched_at, vs.updated_at) DESC
        LIMIT 1
      ) schedule_pack ON true
      WHERE v.id::text = $1 OR v.slug = $1
      LIMIT 1
    `,
    [idOrSlug]
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
