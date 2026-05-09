import { dbQuery } from "../../lib/db";
import { PUBLIC_VENUE_SQL } from "./recommendationTrust";
import { findMarketByIdOrSlug } from "./marketService";

type LandingMetricsRow = {
  approved_public_venues: string;
  approved_future_events: string;
  usable_hours_evidence: string;
  source_evidence: string;
};

export type LandingMetricsResponse = {
  market: {
    id: string;
    short_label: string;
  };
  metrics: {
    approved_public_venues: number;
    approved_future_venue_owned_events: number;
    usable_hours_evidence: number;
    venue_datapoints: number;
  };
  copy: {
    venue_datapoints_label: string;
  };
};

export async function getLandingMetrics(marketIdOrSlug = "san-francisco"): Promise<LandingMetricsResponse> {
  const market = await findMarketByIdOrSlug(marketIdOrSlug);
  const result = await dbQuery<LandingMetricsRow>(
    `
      WITH public_venues AS (
        SELECT v.id
        FROM venues v
        WHERE v.market_id = $1::uuid
          AND v.is_active = true
          AND v.admin_status = 'approved'
          ${PUBLIC_VENUE_SQL}
      ),
      event_counts AS (
        SELECT COUNT(DISTINCT e.id)::text AS approved_future_events
        FROM events e
        JOIN public_venues pv ON pv.id = e.venue_id
        WHERE e.is_approved = true
          AND e.starts_at >= NOW() - INTERVAL '6 hours'
          AND e.source IN ('eventbrite', 'venue_website', 'manual')
      ),
      hours_counts AS (
        SELECT COUNT(DISTINCT vs.venue_id)::text AS usable_hours_evidence
        FROM venue_schedules vs
        JOIN public_venues pv ON pv.id = vs.venue_id
        WHERE vs.status = 'verified_hours'
          AND vs.source <> 'provider:openstreetmap'
          AND (vs.expires_at IS NULL OR vs.expires_at > NOW())
      ),
      evidence_counts AS (
        SELECT COUNT(DISTINCT pr.id)::text AS source_evidence
        FROM provider_records pr
        JOIN public_venues pv ON pv.id = pr.venue_id
        WHERE pr.match_status = 'approved'
      )
      SELECT
        (SELECT COUNT(*)::text FROM public_venues) AS approved_public_venues,
        COALESCE((SELECT approved_future_events FROM event_counts), '0') AS approved_future_events,
        COALESCE((SELECT usable_hours_evidence FROM hours_counts), '0') AS usable_hours_evidence,
        COALESCE((SELECT source_evidence FROM evidence_counts), '0') AS source_evidence
    `,
    [market.id]
  );
  const row = result.rows[0] ?? {
    approved_public_venues: "0",
    approved_future_events: "0",
    usable_hours_evidence: "0",
    source_evidence: "0"
  };
  const approvedPublicVenues = Number(row.approved_public_venues);
  const approvedFutureEvents = Number(row.approved_future_events);
  const usableHoursEvidence = Number(row.usable_hours_evidence);
  const sourceEvidence = Number(row.source_evidence);

  return {
    market: {
      id: market.id,
      short_label: market.short_label
    },
    metrics: {
      approved_public_venues: approvedPublicVenues,
      approved_future_venue_owned_events: approvedFutureEvents,
      usable_hours_evidence: usableHoursEvidence,
      venue_datapoints: approvedPublicVenues + approvedFutureEvents + usableHoursEvidence + sourceEvidence
    },
    copy: {
      venue_datapoints_label: "Venue datapoints"
    }
  };
}
