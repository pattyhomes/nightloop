import { describe, expect, it } from "vitest";
import { buildVenueLiveness } from "../src/services/v1/livenessService";

describe("buildVenueLiveness", () => {
  it("keeps unknown hours from becoming open, closed, or live claims", () => {
    const liveness = buildVenueLiveness({
      scheduleStatus: "unknown",
      pulseLevel: 3,
      liveSignalCount: 12,
      liveUniqueUserCount: 8
    });

    expect(liveness).toMatchObject({
      state: "unknown",
      hours_state: "unknown",
      confidence: "low",
      live_signal_count: 12,
      live_unique_user_count: 8
    });
  });

  it("requires source-verified open hours plus signal density for live", () => {
    const oneUser = buildVenueLiveness({
      scheduleStatus: "verified_hours",
      scheduleSource: "provider:google_places",
      scheduleConfidence: 0.9,
      scheduleMetadata: { is_open_now: true, closes_at: "2:00 AM" },
      liveSignalCount: 3,
      liveUniqueUserCount: 1
    });
    expect(oneUser.state).toBe("unknown");

    const enoughDensity = buildVenueLiveness({
      scheduleStatus: "verified_hours",
      scheduleSource: "provider:google_places",
      scheduleConfidence: 0.9,
      scheduleMetadata: { is_open_now: true, closes_at: "2:00 AM" },
      liveSignalCount: 3,
      liveUniqueUserCount: 2
    });
    expect(enoughDensity).toMatchObject({
      state: "live",
      hours_state: "source_verified",
      confidence: "high",
      closes_at: "2:00 AM"
    });
  });

  it("separates opens-later and closed-today states from live claims", () => {
    expect(
      buildVenueLiveness({
        scheduleStatus: "verified_hours",
        scheduleSource: "provider:google_places",
        scheduleMetadata: { opens_later: true, opens_at: "10:00 PM" }
      })
    ).toMatchObject({
      state: "opens_later",
      opens_at: "10:00 PM"
    });

    expect(
      buildVenueLiveness({
        scheduleStatus: "verified_hours",
        scheduleSource: "provider:google_places",
        scheduleMetadata: { closed_today: true }
      })
    ).toMatchObject({
      state: "closed_today",
      hours_state: "source_verified"
    });
  });

  it("does not let OSM-only hours drive public liveness before UI attribution exists", () => {
    const liveness = buildVenueLiveness({
      scheduleStatus: "verified_hours",
      scheduleSource: "provider:openstreetmap",
      scheduleConfidence: 0.58,
      scheduleMetadata: {
        internal_only_until_ui_attribution: true,
        is_open_now: true,
        closes_at: "4:00 AM"
      },
      liveSignalCount: 4,
      liveUniqueUserCount: 3
    });

    expect(liveness).toMatchObject({
      state: "unknown",
      hours_state: "unknown",
      confidence: "low",
      closes_at: null
    });
    expect(liveness.copy.provenance).toBe("Hours not verified yet");
  });
});
