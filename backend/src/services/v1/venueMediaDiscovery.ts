import crypto from "crypto";

export type MediaRightsStatus = "approved" | "review" | "rejected";
export type MediaSourceType = "og_image" | "twitter_image" | "page_image" | "press_download";

export type MediaCandidateInput = {
  venueId: string;
  marketId: string;
  venueName: string;
  officialWebsiteUrl: string;
  sourcePageUrl: string;
  imageUrl: string;
  sourceType: MediaSourceType;
  proofText?: string;
  width?: number;
  height?: number;
};

export type ClassifiedMediaCandidate = MediaCandidateInput & {
  rightsStatus: MediaRightsStatus;
  rightsBasis: string;
  proofExcerpt: string | null;
  robotsStatus: string;
  creditText: string;
  creditUrl: string | null;
  licenseName: string;
  licenseUrl: string | null;
  contentCategory: string;
  contentHash: string;
  aspectRatio: number | null;
};

export const MEDIA_DISCOVERY_PATHS = [
  "/press",
  "/media",
  "/media-kit",
  "/press-kit",
  "/newsroom",
  "/assets",
  "/brand",
  "/gallery",
  "/about",
  "/epk",
  "/photos",
  "/private-events",
  "/events/private"
];

const builderHosts = [
  "images.squarespace-cdn.com",
  "static.wixstatic.com",
  "static.wixstatic.com",
  "cdn.sanity.io",
  "images.ctfassets.net",
  "res.cloudinary.com"
];

const rejectPattern =
  /\b(flyer|poster|menu|ticket|eventbrite|dice\.fm|tixr|seetickets|artist|dj\s*promo|promo\s*shot|instagram|facebook|tiktok|screenshot|logo|map|calendar|meme)\b/i;
const reviewPattern = /\b(crowd|patron|guest|dancefloor|photographer|photo\s+by|courtesy\s+of|©|copyright)\b/i;
const venueSpacePattern = /\b(venue|room|interior|stage|bar|exterior|space|club|lounge|hall|floor|gallery|press|media\s*kit)\b/i;
const pressUsePattern = /\b(press|media\s*kit|media|marketing|download|assets|brand|gallery|photos)\b/i;

export function normalizeMediaUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function mediaDiscoveryUrls(websiteUrl: string): string[] {
  const root = normalizeMediaUrl("/", websiteUrl);
  if (!root) return [];
  const url = new URL(root);
  return [
    url.toString(),
    ...MEDIA_DISCOVERY_PATHS.map((path) => new URL(path, url.origin).toString())
  ];
}

export function isFirstPartyMedia(sourcePageUrl: string, imageUrl: string): boolean {
  const source = new URL(sourcePageUrl);
  const image = new URL(imageUrl);
  if (source.hostname === image.hostname) return true;
  return builderHosts.some((host) => image.hostname === host || image.hostname.endsWith(`.${host}`));
}

export function classifyMediaCandidate(
  input: MediaCandidateInput,
  robotsStatus = "allowed"
): ClassifiedMediaCandidate {
  const haystack = `${input.sourcePageUrl} ${input.imageUrl} ${input.proofText ?? ""}`;
  const firstParty = isFirstPartyMedia(input.sourcePageUrl, input.imageUrl);
  const proofExcerpt = excerpt(input.proofText ?? haystack);
  const aspectRatio = input.width && input.height ? Number((input.width / input.height).toFixed(3)) : null;
  const contentCategory = classifyContent(haystack);
  const base = {
    ...input,
    proofExcerpt,
    robotsStatus,
    creditText: input.venueName,
    creditUrl: input.sourcePageUrl,
    licenseName: "Venue-owned media",
    licenseUrl: null,
    contentCategory,
    contentHash: crypto.createHash("sha256").update(input.imageUrl).digest("hex"),
    aspectRatio
  };

  if (robotsStatus === "disallowed") {
    return {
      ...base,
      rightsStatus: "rejected",
      rightsBasis: "robots.txt disallowed crawling this media source."
    };
  }

  if (!firstParty) {
    return {
      ...base,
      rightsStatus: "rejected",
      rightsBasis: "Image is not same-origin or a recognized first-party website-builder CDN."
    };
  }

  if (rejectPattern.test(haystack)) {
    return {
      ...base,
      rightsStatus: "rejected",
      rightsBasis: "Rejected because the candidate looks like a flyer, ticketing, social, menu, screenshot, or artist promo asset."
    };
  }

  if (reviewPattern.test(haystack)) {
    return {
      ...base,
      rightsStatus: "review",
      rightsBasis: "Review required because the candidate may contain patrons, crowd imagery, or photographer-owned work."
    };
  }

  if (venueSpacePattern.test(haystack) || pressUsePattern.test(haystack) || input.sourceType === "press_download") {
    return {
      ...base,
      rightsStatus: "approved",
      rightsBasis: "Venue-owned page references first-party venue/press/media imagery with acceptable reuse fit."
    };
  }

  return {
    ...base,
    rightsStatus: "review",
    rightsBasis: "Review required because the page is first-party but the reuse and visual fit are ambiguous."
  };
}

export function discoverMediaCandidatesFromHtml(input: {
  venueId: string;
  marketId: string;
  venueName: string;
  officialWebsiteUrl: string;
  sourcePageUrl: string;
  html: string;
  robotsStatus?: string;
}): ClassifiedMediaCandidate[] {
  const raw: Array<{ imageUrl: string; sourceType: MediaSourceType; proofText: string }> = [];
  const metaPattern = /<meta\b[^>]*(?:property|name)=["'](og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  const imgPattern = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(input.html))) {
    const url = normalizeMediaUrl(match[2] ?? "", input.sourcePageUrl);
    if (url) raw.push({ imageUrl: url, sourceType: match[1] === "og:image" ? "og_image" : "twitter_image", proofText: match[0] });
  }

  while ((match = imgPattern.exec(input.html))) {
    const url = normalizeMediaUrl(match[1] ?? "", input.sourcePageUrl);
    if (url) raw.push({ imageUrl: url, sourceType: "page_image", proofText: match[0] });
  }

  const seen = new Set<string>();
  return raw
    .filter((candidate) => {
      if (seen.has(candidate.imageUrl)) return false;
      seen.add(candidate.imageUrl);
      return true;
    })
    .map((candidate) =>
      classifyMediaCandidate(
        {
          venueId: input.venueId,
          marketId: input.marketId,
          venueName: input.venueName,
          officialWebsiteUrl: input.officialWebsiteUrl,
          sourcePageUrl: input.sourcePageUrl,
          imageUrl: candidate.imageUrl,
          sourceType: candidate.sourceType,
          proofText: `${candidate.proofText} ${input.html.slice(0, 1200)}`
        },
        input.robotsStatus ?? "allowed"
      )
    );
}

function classifyContent(value: string): string {
  if (/\b(flyer|poster|ticket|artist|promo)\b/i.test(value)) return "flyer_rejected";
  if (/\b(crowd|patron|dancefloor)\b/i.test(value)) return "crowd_review";
  if (/\bstage\b/i.test(value)) return "stage";
  if (/\bbar\b/i.test(value)) return "bar";
  if (/\bexterior\b/i.test(value)) return "exterior";
  return "venue_space";
}

function excerpt(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 280) : null;
}
