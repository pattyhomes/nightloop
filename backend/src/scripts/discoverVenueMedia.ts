import path from "path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dbQuery, getDBClient } from "../lib/db";
import { robotsAllowsPath } from "../services/v1/eventIngestionService";
import { PUBLIC_VENUE_SQL } from "../services/v1/recommendationTrust";
import {
  type ClassifiedMediaCandidate,
  discoverMediaCandidatesFromHtml,
  mediaDiscoveryUrls
} from "../services/v1/venueMediaDiscovery";

type Args = {
  apply: boolean;
  core10: boolean;
  dryRun: boolean;
  market: string;
  limit: number;
};

type VenueWebsiteRow = {
  id: string;
  name: string;
  market_id: string;
  website_url: string;
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

const CORE10 = [
  "1015 Folsom",
  "Audio SF",
  "Novela",
  "Black Cat",
  "Bottom of the Hill",
  "Lone Star Saloon",
  "Monarch SF",
  "Public Works",
  "Cafe Du Nord",
  "Make-Out Room"
];

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "backend/.env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    core10: argv.includes("--core10"),
    dryRun: argv.includes("--dry-run") || !apply,
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "10")
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

async function loadVenueWebsites(args: Args, marketId: string): Promise<VenueWebsiteRow[]> {
  const coreNames = args.core10 ? CORE10 : [];
  const result = await dbQuery<VenueWebsiteRow>(
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
        AND (
          cardinality($2::text[]) = 0
          OR lower(v.name) = ANY(SELECT lower(unnest($2::text[])))
        )
        AND COALESCE(
          v.metadata->>'website',
          v.metadata->>'website_url',
          v.metadata->>'foursquare_website',
          v.metadata->>'google_website'
        ) IS NOT NULL
      ORDER BY CASE
        WHEN cardinality($2::text[]) = 0 THEN 0
        ELSE array_position($2::text[], v.name)
      END NULLS LAST, v.name ASC
      LIMIT $3
    `,
    [marketId, coreNames, Math.max(1, Math.min(100, args.limit))]
  );
  return result.rows.filter((row) => normalizeWebsite(row.website_url));
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

async function discoverForVenue(venue: VenueWebsiteRow): Promise<ClassifiedMediaCandidate[]> {
  const website = normalizeWebsite(venue.website_url);
  if (!website) return [];
  const candidates: ClassifiedMediaCandidate[] = [];

  for (const sourcePageUrl of mediaDiscoveryUrls(website)) {
    const robots = await robotsStatus(sourcePageUrl);
    if (robots === "disallowed") {
      candidates.push(...discoverMediaCandidatesFromHtml({
        venueId: venue.id,
        marketId: venue.market_id,
        venueName: venue.name,
        officialWebsiteUrl: website,
        sourcePageUrl,
        html: "",
        robotsStatus: robots
      }));
      continue;
    }

    try {
      const html = await fetchText(sourcePageUrl);
      candidates.push(...discoverMediaCandidatesFromHtml({
        venueId: venue.id,
        marketId: venue.market_id,
        venueName: venue.name,
        officialWebsiteUrl: website,
        sourcePageUrl,
        html,
        robotsStatus: robots
      }));
    } catch {
      // Missing media paths are expected during discovery.
    }
  }

  return candidates;
}

async function applyCandidates(candidates: ClassifiedMediaCandidate[]): Promise<void> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error("--apply requires SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const bucket = process.env.VENUE_MEDIA_BUCKET ?? "venue-media";

  for (const candidate of candidates) {
    const storedUrl = candidate.rightsStatus === "approved"
      ? await uploadApprovedCandidate(candidate, supabase, bucket)
      : null;

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
        candidate.venueId,
        candidate.marketId,
        candidate.sourcePageUrl,
        candidate.imageUrl,
        candidate.sourceType,
        candidate.rightsStatus,
        candidate.rightsBasis,
        candidate.proofExcerpt,
        candidate.robotsStatus,
        candidate.creditText,
        candidate.creditUrl,
        candidate.licenseName,
        candidate.licenseUrl,
        candidate.width ?? null,
        candidate.height ?? null,
        candidate.aspectRatio,
        candidate.contentCategory,
        candidate.contentHash,
        storedUrl?.path ?? null,
        JSON.stringify({ discovered_by: "build3_media_pipeline" })
      ]
    );

    if (candidate.rightsStatus === "approved" && storedUrl) {
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
          VALUES ($1::uuid, $2::uuid, 'image', $3, $4, $5, $6, $7, $8, 'owned', 'venue_media_pipeline', true, 0, $9::jsonb)
          ON CONFLICT DO NOTHING
        `,
        [
          candidate.venueId,
          candidate.marketId,
          storedUrl.publicUrl,
          `${candidate.venueName} venue photo`,
          candidate.creditText,
          candidate.creditUrl,
          candidate.licenseName,
          candidate.licenseUrl,
          JSON.stringify({
            source_page_url: candidate.sourcePageUrl,
            original_image_url: candidate.imageUrl,
            content_category: candidate.contentCategory
          })
        ]
      );
    }
  }
}

async function uploadApprovedCandidate(
  candidate: ClassifiedMediaCandidate,
  supabase: SupabaseStorageRuntime,
  bucket: string
): Promise<{ path: string; publicUrl: string }> {
  const response = await fetch(candidate.imageUrl);
  if (!response.ok) throw new Error(`Image fetch failed for ${candidate.venueName}: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${candidate.venueId}/${candidate.contentHash}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { path: storagePath, publicUrl: data.publicUrl };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const venues = await loadVenueWebsites(args, marketId);
  const candidates: ClassifiedMediaCandidate[] = [];

  for (const venue of venues) {
    candidates.push(...await discoverForVenue(venue));
  }

  const report = {
    mode: args.apply ? "apply" : "dry-run",
    market: args.market,
    venues: venues.map((venue) => venue.name),
    summary: summarize(candidates),
    candidates
  };

  if (args.dryRun) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    await applyCandidates(candidates);
    console.log(JSON.stringify({ ...report, candidates: candidates.length }, null, 2));
  }
}

main()
  .catch((error) => {
    console.error("[media:discover] ERROR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDBClient().close?.();
  });
