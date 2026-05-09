import { describe, expect, it } from "vitest";
import {
  FOURSQUARE_EVIDENCE_DETAIL_FIELDS,
  FOURSQUARE_EVIDENCE_SEARCH_FIELDS,
  buildFoursquareEvidencePatch,
  scoreFoursquareEvidenceCandidate
} from "../src/services/v1/foursquareEvidence";

describe("Phase 5.8B Foursquare evidence enrichment", () => {
  it("requests only Pro fields for search and details", () => {
    const fields = `${FOURSQUARE_EVIDENCE_SEARCH_FIELDS},${FOURSQUARE_EVIDENCE_DETAIL_FIELDS}`;
    expect(fields).toContain("website");
    expect(fields).toContain("tel");
    expect(fields).toContain("social_media");
    expect(fields).toContain("categories");
    expect(fields).toContain("related_places");
    expect(fields).not.toContain("geocodes");
    expect(fields).not.toContain("verified");
    expect(fields).not.toContain("hours");
    expect(fields).not.toContain("hours_popular");
    expect(fields).not.toContain("rating");
    expect(fields).not.toContain("popularity");
    expect(fields).not.toContain("price");
    expect(fields).not.toContain("closed_bucket");
    expect(fields).not.toContain("stats");
  });

  it("maps website, phone, social, and category evidence without promo content", () => {
    const patch = buildFoursquareEvidencePatch({
      fsq_place_id: "fsq-1",
      name: "Nightloop Room",
      tel: "+14155550123",
      website: "https://nightloop-room.example",
      verified: true,
      social_media: {
        instagram: "nightlooproom",
        twitter: "nightlooproom"
      },
      categories: [
        { id: 10032, name: "Night Club" },
        { id: 13003, name: "Bar" }
      ],
      related_places: {
        children: [{ fsq_place_id: "child-1", name: "Upstairs Room" }]
      },
      description: "Promo copy should not be retained",
      photos: [{ id: "photo-1" }],
      tips: [{ text: "Tip text should not be retained" }]
    }, new Date("2026-04-28T04:00:00.000Z"));

    expect(patch).toMatchObject({
      foursquare_id: "fsq-1",
      foursquare_name: "Nightloop Room",
      foursquare_category: "Night Club",
      foursquare_category_names: ["Night Club", "Bar"],
      foursquare_phone: "+14155550123",
      foursquare_website: "https://nightloop-room.example",
      website: "https://nightloop-room.example",
      foursquare_instagram: "nightlooproom",
      foursquare_twitter: "nightlooproom",
      foursquare_verified: true,
      foursquare_related_places_present: true,
      foursquare_evidence_checked_at: "2026-04-28T04:00:00.000Z"
    });
    const serialized = JSON.stringify(patch);
    expect(serialized).not.toContain("Promo copy");
    expect(serialized).not.toContain("photo-1");
    expect(serialized).not.toContain("Tip text");
  });

  it("scores exact nearby candidates above weak distant matches", () => {
    const exact = scoreFoursquareEvidenceCandidate({
      venueName: "Nightloop Room",
      venueLatitude: 37.7749,
      venueLongitude: -122.4194,
      place: {
        fsq_place_id: "fsq-1",
        name: "Nightloop Room",
        geocodes: {
          main: {
            latitude: 37.775,
            longitude: -122.4195
          }
        }
      }
    });
    const weak = scoreFoursquareEvidenceCandidate({
      venueName: "Nightloop Room",
      venueLatitude: 37.7749,
      venueLongitude: -122.4194,
      place: {
        fsq_place_id: "fsq-2",
        name: "Completely Different",
        geocodes: {
          main: {
            latitude: 37.8,
            longitude: -122.45
          }
        }
      }
    });

    expect(exact.score).toBeGreaterThanOrEqual(0.9);
    expect(weak.score).toBeLessThan(0.55);
  });
});
