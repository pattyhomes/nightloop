import { describe, expect, it } from "vitest";
import {
  GOOGLE_HOURS_FIELD_MASK,
  normalizeFoursquarePlaceHours,
  normalizeGooglePlaceHours
} from "../src/services/v1/providerHours";

const candidate = {
  id: "venue-1",
  name: "Nightloop Room",
  market_id: "market-1",
  timezone: "America/Los_Angeles",
  google_place_id: "places/google-1"
};

describe("Phase 5.8 provider hours normalization", () => {
  it("requests Google secondary hours and stores 30-day TTL/provenance", () => {
    expect(GOOGLE_HOURS_FIELD_MASK).toContain("regularSecondaryOpeningHours");
    expect(GOOGLE_HOURS_FIELD_MASK).toContain("currentSecondaryOpeningHours");

    const plan = normalizeGooglePlaceHours(candidate, {
      id: "places/google-1",
      businessStatus: "OPERATIONAL",
      utcOffsetMinutes: -420,
      regularOpeningHours: {
        openNow: false,
        periods: [
          {
            open: { day: 6, hour: 22, minute: 0 },
            close: { day: 0, hour: 2, minute: 0 }
          }
        ],
        weekdayDescriptions: ["Saturday: 10:00 PM - 2:00 AM"]
      },
      currentSecondaryOpeningHours: [
        {
          periods: [
            {
              open: { day: 6, hour: 23, minute: 0 },
              close: { day: 0, hour: 3, minute: 0 }
            }
          ],
          weekdayDescriptions: ["Late-night dance floor: 11:00 PM - 3:00 AM"]
        }
      ]
    }, {
      now: new Date("2026-04-25T20:00:00-07:00")
    });

    expect(plan).toMatchObject({
      source: "provider:google_places",
      status: "verified_hours",
      confidence: 0.9,
      metadata: expect.objectContaining({
        google_place_id: "places/google-1",
        source_provider: "google_places",
        opens_later: true,
        opens_at: "10:00 PM",
        closes_at: "2:00 AM",
        nightlife_day_window: "18:00-04:00"
      })
    });
    expect(Date.parse(plan.expires_at)).toBe(Date.parse("2026-05-25T20:00:00-07:00"));
    expect(plan.weekly_hours).toMatchObject({
      regular_periods: expect.any(Array),
      current_secondary_opening_hours: expect.any(Array)
    });
  });

  it("computes cross-midnight open windows without live-signal claims", () => {
    const plan = normalizeGooglePlaceHours(candidate, {
      businessStatus: "OPERATIONAL",
      regularOpeningHours: {
        periods: [
          {
            open: { day: 6, hour: 22, minute: 0 },
            close: { day: 0, hour: 2, minute: 0 }
          }
        ]
      }
    }, {
      now: new Date("2026-04-25T23:30:00-07:00")
    });

    expect(plan.status).toBe("verified_hours");
    expect(plan.metadata).toMatchObject({
      is_open_now: true,
      opens_at: "10:00 PM",
      closes_at: "2:00 AM"
    });
    expect(plan.metadata).not.toHaveProperty("claims_live_now");
  });

  it("keeps missing provider hours explicitly unknown", () => {
    const plan = normalizeGooglePlaceHours(candidate, {
      businessStatus: "OPERATIONAL"
    }, {
      now: new Date("2026-04-25T20:00:00-07:00")
    });

    expect(plan).toMatchObject({
      status: "unknown",
      confidence: 0.25,
      metadata: expect.objectContaining({
        is_open_now: null,
        hours_missing: true
      })
    });
    expect(plan.metadata).not.toHaveProperty("closed_today");
  });

  it("maps Foursquare fallback fields while excluding promo/raw content", () => {
    const plan = normalizeFoursquarePlaceHours({
      id: "venue-1",
      name: "Nightloop Room",
      market_id: "market-1",
      timezone: "America/Los_Angeles",
      latitude: 37.7749,
      longitude: -122.4194
    }, {
      fsq_id: "fsq-1",
      name: "Nightloop Room",
      timezone: "America/Los_Angeles",
      verified: true,
      popularity: 0.82,
      price: 3,
      rating: 8.9,
      closed_bucket: "VeryLikelyOpen",
      hours: {
        open_now: false,
        display: "Sat 10:00 PM - 2:00 AM",
        regular: [{ day: 6, open: "2200", close: "0200" }]
      },
      hours_popular: [{ day: 6, open: "2300", close: "0100" }],
      location: { neighborhood: ["SoMa"] },
      description: "Promo copy must not be stored",
      photos: [{ id: "photo-1" }],
      tips: [{ text: "Do not store tips" }]
    }, {
      now: new Date("2026-04-25T20:00:00-07:00")
    });

    expect(plan).toMatchObject({
      source: "provider:foursquare",
      status: "verified_hours",
      metadata: expect.objectContaining({
        fsq_id: "fsq-1",
        source_provider: "foursquare",
        foursquare_verified: true,
        popularity: 0.82,
        price: 3,
        rating: 8.9,
        provider_neighborhood: "SoMa",
        opens_later: true
      })
    });
    expect(plan.weekly_hours).toMatchObject({
      regular_periods: expect.any(Array),
      popular_periods: expect.any(Array)
    });
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("Promo copy");
    expect(serialized).not.toContain("photo-1");
    expect(serialized).not.toContain("Do not store tips");
  });
});
