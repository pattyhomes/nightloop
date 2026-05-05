import crypto from "crypto";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { VenueMediaManifestEntry } from "./venueMediaManifest";

export type MediaRightsStatus = "approved" | "review" | "rejected";
export type MediaSourceType =
  | "og_image"
  | "twitter_image"
  | "page_image"
  | "lazy_image"
  | "srcset_image"
  | "background_image"
  | "json_ld_image"
  | "linked_image"
  | "press_download";

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

export type VenueMediaSourceRow = {
  id: string;
  name: string;
  market_id: string;
  website_url: string | null;
};

export type VenueMediaSource = VenueMediaSourceRow & {
  website_url: string;
  manifest_name: string | null;
  manifest_proof_url: string | null;
  manifest_verified_at: string | null;
};

export type ImageValidationResult =
  | {
      ok: true;
      width: number;
      height: number;
      aspectRatio: number;
      contentHash: string;
      extension: "jpg" | "png" | "webp";
    }
  | {
      ok: false;
      reason: string;
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
  "static1.squarespace.com",
  "static.squarespace.com",
  "static.wixstatic.com",
  "cdn.sanity.io",
  "images.ctfassets.net",
  "res.cloudinary.com"
];

const rejectPattern =
  /\b(flyer|poster|menu|ticket|tickets|eventbrite|dice\.fm|tixr|seetickets|artist\s*promo|dj\s*promo|promo\s*shot|screenshot|logo|map|calendar|meme)\b/i;
const socialAssetPattern = /(?:\/social\/|(?:\/|%2f|\b)(instagram|facebook|fb|ig|tiktok|twitter|tw|x|social)[^/]*(?:\.png|\.jpg|\.jpeg|\.webp|$))/i;
const rejectedImagePathPattern = /(?:logo|icon|favicon|apple-touch|sprite|placeholder|blank|pixel)[^/]*(?:\.png|\.jpg|\.jpeg|\.webp|$)/i;
const reviewPattern = /\b(crowd|patron|guest|dancefloor|photographer|photo\s+by|courtesy\s+of|©|copyright)\b/i;
const venueSpacePattern = /\b(venue|room|interior|stage|bar|exterior|space|club|lounge|hall|floor|gallery|press|media\s*kit)\b/i;
const pressUsePattern = /\b(press|media\s*kit|media|marketing|download|assets|brand|gallery|photos)\b/i;
const mediaPageLinkPattern = /\b(gallery|galleries|photo|photos|press|media|media-kit|press-kit|private-events|private events|venue|space|about)\b/i;
const imageExtensionPattern = /\.(?:jpe?g|png|webp)(?:[?#]|$)/i;

const allowedImageTypes: Map<string, "jpg" | "png" | "webp"> = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
] as const);

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

export function discoverMediaPageLinksFromHtml(input: {
  html: string;
  sourcePageUrl: string;
  limit?: number;
}): string[] {
  const $ = cheerio.load(input.html);
  const source = new URL(input.sourcePageUrl);
  const seen = new Set<string>();
  const links: string[] = [];
  const limit = input.limit ?? 12;

  $("a[href]").each((_, element) => {
    if (links.length >= limit) return;
    const href = $(element).attr("href");
    if (!href) return;
    const resolved = normalizeMediaUrl(href, input.sourcePageUrl);
    if (!resolved) return;
    const url = new URL(resolved);
    if (url.origin !== source.origin) return;
    url.hash = "";
    const text = `${$(element).text()} ${url.pathname}`.replace(/\s+/g, " ").trim();
    if (!mediaPageLinkPattern.test(text)) return;
    const normalized = url.toString();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    links.push(normalized);
  });

  return links;
}

export function normalizeVenueMediaName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function selectVenueMediaSources(
  rows: VenueMediaSourceRow[],
  manifest: readonly VenueMediaManifestEntry[],
  options: { coreOnly: boolean; limit: number }
): VenueMediaSource[] {
  const manifestByAlias = new Map<string, VenueMediaManifestEntry>();
  for (const entry of manifest) {
    for (const alias of [entry.canonicalName, ...entry.aliases]) {
      manifestByAlias.set(normalizeVenueMediaName(alias), entry);
    }
  }

  const sources: VenueMediaSource[] = [];
  for (const row of rows) {
    const manifestEntry = manifestByAlias.get(normalizeVenueMediaName(row.name)) ?? null;
    if (options.coreOnly && !manifestEntry) continue;

    const websiteValue = row.website_url ?? manifestEntry?.websiteUrl;
    if (!websiteValue) continue;
    const website = normalizeMediaUrl(websiteValue, "https://nightloop.invalid/");
    if (!website) continue;

    sources.push({
      ...row,
      website_url: website,
      manifest_name: manifestEntry?.canonicalName ?? null,
      manifest_proof_url: manifestEntry?.proofUrl ?? null,
      manifest_verified_at: manifestEntry?.verifiedAt ?? null
    });
  }

  const ordered = options.coreOnly
    ? sources.sort((left, right) => {
        const leftIndex = manifest.findIndex((entry) => entry.canonicalName === left.manifest_name);
        const rightIndex = manifest.findIndex((entry) => entry.canonicalName === right.manifest_name);
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
      })
    : sources.sort((left, right) => left.name.localeCompare(right.name));

  return ordered.slice(0, Math.max(1, Math.min(100, options.limit)));
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
  const haystack = `${new URL(input.sourcePageUrl).pathname} ${input.imageUrl} ${input.proofText ?? ""}`;
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

  if (
    isTrackingPixel(input) ||
    rejectPattern.test(haystack) ||
    socialAssetPattern.test(input.imageUrl) ||
    rejectedImagePathPattern.test(input.imageUrl)
  ) {
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

export function validateVenueMediaImage(input: {
  buffer: Buffer;
  contentType: string | null;
  maxBytes?: number;
  minWidth?: number;
  minHeight?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
}): ImageValidationResult {
  const maxBytes = input.maxBytes ?? 8_000_000;
  const minWidth = input.minWidth ?? 640;
  const minHeight = input.minHeight ?? 360;
  const minAspectRatio = input.minAspectRatio ?? 0.7;
  const maxAspectRatio = input.maxAspectRatio ?? 2.4;
  const contentType = (input.contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = allowedImageTypes.get(contentType);

  if (!extension) {
    return { ok: false, reason: `Unsupported image content type: ${contentType || "unknown"}.` };
  }
  if (input.buffer.byteLength > maxBytes) {
    return { ok: false, reason: `Image is too large: ${input.buffer.byteLength} bytes.` };
  }

  const dimensions = imageDimensions(input.buffer, extension);
  if (!dimensions) {
    return { ok: false, reason: "Could not read image dimensions." };
  }
  if (dimensions.width < minWidth || dimensions.height < minHeight) {
    return { ok: false, reason: `Image is too small: ${dimensions.width}x${dimensions.height}.` };
  }

  const aspectRatio = Number((dimensions.width / dimensions.height).toFixed(3));
  if (aspectRatio < minAspectRatio || aspectRatio > maxAspectRatio) {
    return { ok: false, reason: `Image aspect ratio is outside supported card crops: ${aspectRatio}.` };
  }

  return {
    ok: true,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio,
    contentHash: crypto.createHash("sha256").update(input.buffer).digest("hex"),
    extension
  };
}

export function assertMediaApplyTarget(input: {
  apply: boolean;
  target?: string;
  supabaseProjectUrl?: string;
  projectRefConfirmation?: string;
}): void {
  if (!input.apply) return;
  if (input.target !== "staging" && input.target !== "production") {
    throw new Error("--apply requires --target=staging or --target=production for Build 3 media publishing.");
  }

  const projectRef = projectRefFromSupabaseUrl(input.supabaseProjectUrl);
  if (!projectRef || input.projectRefConfirmation !== projectRef) {
    throw new Error("--apply requires SUPABASE_PROJECT_REF_CONFIRM to match the Supabase project ref.");
  }
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
  const raw: Array<{ imageUrl: string; sourceType: MediaSourceType; proofText: string; width?: number; height?: number }> = [];
  const $ = cheerio.load(input.html);
  const pageTitle = $("title").first().text().trim();

  $("meta").each((_, element) => {
    const key = ($(element).attr("property") ?? $(element).attr("name") ?? "").toLowerCase();
    if (key !== "og:image" && key !== "twitter:image") return;
    const url = normalizeMediaUrl($(element).attr("content") ?? "", input.sourcePageUrl);
    if (!url) return;
    raw.push({
      imageUrl: url,
      sourceType: key === "og:image" ? "og_image" : "twitter_image",
      proofText: scopedProof($, element, pageTitle)
    });
  });

  $("img").each((_, element) => {
    const proofText = scopedProof($, element, pageTitle);
    const width = numericAttr($, element, "width");
    const height = numericAttr($, element, "height");
    for (const attr of ["src", "data-src", "data-lazy-src", "data-original", "data-nectar-img-src"]) {
      const value = $(element).attr(attr);
      const url = value ? normalizeMediaUrl(value, input.sourcePageUrl) : null;
      if (!url) continue;
      raw.push({
        imageUrl: url,
        sourceType: attr === "src" ? "page_image" : "lazy_image",
        proofText,
        width,
        height
      });
    }
    for (const attr of ["srcset", "data-srcset", "data-nectar-img-srcset"]) {
      const picked = pickLargestSrcsetCandidate($(element).attr(attr) ?? "", input.sourcePageUrl);
      if (!picked) continue;
      raw.push({
        imageUrl: picked.url,
        sourceType: "srcset_image",
        proofText,
        width: picked.width ?? width,
        height
      });
    }
  });

  $("[style]").each((_, element) => {
    for (const value of extractCssImageUrls($(element).attr("style") ?? "")) {
      if (!imageExtensionPattern.test(value)) continue;
      const url = normalizeMediaUrl(value, input.sourcePageUrl);
      if (!url) continue;
      raw.push({
        imageUrl: url,
        sourceType: "background_image",
        proofText: scopedProof($, element, pageTitle)
      });
    }
  });

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (!imageExtensionPattern.test(href)) return;
    const url = normalizeMediaUrl(href, input.sourcePageUrl);
    if (!url) return;
    raw.push({
      imageUrl: url,
      sourceType: "linked_image",
      proofText: scopedProof($, element, pageTitle)
    });
  });

  $("script[type='application/ld+json']").each((_, element) => {
    for (const value of extractJsonLdImages($(element).text())) {
      const url = normalizeMediaUrl(value, input.sourcePageUrl);
      if (!url) continue;
      raw.push({
        imageUrl: url,
        sourceType: "json_ld_image",
        proofText: `json-ld image ${pageTitle}`.trim()
      });
    }
  });

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
          proofText: candidate.proofText,
          width: candidate.width,
          height: candidate.height
        },
        input.robotsStatus ?? "allowed"
      )
    );
}

function isTrackingPixel(input: MediaCandidateInput): boolean {
  if (input.width != null && input.height != null && input.width <= 4 && input.height <= 4) return true;
  return /(?:\/tr\?|pixel|analytics|tracking|beacon)/i.test(input.imageUrl);
}

function numericAttr($: cheerio.CheerioAPI, element: Element, name: string): number | undefined {
  const value = $(element).attr(name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scopedProof($: cheerio.CheerioAPI, element: Element, pageTitle: string): string {
  const target = $(element);
  const context = [
    pageTitle,
    element.tagName,
    target.attr("class"),
    target.attr("id"),
    target.attr("alt"),
    target.attr("title"),
    target.attr("aria-label"),
    target.text(),
    target.parent().attr("class"),
    target.parent().text(),
    target.closest("figure").find("figcaption").text(),
    target.closest("section, article, main, div").attr("class"),
    target.closest("section, article, main").find("h1,h2,h3").first().text()
  ];
  return context
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function pickLargestSrcsetCandidate(value: string, baseUrl: string): { url: string; width?: number } | null {
  const candidates: Array<{ url: string; width?: number }> = [];
  for (const part of value.split(",")) {
    const [rawUrl, descriptor] = part.trim().split(/\s+/, 2);
    const url = rawUrl ? normalizeMediaUrl(rawUrl, baseUrl) : null;
    if (!url) continue;
    const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : undefined;
    candidates.push({ url, width: Number.isFinite(width) ? width : undefined });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => (right.width ?? 0) - (left.width ?? 0))[0] ?? null;
}

function extractCssImageUrls(value: string): string[] {
  const urls: string[] = [];
  const pattern = /url\((['"]?)(.*?)\1\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

function extractJsonLdImages(value: string): string[] {
  try {
    return collectJsonLdImages(JSON.parse(value));
  } catch {
    return [];
  }
}

function collectJsonLdImages(value: unknown): string[] {
  if (typeof value === "string") return imageExtensionPattern.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectJsonLdImages);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const images: string[] = [];
  for (const key of ["image", "photo", "thumbnail", "thumbnailUrl", "contentUrl", "url"]) {
    const nested = record[key];
    if (nested != null) images.push(...collectJsonLdImages(nested));
  }
  return images;
}

function classifyContent(value: string): string {
  if (/\b(flyer|poster|ticket|artist|promo)\b/i.test(value)) return "flyer_rejected";
  if (/\b(crowd|patron|dancefloor)\b/i.test(value)) return "crowd_review";
  if (/\bstage\b/i.test(value)) return "stage";
  if (/\bbar\b/i.test(value)) return "bar";
  if (/\bexterior\b/i.test(value)) return "exterior";
  return "venue_space";
}

function projectRefFromSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).hostname;
    const [projectRef] = host.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

function imageDimensions(buffer: Buffer, extension: "jpg" | "png" | "webp"): { width: number; height: number } | null {
  if (extension === "png") {
    if (buffer.byteLength < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (extension === "jpg") {
    return jpegDimensions(buffer);
  }

  return webpDimensions(buffer);
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  if (buffer.byteLength < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  while (offset + 9 < buffer.byteLength) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.byteLength < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.byteLength >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (chunk === "VP8 " && buffer.byteLength >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === "VP8L" && buffer.byteLength >= 25) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    if (b0 == null || b1 == null || b2 == null || b3 == null) return null;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }
  return null;
}

function excerpt(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 280) : null;
}
