import { describe, expect, it, vi } from "vitest";
import { formatVenue, type VenueFeedRow } from "../src/services/v1/venueService";

function venueRow(overrides: Partial<VenueFeedRow> = {}): VenueFeedRow {
  return {
    id: "venue-1",
    slug: "test-room",
    name: "Test Room",
    market_id: "market-1",
    market_short_label: "SF",
    market_timezone: "America/Los_Angeles",
    venue_source: "provider:google_places",
    venue_metadata: {},
    neighborhood: "Mission",
    category: "club",
    latitude: 37.76,
    longitude: -122.42,
    pulse_level: 2,
    energy_score: 49,
    energy_label: "Chill",
    trend: "steady",
    wait_minutes: null,
    signal_count: 0,
    recent_signal_count: 0,
    live_signal_count: 0,
    live_unique_user_count: 0,
    confidence: 0.5,
    last_signal_at: null,
    computed_at: null,
    live_state_expires_at: null,
    source_summary: {},
    assets: [],
    current_event: null,
    schedule_status: "verified_hours",
    schedule_source: "provider:google_places",
    schedule_weekly_hours: {
      normalized_periods: [
        {
          day: 2,
          open_hour: 17,
          open_minute: 0,
          close_day: 3,
          close_hour: 2,
          close_minute: 0
        }
      ]
    },
    schedule_confidence: 0.9,
    schedule_verified_at: "2026-05-01T00:00:00.000Z",
    schedule_fetched_at: "2026-05-01T00:00:00.000Z",
    schedule_metadata: {
      is_open_now: false,
      opens_later: true,
      opens_at: "5:00 PM",
      closes_at: "2:00 AM"
    },
    friends_here_count: 0,
    first_friend_name: null,
    venue_quality_score: 0.8,
    ...overrides
  };
}

describe("formatVenue", () => {
  it("uses request-time weekly hours over stale cached opens-later metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T20:45:00-07:00"));
    try {
      const venue = formatVenue(venueRow());
      expect(venue.liveness).toMatchObject({
        state: "unknown",
        source_open_now: true,
        opens_at: "5:00 PM",
        closes_at: "2:00 AM"
      });
      expect(venue.hours.metadata).toMatchObject({
        is_open_now: true,
        opens_later: false,
        closed_today: false
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
