import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { discoverForVenue, loadReviewedCandidates, uploadApprovedCandidate } from "../src/scripts/discoverVenueMedia";
import { CORE10_MEDIA_SOURCES } from "../src/services/v1/venueMediaManifest";
import {
  assertMediaApplyTarget,
  classifyMediaCandidate,
  discoverMediaPageLinksFromHtml,
  discoverMediaCandidatesFromHtml,
  mediaDiscoveryUrls,
  selectVenueMediaSources,
  validateVenueMediaImage
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("treats Squarespace static media as first-party when referenced by official pages", () => {
    const candidate = classifyMediaCandidate({
      ...baseCandidate,
      sourcePageUrl: "https://monarchsf.com/gallery",
      imageUrl: "http://static1.squarespace.com/static/site/t/image.jpg?format=1500w",
      proofText: "Venue gallery interior stage photo."
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

  it("rejects logos and social icons without using whole-page social text against venue photos", () => {
    const logo = classifyMediaCandidate({
      ...baseCandidate,
      imageUrl: "https://audiosf.com/images/top-logo.png",
      proofText: "Audio SF logo"
    });
    const socialIcon = classifyMediaCandidate({
      ...baseCandidate,
      imageUrl: "https://audiosf.com/images/social/fb.png",
      proofText: "Facebook"
    });
    const venuePhoto = discoverMediaCandidatesFromHtml({
      venueId: "venue-1",
      marketId: "market-1",
      venueName: "Audio SF",
      officialWebsiteUrl: "https://audiosf.com",
      sourcePageUrl: "https://audiosf.com/gallery",
      html: `
        <html>
          <head><title>Audio SF</title><script>facebook instagram tiktok</script></head>
          <body><img data-src="/photos/venue-stage.jpg" alt="Venue stage and room"></body>
        </html>
      `
    });

    expect(logo.rightsStatus).toBe("rejected");
    expect(socialIcon.rightsStatus).toBe("rejected");
    expect(venuePhoto).toHaveLength(1);
    expect(venuePhoto[0]?.rightsStatus).toBe("approved");
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

  it("extracts lazy images, srcset, backgrounds, linked downloads, and JSON-LD images", () => {
    const html = `
      <html>
        <head>
          <title>Venue Gallery</title>
          <meta content="/media/reversed-og.jpg" property="og:image">
          <script type="application/ld+json">
            {"@type":"NightClub","image":["/jsonld/interior.webp"]}
          </script>
        </head>
        <body>
          <img src="data:image/svg+xml;base64,abc" data-nectar-img-src="/lazy/stage.jpg" data-nectar-img-srcset="/lazy/stage-small.jpg 400w, /lazy/stage-large.jpg 1200w" alt="venue stage">
          <div style="background-image: url('/bg/room.png')">interior room</div>
          <a href="/press/venue-photo.jpg">Download venue photo</a>
        </body>
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

    expect(candidates.map((candidate) => candidate.sourceType)).toEqual(
      expect.arrayContaining(["og_image", "lazy_image", "srcset_image", "background_image", "linked_image", "json_ld_image"])
    );
    expect(candidates.map((candidate) => candidate.imageUrl)).toContain("https://audiosf.com/lazy/stage-large.jpg");
  });

  it("discovers same-origin media page links from venue pages", () => {
    const links = discoverMediaPageLinksFromHtml({
      sourcePageUrl: "https://audiosf.com/",
      html: `
        <a href="/gallery">Gallery</a>
        <a href="https://audiosf.com/private-events">Private Events</a>
        <a href="https://instagram.com/audiosf">Instagram</a>
        <a href="/tickets">Tickets</a>
      `
    });

    expect(links).toEqual(["https://audiosf.com/gallery", "https://audiosf.com/private-events"]);
  });

  it("discovers one-level linked media pages for a venue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/robots.txt")) {
          return { ok: true, text: async () => "User-agent: *\nAllow: /" };
        }
        if (url === "https://audiosf.com/") {
          return {
            ok: true,
            text: async () => `<html><body><a href="/gallery">Gallery</a></body></html>`
          };
        }
        if (url === "https://audiosf.com/gallery") {
          return {
            ok: true,
            text: async () => `<html><head><title>Venue Gallery</title></head><body><img src="/photos/stage.jpg" alt="venue stage"></body></html>`
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      })
    );

    const result = await discoverForVenue(
      {
        id: "venue-audio",
        name: "Audio",
        market_id: "market-1",
        website_url: "https://audiosf.com/",
        manifest_name: "Audio SF",
        manifest_proof_url: "https://audiosf.com/",
        manifest_verified_at: "2026-05-03"
      },
      { maxPages: 16 }
    );

    expect(result.pagesVisited).toContain("https://audiosf.com/gallery");
    expect(result.candidates.some((candidate) => candidate.imageUrl === "https://audiosf.com/photos/stage.jpg")).toBe(true);
  });

  it("builds a bounded venue-owned discovery URL list", () => {
    expect(mediaDiscoveryUrls("https://example.com").slice(0, 4)).toEqual([
      "https://example.com/",
      "https://example.com/press",
      "https://example.com/media",
      "https://example.com/media-kit"
    ]);
  });

  it("selects Core 10 venues by curated aliases and supplies missing official websites", () => {
    const sources = selectVenueMediaSources(
      [
        { id: "venue-audio", name: "Audio", market_id: "market-1", website_url: null },
        { id: "venue-monarch", name: "Monarch", market_id: "market-1", website_url: null },
        { id: "venue-other", name: "Other Bar", market_id: "market-1", website_url: null }
      ],
      CORE10_MEDIA_SOURCES,
      { coreOnly: true, limit: 10 }
    );

    expect(sources.map((source) => source.name)).toEqual(["Audio", "Monarch"]);
    expect(sources[0]?.website_url).toBe("https://audiosf.com/");
    expect(sources[1]?.website_url).toBe("https://monarchsf.com/");
  });

  it("rejects zero Core 10 source selection in pure source policy", () => {
    const sources = selectVenueMediaSources(
      [{ id: "venue-other", name: "Other Bar", market_id: "market-1", website_url: null }],
      CORE10_MEDIA_SOURCES,
      { coreOnly: true, limit: 10 }
    );

    expect(sources).toEqual([]);
  });

  it("validates content type, dimensions, byte size, aspect ratio, and byte hash", () => {
    const first = validateVenueMediaImage({
      buffer: pngBuffer(800, 600),
      contentType: "image/png"
    });
    const second = validateVenueMediaImage({
      buffer: pngBuffer(800, 600),
      contentType: "image/png"
    });
    const tooSmall = validateVenueMediaImage({
      buffer: pngBuffer(320, 240),
      contentType: "image/png"
    });
    const unsupported = validateVenueMediaImage({
      buffer: pngBuffer(800, 600),
      contentType: "image/gif"
    });

    expect(first.ok).toBe(true);
    expect(second.ok && first.ok ? second.contentHash === first.contentHash : false).toBe(true);
    expect(tooSmall.ok).toBe(false);
    expect(unsupported.ok).toBe(false);
  });

  it("requires explicit staging target and project-ref confirmation for apply", () => {
    expect(() =>
      assertMediaApplyTarget({
        apply: true,
        target: "production",
        supabaseProjectUrl: "https://hbsbemhyhopmkykihxct.supabase.co",
        projectRefConfirmation: "hbsbemhyhopmkykihxct"
      })
    ).toThrow("--target=staging");

    expect(() =>
      assertMediaApplyTarget({
        apply: true,
        target: "staging",
        supabaseProjectUrl: "https://hbsbemhyhopmkykihxct.supabase.co",
        projectRefConfirmation: "hbsbemhyhopmkykihxct"
      })
    ).not.toThrow();
  });

  it("uploads only validated approved images to the approved media bucket with byte-hash path", async () => {
    const uploads: Array<{ bucket: string; path: string; contentType: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => pngBuffer(800, 600).buffer
      }))
    );

    const stored = await uploadApprovedCandidate(
      classifyMediaCandidate({
        ...baseCandidate,
        proofText: "Press kit venue interior stage photos for media use."
      }),
      {
        storage: {
          from(bucket: string) {
            return {
              async upload(path: string, _body: Buffer, options: { contentType: string; upsert: boolean }) {
                uploads.push({ bucket, path, contentType: options.contentType });
                return { error: null };
              },
              getPublicUrl(path: string) {
                return { data: { publicUrl: `https://cdn.example/${path}` } };
              }
            };
          }
        }
      },
      "venue-media-approved"
    );

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.bucket).toBe("venue-media-approved");
    expect(uploads[0]?.path).toContain(stored.contentHash);
    expect(stored.width).toBe(800);
    expect(stored.height).toBe(600);
  });

  it("loads only approved candidates from a reviewed apply file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nightloop-media-reviewed-"));
    const file = path.join(dir, "selected-apply.json");
    await writeFile(
      file,
      JSON.stringify({
        candidates: [
          classifyMediaCandidate({
            ...baseCandidate,
            proofText: "Press kit venue stage photo."
          }),
          classifyMediaCandidate({
            ...baseCandidate,
            imageUrl: "https://audiosf.com/images/social/fb.png",
            proofText: "Facebook icon"
          })
        ]
      })
    );

    const loaded = await loadReviewedCandidates(file);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.rightsStatus).toBe("approved");
  });
});

function pngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
