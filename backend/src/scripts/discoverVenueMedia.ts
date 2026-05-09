import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dbQuery, getDBClient } from "../lib/db";
import { robotsAllowsPath } from "../services/v1/eventIngestionService";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";
import { CORE10_MEDIA_SOURCES } from "../services/v1/venueMediaManifest";
import {
  assertMediaApplyTarget,
  type ClassifiedMediaCandidate,
  discoverMediaPageLinksFromHtml,
  discoverMediaCandidatesFromHtml,
  mediaDiscoveryUrls,
  selectVenueMediaSources,
  type VenueMediaSource,
  type VenueMediaSourceRow,
  validateVenueMediaImage
} from "../services/v1/venueMediaDiscovery";

type Args = {
  apply: boolean;
  core10: boolean;
  dryRun: boolean;
  market: string;
  limit: number;
  target?: string;
  verbose: boolean;
  reviewDir?: string;
  applyReviewed?: string;
};

type SupabaseStorageRuntime = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean }
      ): Promise<{ error: Error | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
};

type VenueDiscoveryResult = {
  venue: VenueMediaSource;
  candidates: ClassifiedMediaCandidate[];
  pagesFetched: number;
  pagesSkippedByRobots: number;
  pagesFailed: number;
  pagesVisited: string[];
};

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "backend/.env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

export function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    core10: argv.includes("--core10"),
    dryRun: argv.includes("--dry-run") || !apply,
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "10"),
    target: argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length),
    verbose: argv.includes("--verbose"),
    reviewDir: argv.find((arg) => arg.startsWith("--review-dir="))?.slice("--review-dir=".length),
    applyReviewed: argv.find((arg) => arg.startsWith("--apply-reviewed="))?.slice("--apply-reviewed=".length)
  };
}

async function getMarketId(market: string): Promise<string> {
  const result = await dbQuery<{ id: string }>(
    "SELECT id FROM markets WHERE id::text = $1 OR slug = $1 LIMIT 1",
    [market]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Market not found: ${market}`);
  return row.id;
}

export async function loadVenueWebsites(args: Args, marketId: string): Promise<VenueMediaSource[]> {
  const result = await dbQuery<VenueMediaSourceRow>(
    `
      SELECT
        v.id,
        v.name,
        v.market_id,
        COALESCE(
          v.metadata->>'website',
          v.metadata->>'website_url',
          v.metadata->>'foursquare_website',
          v.metadata->>'google_website'
        ) AS website_url
      FROM venues v
      WHERE v.market_id = $1::uuid
        ${PUBLIC_VENUE_SQL}
      ORDER BY v.name ASC
      LIMIT 500
    `,
    [marketId]
  );
  return selectVenueMediaSources(result.rows, CORE10_MEDIA_SOURCES, {
    coreOnly: args.core10,
    limit: args.limit
  });
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "NightloopMediaDiscovery/0.1 (+https://nightloop.app)"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function robotsStatus(url: string): Promise<"allowed" | "disallowed" | "unavailable"> {
  try {
    const parsed = new URL(url);
    const robots = await fetchText(`${parsed.origin}/robots.txt`);
    return robotsAllowsPath(robots, parsed.pathname) ? "allowed" : "disallowed";
  } catch {
    return "unavailable";
  }
}

export async function discoverForVenue(
  venue: VenueMediaSource,
  options: { maxPages?: number; discoverLinks?: boolean } = {}
): Promise<VenueDiscoveryResult> {
  const website = normalizeWebsite(venue.website_url);
  if (!website) {
    return {
      venue,
      candidates: [],
      pagesFetched: 0,
      pagesSkippedByRobots: 0,
      pagesFailed: 0,
      pagesVisited: []
    };
  }
  const candidates: ClassifiedMediaCandidate[] = [];
  const maxPages = options.maxPages ?? 25;
  const queue = [...mediaDiscoveryUrls(website)];
  const queued = new Set(queue);
  const visited = new Set<string>();
  let pagesFetched = 0;
  let pagesSkippedByRobots = 0;
  let pagesFailed = 0;

  while (queue.length > 0 && visited.size < maxPages) {
    const sourcePageUrl = queue.shift();
    if (!sourcePageUrl || visited.has(sourcePageUrl)) continue;
    visited.add(sourcePageUrl);
    const robots = await robotsStatus(sourcePageUrl);
    if (robots === "disallowed") {
      pagesSkippedByRobots += 1;
      continue;
    }

    try {
      const html = await fetchText(sourcePageUrl);
      pagesFetched += 1;
      candidates.push(...discoverMediaCandidatesFromHtml({
        venueId: venue.id,
        marketId: venue.market_id,
        venueName: venue.name,
        officialWebsiteUrl: website,
        sourcePageUrl,
        html,
        robotsStatus: robots
      }));

      if (options.discoverLinks !== false) {
        for (const link of discoverMediaPageLinksFromHtml({ html, sourcePageUrl })) {
          if (visited.has(link) || queued.has(link)) continue;
          queued.add(link);
          queue.push(link);
        }
      }
    } catch {
      pagesFailed += 1;
      // Missing media paths are expected during discovery.
    }
  }

  return {
    venue,
    candidates,
    pagesFetched,
    pagesSkippedByRobots,
    pagesFailed,
    pagesVisited: [...visited]
  };
}

export async function applyCandidates(candidates: ClassifiedMediaCandidate[]): Promise<void> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error("--apply requires SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const bucket = process.env.VENUE_MEDIA_BUCKET ?? "venue-media-approved";
  const nextSortOrderByVenue = new Map<string, number>();

  for (const candidate of candidates) {
    const sortOrder = nextSortOrderByVenue.get(candidate.venueId) ?? 0;
    nextSortOrderByVenue.set(candidate.venueId, sortOrder + 1);
    const stored = candidate.rightsStatus === "approved"
      ? await uploadApprovedCandidate(candidate, supabase, bucket)
      : null;
    const storedCandidate = stored
      ? {
          ...candidate,
          width: stored.width,
          height: stored.height,
          aspectRatio: stored.aspectRatio,
          contentHash: stored.contentHash
        }
      : candidate;

    await dbQuery(
      `
        INSERT INTO venue_media_candidates (
          venue_id,
          market_id,
          source_page_url,
          image_url,
          source_type,
          rights_status,
          rights_basis,
          proof_excerpt,
          robots_status,
          credit_text,
          credit_url,
          license_name,
          license_url,
          retrieved_at,
          width,
          height,
          aspect_ratio,
          content_category,
          content_hash,
          storage_path,
          metadata
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          NOW(), $14, $15, $16, $17, $18, $19, $20::jsonb
        )
        ON CONFLICT (venue_id, image_url)
        DO UPDATE SET
          rights_status = EXCLUDED.rights_status,
          rights_basis = EXCLUDED.rights_basis,
          proof_excerpt = EXCLUDED.proof_excerpt,
          robots_status = EXCLUDED.robots_status,
          storage_path = COALESCE(EXCLUDED.storage_path, venue_media_candidates.storage_path),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `,
      [
        storedCandidate.venueId,
        storedCandidate.marketId,
        storedCandidate.sourcePageUrl,
        storedCandidate.imageUrl,
        storedCandidate.sourceType,
        storedCandidate.rightsStatus,
        storedCandidate.rightsBasis,
        storedCandidate.proofExcerpt,
        storedCandidate.robotsStatus,
        storedCandidate.creditText,
        storedCandidate.creditUrl,
        storedCandidate.licenseName,
        storedCandidate.licenseUrl,
        storedCandidate.width ?? null,
        storedCandidate.height ?? null,
        storedCandidate.aspectRatio,
        storedCandidate.contentCategory,
        storedCandidate.contentHash,
        stored?.path ?? null,
        JSON.stringify({
          discovered_by: "build3_media_pipeline",
          storage_bucket: stored?.bucket ?? null
        })
      ]
    );

    if (storedCandidate.rightsStatus === "approved" && stored) {
      await dbQuery(
        `
          INSERT INTO venue_assets (
            venue_id,
            market_id,
            asset_type,
            url,
            alt_text,
            credit_text,
            credit_url,
            license_name,
            license_url,
            rights_status,
            source,
            is_approved,
            sort_order,
            metadata
          )
          VALUES ($1::uuid, $2::uuid, 'image', $3, $4, $5, $6, $7, $8, 'owned', 'venue_media_pipeline', true, $9, $10::jsonb)
          ON CONFLICT (venue_id, source, pipeline_original_image_url)
          WHERE source = 'venue_media_pipeline' AND pipeline_original_image_url IS NOT NULL
          DO UPDATE SET
            url = EXCLUDED.url,
            alt_text = EXCLUDED.alt_text,
            credit_text = EXCLUDED.credit_text,
            credit_url = EXCLUDED.credit_url,
            license_name = EXCLUDED.license_name,
            license_url = EXCLUDED.license_url,
            is_approved = true,
            sort_order = EXCLUDED.sort_order,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `,
        [
          storedCandidate.venueId,
          storedCandidate.marketId,
          stored.publicUrl,
          `${storedCandidate.venueName} venue photo`,
          storedCandidate.creditText,
          storedCandidate.creditUrl,
          storedCandidate.licenseName,
          storedCandidate.licenseUrl,
          sortOrder,
          JSON.stringify({
            source_page_url: storedCandidate.sourcePageUrl,
            original_image_url: storedCandidate.imageUrl,
            content_category: storedCandidate.contentCategory,
            content_hash: storedCandidate.contentHash,
            storage_bucket: stored.bucket,
            storage_path: stored.path
          })
        ]
      );
    }
  }
}

export async function loadReviewedCandidates(filePath: string): Promise<ClassifiedMediaCandidate[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed != null && Array.isArray((parsed as { candidates?: unknown }).candidates)
      ? (parsed as { candidates: unknown[] }).candidates
      : [];

  return candidates
    .filter((candidate): candidate is ClassifiedMediaCandidate => {
      if (!candidate || typeof candidate !== "object") return false;
      const value = candidate as Partial<ClassifiedMediaCandidate>;
      return Boolean(value.venueId && value.marketId && value.venueName && value.imageUrl && value.rightsStatus === "approved");
    });
}

export async function uploadApprovedCandidate(
  candidate: ClassifiedMediaCandidate,
  supabase: SupabaseStorageRuntime,
  bucket: string
): Promise<{ path: string; publicUrl: string; bucket: string; width: number; height: number; aspectRatio: number; contentHash: string }> {
  const response = await fetch(candidate.imageUrl);
  if (!response.ok) throw new Error(`Image fetch failed for ${candidate.venueName}: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(arrayBuffer);
  const validation = validateVenueMediaImage({ buffer, contentType });
  if (!validation.ok) {
    throw new Error(`Image validation failed for ${candidate.venueName}: ${validation.reason}`);
  }
  const storagePath = `${candidate.venueId}/${validation.contentHash}.${validation.extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return {
    path: storagePath,
    publicUrl: data.publicUrl,
    bucket,
    width: validation.width,
    height: validation.height,
    aspectRatio: validation.aspectRatio,
    contentHash: validation.contentHash
  };
}

function normalizeWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function summarize(candidates: ClassifiedMediaCandidate[]) {
  return {
    total: candidates.length,
    approved: candidates.filter((candidate) => candidate.rightsStatus === "approved").length,
    review: candidates.filter((candidate) => candidate.rightsStatus === "review").length,
    rejected: candidates.filter((candidate) => candidate.rightsStatus === "rejected").length
  };
}

function summarizeVenue(result: VenueDiscoveryResult) {
  const summary = summarize(result.candidates);
  return {
    name: result.venue.name,
    manifest_name: result.venue.manifest_name,
    website_url: result.venue.website_url,
    pages_fetched: result.pagesFetched,
    pages_skipped_by_robots: result.pagesSkippedByRobots,
    pages_failed: result.pagesFailed,
    pages_visited: result.pagesVisited.length,
    images_extracted: result.candidates.length,
    status: result.candidates.length === 0 ? "no_images_found" : "images_found",
    summary,
    top_rejection_reasons: topRejectionReasons(result.candidates)
  };
}

function topRejectionReasons(candidates: ClassifiedMediaCandidate[]) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.rightsStatus !== "rejected") continue;
    counts.set(candidate.rightsBasis, (counts.get(candidate.rightsBasis) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertMediaApplyTarget({
    apply: args.apply,
    target: args.target,
    supabaseProjectUrl: process.env.SUPABASE_PROJECT_URL,
    projectRefConfirmation: process.env.SUPABASE_PROJECT_REF_CONFIRM
  });
  const marketId = await getMarketId(args.market);
  const venues = await loadVenueWebsites(args, marketId);
  if (args.core10 && venues.length === 0) {
    throw new Error("Core 10 media discovery selected zero venues. Check staging seed data and media source aliases before publishing.");
  }
  const discoveryResults: VenueDiscoveryResult[] = [];

  for (const venue of venues) {
    discoveryResults.push(await discoverForVenue(venue));
  }

  const discoveredCandidates = discoveryResults.flatMap((result) => result.candidates);
  const candidates = args.applyReviewed
    ? await loadReviewedCandidates(args.applyReviewed)
    : discoveredCandidates;
  const selectedManifestNames = new Set(venues.map((venue) => venue.manifest_name).filter(Boolean));
  const missingCore10 = args.core10
    ? CORE10_MEDIA_SOURCES
        .filter((entry) => !selectedManifestNames.has(entry.canonicalName))
        .map((entry) => ({
          canonical_name: entry.canonicalName,
          aliases: entry.aliases,
          website_url: entry.websiteUrl,
          reason: "No approved staging venue row matched this media manifest entry."
        }))
    : [];

  const report = {
    mode: args.apply ? "apply" : "dry-run",
    target: args.target ?? null,
    market: args.market,
    selected_venue_count: venues.length,
    venues: venues.map((venue) => ({
      name: venue.name,
      manifest_name: venue.manifest_name,
      website_url: venue.website_url
    })),
    missing_core10_venues: missingCore10,
    venue_summaries: discoveryResults.map(summarizeVenue),
    summary: summarize(discoveredCandidates),
    applied_summary: args.applyReviewed ? summarize(candidates) : undefined,
    candidates: args.verbose ? candidates : candidates.map(compactCandidate)
  };

  if (args.reviewDir) {
    await writeReviewGallery(args.reviewDir, discoveredCandidates);
  }

  if (args.dryRun) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    await applyCandidates(candidates);
    console.log(JSON.stringify({ ...report, candidates: candidates.length }, null, 2));
  }
}

function compactCandidate(candidate: ClassifiedMediaCandidate) {
  return {
    venue_name: candidate.venueName,
    source_page_url: candidate.sourcePageUrl,
    image_url: candidate.imageUrl,
    source_type: candidate.sourceType,
    rights_status: candidate.rightsStatus,
    rights_basis: candidate.rightsBasis,
    robots_status: candidate.robotsStatus,
    content_category: candidate.contentCategory,
    credit_text: candidate.creditText,
    proof_excerpt: candidate.proofExcerpt
  };
}

async function writeReviewGallery(reviewDir: string, candidates: ClassifiedMediaCandidate[]): Promise<void> {
  await mkdir(reviewDir, { recursive: true });
  const reviewable = balancedReviewCandidates(candidates, 48);
  const cards: string[] = [];

  for (const [index, candidate] of reviewable.entries()) {
    const imageFile = `${String(index + 1).padStart(3, "0")}-${safeFileName(candidate.venueName)}.${extensionFromUrl(candidate.imageUrl)}`;
    const imagePath = path.join(reviewDir, imageFile);
    let imageRef = candidate.imageUrl;
    try {
      const response = await fetch(candidate.imageUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(imagePath, buffer);
        imageRef = imageFile;
      }
    } catch {
      imageRef = candidate.imageUrl;
    }

    cards.push(`
      <article class="card">
        <img src="${escapeHtml(imageRef)}" alt="">
        <h2>${escapeHtml(candidate.venueName)} <span>${escapeHtml(candidate.rightsStatus)}</span></h2>
        <p>${escapeHtml(candidate.contentCategory)} · ${escapeHtml(candidate.sourceType)}</p>
        <p>${escapeHtml(candidate.rightsBasis)}</p>
        <a href="${escapeHtml(candidate.imageUrl)}">${escapeHtml(candidate.imageUrl)}</a>
      </article>
    `);
  }

  await writeFile(path.join(reviewDir, "candidates.json"), JSON.stringify(reviewable, null, 2));
  await writeFile(path.join(reviewDir, "selected-apply.json"), JSON.stringify({ candidates: [] }, null, 2));
  await writeFile(
    path.join(reviewDir, "index.html"),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nightloop Venue Media Review</title>
  <style>
    body { margin: 24px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #111; color: #f7f2ff; }
    h1 { margin-bottom: 4px; }
    .note { margin: 0 0 20px; color: #cabee0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .card { background: #1c1427; border: 1px solid #3f3155; border-radius: 8px; padding: 12px; overflow: hidden; }
    img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #000; border-radius: 6px; }
    h2 { font-size: 16px; margin: 10px 0 6px; }
    span { color: #b985ff; font-size: 12px; text-transform: uppercase; }
    p, a { color: #cabee0; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Nightloop Venue Media Review</h1>
  <p class="note">${reviewable.length} balanced approved/review candidates, capped per venue. The first approved candidate per venue in selected-apply.json becomes that venue's primary app image.</p>
  <section class="grid">${cards.join("\n")}</section>
</body>
</html>`
  );
}

function balancedReviewCandidates(candidates: ClassifiedMediaCandidate[], perVenueLimit: number): ClassifiedMediaCandidate[] {
  const grouped = new Map<string, ClassifiedMediaCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.rightsStatus !== "approved" && candidate.rightsStatus !== "review") continue;
    const group = grouped.get(candidate.venueName) ?? [];
    group.push(candidate);
    grouped.set(candidate.venueName, group);
  }

  return [...grouped.entries()].flatMap(([, group]) =>
    group
      .sort((left, right) => reviewRank(left) - reviewRank(right))
      .slice(0, perVenueLimit)
  );
}

function reviewRank(candidate: ClassifiedMediaCandidate): number {
  let score = candidate.rightsStatus === "approved" ? 0 : 100;
  if (candidate.sourcePageUrl.match(/\b(gallery|photos|press|media)\b/i)) score -= 20;
  if (candidate.sourcePageUrl.match(/\b(private-events|events\/private)\b/i)) score += 20;
  if (candidate.sourceType === "srcset_image" || candidate.sourceType === "lazy_image") score -= 5;
  if (candidate.contentCategory === "stage" || candidate.contentCategory === "bar" || candidate.contentCategory === "exterior") score -= 5;
  if (candidate.contentCategory === "crowd_review") score += 20;
  return score;
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "venue";
}

function extensionFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
  } catch {
    // Fall through to jpg.
  }
  return "jpg";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[media:discover] ERROR:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await getDBClient().close?.();
    });
}
