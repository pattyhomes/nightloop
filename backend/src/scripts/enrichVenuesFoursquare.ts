/**
 * Runnable script: enrich Nightloop venues with Foursquare Places data.
 *
 * Usage
 * ─────
 *   cd backend
 *   npx tsx src/scripts/enrichVenuesFoursquare.ts
 *
 * Or via npm:
 *   npm run enrich:foursquare
 *
 * Required environment
 * ────────────────────
 *   FOURSQUARE_API_KEY  — your Foursquare Places API v3 key.
 *                         Obtain at https://foursquare.com/developers/app
 *                         Copy backend/.env.example → backend/.env.local
 *                         and fill in the value.
 *
 * Optional environment
 * ────────────────────
 *   DATABASE_URL        — Postgres connection string. When set, enrichment
 *                         data is persisted to the `venue_enrichments` table.
 *                         Without it the script runs as a dry-run: data is
 *                         fetched and printed but not stored.
 *
 * What it does
 * ────────────
 *   1. Searches Foursquare for each known Nightloop venue by name + coordinates.
 *   2. Scores candidates and accepts the best match above the confidence threshold.
 *   3. Fetches full place details for matched venues.
 *   4. Persists enrichment data in `venue_enrichments` (upsert, one row per venue).
 *   5. Prints a structured summary: matched / skipped / stored / errors.
 */

import { enrichAllVenues } from "../services/foursquareEnrichmentService";

function requireApiKey(): string {
  const key = process.env.FOURSQUARE_API_KEY;
  if (!key || key.trim().length === 0) {
    console.error(
      "\n[fsq-enrich] ERROR: FOURSQUARE_API_KEY is not set.\n" +
      "  1. Copy backend/.env.example to backend/.env.local\n" +
      "  2. Set FOURSQUARE_API_KEY=<your key> in .env.local\n" +
      "  3. Obtain a key at https://foursquare.com/developers/app\n"
    );
    process.exit(1);
  }
  return key.trim();
}

async function main(): Promise<void> {
  const apiKey = requireApiKey();

  const dbMode = process.env.DATABASE_URL ? "PostgreSQL (enrichments will be persisted)" : "in-memory (dry-run — set DATABASE_URL to persist)";
  console.log(`[fsq-enrich] Starting Foursquare venue enrichment`);
  console.log(`[fsq-enrich] DB mode : ${dbMode}\n`);

  let summary;
  try {
    summary = await enrichAllVenues(apiKey);
  } catch (error) {
    console.error("[fsq-enrich] Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`[fsq-enrich] Venues attempted : ${summary.attempted}`);
  console.log(`[fsq-enrich] Matched          : ${summary.matched}`);
  console.log(`[fsq-enrich] Stored in DB     : ${summary.stored}`);
  console.log(`[fsq-enrich] Skipped (no match): ${summary.skipped}`);
  console.log(`[fsq-enrich] Errors           : ${summary.errors.length}`);

  if (summary.results.length > 0) {
    console.log("\n[fsq-enrich] Matched venues:");
    for (const r of summary.results) {
      const pop = r.popularity !== undefined ? ` pop=${r.popularity.toFixed(2)}` : "";
      const open = r.openNow !== undefined ? (r.openNow ? " open=yes" : " open=no") : "";
      const stored = r.stored ? "✓ stored" : "⚠ not stored (no DB UUID found)";
      console.log(
        `  [${r.matchType}] ${r.venueName.padEnd(35)} → ${r.fsqId}` +
        `  [${r.categories.join(", ") || "no categories"}]` +
        `${pop}${open}  ${stored}`
      );
    }
  }

  if (summary.errors.length > 0) {
    console.log("\n[fsq-enrich] Errors:");
    for (const { venueName, error } of summary.errors) {
      console.error(`  ✗ ${venueName}: ${error}`);
    }
  }

  console.log("\n[fsq-enrich] Done.");
}

main().catch((error) => {
  console.error("[fsq-enrich] Unhandled error:", error);
  process.exit(1);
});
