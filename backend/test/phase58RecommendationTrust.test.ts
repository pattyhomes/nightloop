import { describe, expect, it } from "vitest";
import {
  calculateExpectedPulse,
  isPublicVenueSource,
  rerankForDiversity,
  selectPublicPulse
} from "../src/services/v1/recommendationTrust";

describe("Phase 5.8 recommendation trust helpers", () => {
  it("filters fixture/test venues from public surfaces", () => {
    expect(isPublicVenueSource({ source: "phase2-test", metadata: {} })).toBe(false);
    expect(isPublicVenueSource({ source: "provider:google_places", metadata: { fixture: true } })).toBe(false);
    expect(isPublicVenueSource({ source: "curated:sf_notable", metadata: { neighborhood: "SoMa" } })).toBe(true);
  });

  it("calculates expected pulse from deterministic factors without historical claims", () => {
    const pulse = calculateExpectedPulse({
      now: new Date("2026-04-25T23:30:00-07:00"),
      category: "club",
      eventContext: { has_event_tonight: true },
      fsqPopularity: 0.82,
      fsqPrice: 3,
      sourceQuality: 0.9
    });

    expect(pulse.level).toBe(3);
    expect(pulse.copy).toContain("Expected tonight");
    expect(pulse.copy).toContain("event");
    expect(pulse.copy).not.toMatch(/usually|historical|last \d/i);
    expect(pulse.basis).toEqual(
      expect.arrayContaining(["time_curve:saturday_late", "archetype:club", "event:tonight", "foursquare:popularity"])
    );
  });

  it("uses expected pulse instead of treating missing or expired live state as real chill evidence", () => {
    const missing = selectPublicPulse({
      now: new Date("2026-04-25T23:30:00-07:00"),
      category: "club",
      sourceQuality: 0.9,
      eventContext: { has_event_tonight: true },
      pulseLevel: null,
      energyScore: null,
      energyLabel: null,
      liveStateExpiresAt: null,
      liveStateComputedAt: null
    });

    expect(missing.is_expected).toBe(true);
    expect(missing.source).toBe("expected");
    expect(missing.label).toBe("Expected packed");
    expect(missing.copy).toContain("Expected tonight");

    const expired = selectPublicPulse({
      now: new Date("2026-04-25T23:30:00-07:00"),
      category: "bar",
      pulseLevel: 1,
      energyScore: 28,
      energyLabel: "Chill",
      liveStateExpiresAt: "2026-04-25T22:00:00-07:00",
      liveStateComputedAt: "2026-04-25T20:30:00-07:00"
    });

    expect(expired.is_expected).toBe(true);
    expect(expired.source).toBe("expected");
    expect(expired.label).not.toBe("Chill");
  });

  it("preserves fresh verified signal pulse as non-expected evidence", () => {
    const pulse = selectPublicPulse({
      now: new Date("2026-04-25T23:30:00-07:00"),
      category: "club",
      pulseLevel: 3,
      energyScore: 82,
      energyLabel: "Packed",
      liveStateExpiresAt: "2026-04-26T00:30:00-07:00",
      liveStateComputedAt: "2026-04-25T23:20:00-07:00"
    });

    expect(pulse).toMatchObject({
      level: 3,
      score: 82,
      label: "Packed",
      source: "verified_signals",
      is_expected: false
    });
  });

  it("soft-caps neighborhood and type dominance in the top 20", () => {
    const crowdedMission = Array.from({ length: 8 }, (_, index) => ({
      id: `mission-${index}`,
      score: 100 - index,
      neighborhood: "Mission",
      category: "bar"
    }));
    const otherAreas = Array.from({ length: 12 }, (_, index) => ({
      id: `other-${index}`,
      score: 80 - index,
      neighborhood: index % 2 === 0 ? "SoMa" : "Castro",
      category: index % 3 === 0 ? "club" : "live_music"
    }));

    const ranked = rerankForDiversity([...crowdedMission, ...otherAreas], {
      neighborhoodSoftCap: 5,
      categorySoftCap: 12,
      window: 20
    });

    const topSixMissionCount = ranked.slice(0, 6).filter((item) => item.neighborhood === "Mission").length;
    expect(topSixMissionCount).toBeLessThanOrEqual(5);
    expect(ranked[0]?.id).toBe("mission-0");
  });
});
