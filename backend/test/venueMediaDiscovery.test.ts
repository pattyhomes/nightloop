import { describe, expect, it } from "vitest";
import {
  classifyMediaCandidate,
  discoverMediaCandidatesFromHtml,
  mediaDiscoveryUrls
} from "../src/services/v1/venueMediaDiscovery";

const baseCandidate = {
  venueId: "venue-1",
  marketId: "market-1",
  venueName: "Audio SF",
  officialWebsiteUrl: "https://audiosf.com",
  sourcePageUrl: "https://audiosf.com/press",
  imageUrl: "https://audiosf.com/images/venue-stage.jpg",
  sourceType: "page_image" as const
};

describe("venue media discovery", () => {
  it("auto-approves same-origin venue media from press/gallery proof", () => {
    const candidate = classifyMediaCandidate({
      ...baseCandidate,
      proofText: "Press kit venue interior stage photos for media use."
    });

    expect(candidate.rightsStatus).toBe("approved");
    expect(candidate.contentCategory).toBe("stage");
  });

  it("auto-approves first-party website-builder CDN media referenced by official pages", () => {
    const candidate = classifyMediaCandidate({
      ...baseCandidate,
      imageUrl: "https://images.squarespace-cdn.com/content/v1/audio/interior-room.jpg",
      proofText: "Gallery photos of the venue interior."
    });

    expect(candidate.rightsStatus).toBe("approved");
  });

  it("rejects flyers, social embeds, ticketing widgets, menus, screenshots, and artist promos", () => {
    for (const text of ["event flyer", "instagram embed", "ticket widget", "drink menu", "artist promo", "screenshot"]) {
      const candidate = classifyMediaCandidate({
        ...baseCandidate,
        imageUrl: `https://audiosf.com/images/${text.replace(/\s+/g, "-")}.jpg`,
        proofText: text
      });
      expect(candidate.rightsStatus).toBe("rejected");
    }
  });

  it("marks crowd and photographer-credited images as review-only", () => {
    const candidate = classifyMediaCandidate({
      ...baseCandidate,
      proofText: "Dancefloor crowd photo by Local Photographer."
    });

    expect(candidate.rightsStatus).toBe("review");
  });

  it("skips robots-disallowed pages", () => {
    const candidate = classifyMediaCandidate(
      {
        ...baseCandidate,
        proofText: "Venue gallery."
      },
      "disallowed"
    );

    expect(candidate.rightsStatus).toBe("rejected");
    expect(candidate.rightsBasis).toContain("robots.txt");
  });

  it("dry-run HTML discovery returns candidates without writes", () => {
    const html = `
      <html>
        <head><meta property="og:image" content="/media/venue-room.jpg"></head>
        <body><img src="/photos/stage.jpg" alt="venue stage"></body>
      </html>
    `;
    const candidates = discoverMediaCandidatesFromHtml({
      venueId: "venue-1",
      marketId: "market-1",
      venueName: "Audio SF",
      officialWebsiteUrl: "https://audiosf.com",
      sourcePageUrl: "https://audiosf.com/media",
      html
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.imageUrl.startsWith("https://audiosf.com/"))).toBe(true);
  });

  it("builds a bounded venue-owned discovery URL list", () => {
    expect(mediaDiscoveryUrls("https://example.com").slice(0, 4)).toEqual([
      "https://example.com/",
      "https://example.com/press",
      "https://example.com/media",
      "https://example.com/media-kit"
    ]);
  });
});
