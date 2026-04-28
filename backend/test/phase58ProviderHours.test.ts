import { describe, expect, it } from "vitest";
import { FOURSQUARE_PRO_FIELD_MASK } from "../src/lib/foursquareHttp";
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

  it("requests only Foursquare Pro fields while premium fields stay disabled", () => {
    expect(FOURSQUARE_PRO_FIELD_MASK).toContain("tel");
    expect(FOURSQUARE_PRO_FIELD_MASK).toContain("website");
    expect(FOURSQUARE_PRO_FIELD_MASK).toContain("social_media");
    expect(FOURSQUARE_PRO_FIELD_MASK).toContain("related_places");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("hours");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("hours_popular");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("rating");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("popularity");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("price");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("closed_bucket");
    expect(FOURSQUARE_PRO_FIELD_MASK).not.toContain("stats");
  });

  it("maps Foursquare Pro fallback fields as unknown hours while excluding promo/raw content", () => {
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
      tel: "+14155550123",
      website: "https://example.com",
      social_media: {
        instagram: "nightlooproom",
        twitter: "nightlooproom"
      },
      categories: [{ id: 10032, name: "Night Club" }],
      related_places: { children: [{ fsq_place_id: "child-1", name: "Nightloop Rooftop" }] },
      location: { neighborhood: ["SoMa"] },
      description: "Promo copy must not be stored",
      photos: [{ id: "photo-1" }],
      tips: [{ text: "Do not store tips" }]
    }, {
      now: new Date("2026-04-25T20:00:00-07:00")
    });

    expect(plan).toMatchObject({
      source: "provider:foursquare",
      status: "unknown",
      metadata: expect.objectContaining({
        fsq_id: "fsq-1",
        source_provider: "foursquare",
        foursquare_verified: true,
        phone: "+14155550123",
        website: "https://example.com",
        instagram: "nightlooproom",
        twitter: "nightlooproom",
        category_names: ["Night Club"],
        related_places_present: true,
        provider_neighborhood: "SoMa",
        hours_missing: true
      })
    });
    expect(plan.weekly_hours).toMatchObject({
      display: null,
      regular_periods: [],
      popular_periods: []
    });
    expect(plan.metadata).not.toHaveProperty("popularity");
    expect(plan.metadata).not.toHaveProperty("price");
    expect(plan.metadata).not.toHaveProperty("rating");
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain("Promo copy");
    expect(serialized).not.toContain("photo-1");
    expect(serialized).not.toContain("Do not store tips");
  });
});
