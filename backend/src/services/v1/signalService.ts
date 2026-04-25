import { randomUUID } from "crypto";
import type { AccountState } from "./accountService";
import { requireEligible } from "./accountService";
import { dbQuery, dbTransaction } from "../../lib/db";
import { notFoundError } from "../../lib/apiError";

export type UserSignalKind = "packed" | "short_line" | "long_line" | "dead" | "event_live";

type SignalKindConfig = {
  points: number;
  signalType: "crowd_report" | "line_report" | "event_report";
  signalValue: number;
  liveDelta: number;
  waitMinutes: number | null;
};

const SIGNAL_CONFIG: Record<UserSignalKind, SignalKindConfig> = {
  packed: {
    points: 3,
    signalType: "crowd_report",
    signalValue: 90,
    liveDelta: 24,
    waitMinutes: null
  },
  short_line: {
    points: 2,
    signalType: "line_report",
    signalValue: 25,
    liveDelta: 5,
    waitMinutes: 5
  },
  long_line: {
    points: 2,
    signalType: "line_report",
    signalValue: 75,
    liveDelta: 10,
    waitMinutes: 25
  },
  dead: {
    points: 1,
    signalType: "crowd_report",
    signalValue: 0,
    liveDelta: -24,
    waitMinutes: null
  },
  event_live: {
    points: 4,
    signalType: "event_report",
    signalValue: 95,
    liveDelta: 20,
    waitMinutes: null
  }
};

type VenueRow = {
  id: string;
  market_id: string;
};

type RecentSignalRow = {
  kind: UserSignalKind;
  trust_weight: number;
  observed_at: string;
};

type UserRecentSignalRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_neighborhood: string;
  kind: UserSignalKind;
  points_awarded: number;
  observed_at: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function labelForScore(score: number): "Chill" | "Active" | "Packed" {
  if (score >= 70) return "Packed";
  if (score >= 40) return "Active";
  return "Chill";
}

function levelForScore(score: number): 1 | 2 | 3 {
  if (score >= 70) return 3;
  if (score >= 40) return 2;
  return 1;
}

async function getVenueForSignal(venueId: string): Promise<VenueRow> {
  const result = await dbQuery<VenueRow>(
    `
      SELECT id, market_id
      FROM venues
      WHERE id = $1::uuid
        AND is_active = true
        AND admin_status = 'approved'
      LIMIT 1
    `,
    [venueId]
  );

  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Venue was not found.");
  }

  return row;
}

async function recomputeVenueLiveState(venue: VenueRow): Promise<void> {
  const recent = await dbQuery<RecentSignalRow>(
    `
      SELECT kind, trust_weight, observed_at
      FROM signals
      WHERE venue_id = $1::uuid
        AND kind IS NOT NULL
        AND expires_at > NOW()
      ORDER BY observed_at DESC
      LIMIT 200
    `,
    [venue.id]
  );

  let score = 30;
  let waitMinutes: number | null = null;
  const summary: Record<string, number> = {};

  for (const signal of recent.rows) {
    const config = SIGNAL_CONFIG[signal.kind];
    if (!config) continue;
    const ageMinutes = Math.max(0, (Date.now() - Date.parse(signal.observed_at)) / 60_000);
    const freshness = Math.pow(0.5, ageMinutes / 90);
    score += config.liveDelta * Number(signal.trust_weight ?? 1) * freshness;
    summary[signal.kind] = (summary[signal.kind] ?? 0) + 1;

    if (waitMinutes == null && config.waitMinutes != null) {
      waitMinutes = config.waitMinutes;
    }
  }

  const energyScore = Math.round(clamp(score, 0, 100));
  const label = labelForScore(energyScore);
  const level = levelForScore(energyScore);
  const recentSignalCount = recent.rows.length;

  await dbQuery(
    `
      INSERT INTO venue_live_states (
        venue_id,
        market_id,
        pulse_level,
        energy_score,
        energy_label,
        trend,
        wait_minutes,
        signal_count,
        recent_signal_count,
        confidence,
        last_signal_at,
        expires_at,
        computed_at,
        source_summary
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        'steady',
        $6,
        $7,
        $7,
        $8,
        (SELECT MAX(observed_at) FROM signals WHERE venue_id = $1::uuid),
        NOW() + INTERVAL '90 minutes',
        NOW(),
        $9::jsonb
      )
      ON CONFLICT (venue_id) DO UPDATE SET
        market_id = EXCLUDED.market_id,
        pulse_level = EXCLUDED.pulse_level,
        energy_score = EXCLUDED.energy_score,
        energy_label = EXCLUDED.energy_label,
        trend = EXCLUDED.trend,
        wait_minutes = EXCLUDED.wait_minutes,
        signal_count = EXCLUDED.signal_count,
        recent_signal_count = EXCLUDED.recent_signal_count,
        confidence = EXCLUDED.confidence,
        last_signal_at = EXCLUDED.last_signal_at,
        expires_at = EXCLUDED.expires_at,
        computed_at = EXCLUDED.computed_at,
        source_summary = EXCLUDED.source_summary,
        updated_at = NOW()
    `,
    [
      venue.id,
      venue.market_id,
      level,
      energyScore,
      label,
      waitMinutes,
      recentSignalCount,
      clamp(0.3 + recentSignalCount / 10, 0.3, 0.95),
      JSON.stringify({ user_signals: summary })
    ]
  );
}

export async function submitUserSignal(input: {
  account: AccountState;
  venueId: string;
  kind: UserSignalKind;
  observedAt?: string;
  metadata?: Record<string, unknown>;
}) {
  requireEligible(input.account);

  const config = SIGNAL_CONFIG[input.kind];
  const venue = await getVenueForSignal(input.venueId);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const payload = {
    ...(input.metadata ?? {}),
    kind: input.kind,
    source: "ios"
  };

  const result = await dbTransaction(async (client) => {
    const inserted = await client.query<{
      id: string;
      venue_id: string;
      points_awarded: number;
    }>(
      `
        INSERT INTO signals (
          venue_id,
          user_id,
          kind,
          points_awarded,
          trust_weight,
          expires_at,
          signal_type,
          signal_value,
          confidence,
          observed_at,
          source,
          payload
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          1,
          $5::timestamptz + INTERVAL '90 minutes',
          $6,
          $7,
          0.7,
          $5::timestamptz,
          'user',
          $8::jsonb
        )
        RETURNING id, venue_id, points_awarded
      `,
      [
        input.venueId,
        input.account.user.id,
        input.kind,
        config.points,
        observedAt,
        config.signalType,
        config.signalValue,
        JSON.stringify(payload)
      ]
    );

    const points = await client.query<{ signal_scout_points: number }>(
      `
        UPDATE users
        SET signal_scout_points = signal_scout_points + $2,
            updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING signal_scout_points
      `,
      [input.account.user.id, config.points]
    );

    const signal = inserted.rows[0];
    const user = points.rows[0];
    if (!signal || !user) {
      throw new Error("Failed to submit signal.");
    }

    return {
      signalId: signal.id,
      venueId: signal.venue_id,
      pointsAwarded: Number(signal.points_awarded),
      newSignalScoutPoints: Number(user.signal_scout_points)
    };
  });

  await recomputeVenueLiveState(venue);

  await dbQuery(
    `
      INSERT INTO recommendation_snapshots (
        snapshot_id,
        venue_id,
        score,
        rationale,
        factors,
        recommendation_data,
        generated_at,
        expires_at
      )
      SELECT
        $1::uuid,
        venue_id,
        energy_score::numeric / 100,
        'Venue live state updated from user signal.',
        $2::jsonb,
        source_summary,
        computed_at,
        expires_at
      FROM venue_live_states
      WHERE venue_id = $3::uuid
    `,
    [
      randomUUID(),
      JSON.stringify([{ factor: "user_signal", value: config.signalValue, kind: input.kind }]),
      input.venueId
    ]
  );

  return result;
}

export async function listUserRecentSignals(input: { account: AccountState; limit?: number }) {
  const limit = clamp(Math.trunc(input.limit ?? 5), 1, 20);
  const result = await dbQuery<UserRecentSignalRow>(
    `
      SELECT
        s.id,
        s.venue_id,
        v.name AS venue_name,
        COALESCE(v.metadata->>'neighborhood', v.metadata->>'district') AS venue_neighborhood,
        s.kind,
        s.points_awarded,
        s.observed_at
      FROM signals s
      JOIN venues v ON v.id = s.venue_id
      WHERE s.user_id = $1::uuid
        AND s.kind IS NOT NULL
      ORDER BY s.observed_at DESC, s.created_at DESC
      LIMIT $2
    `,
    [input.account.user.id, limit]
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      venue_id: row.venue_id,
      venue_name: row.venue_name,
      venue_neighborhood: row.venue_neighborhood,
      kind: row.kind,
      points_awarded: Number(row.points_awarded),
      observed_at: row.observed_at
    }))
  };
}
