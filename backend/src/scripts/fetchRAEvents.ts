/**
 * Runnable script: fetch Resident Advisor SF events and ingest them as signals.
 *
 * Usage:
 *   cd backend
 *   npx tsx src/scripts/fetchRAEvents.ts
 *
 * Works with the in-memory DB (default in dev — no DATABASE_URL required) and
 * with real Postgres when DATABASE_URL is set.
 *
 * What it does:
 *   1. Fetches upcoming SF/Oakland events from RA's public GraphQL API
 *   2. Matches each event's venue to a known Nightloop venue by name
 *   3. Ingests matched events as event_report signals (source: "scraper")
 *   4. Prints a summary of matched / unmatched venues and any errors
 */

import { fetchAndIngestRAEvents } from "../services/raEventFetchService";

async function main(): Promise<void> {
  console.log("[ra-ingest] Fetching SF events from Resident Advisor...\n");

  let summary;
  try {
    summary = await fetchAndIngestRAEvents();
  } catch (error) {
    console.error("[ra-ingest] Fatal error fetching from RA:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`[ra-ingest] Fetched events  : ${summary.fetchedEvents}`);
  console.log(`[ra-ingest] Matched + ingested: ${summary.matchedEvents}`);
  console.log(`[ra-ingest] Unmatched venues : ${summary.unmatchedVenues.length}`);

  if (summary.matchedEvents > 0) {
    console.log("\n[ra-ingest] Ingested signals:");
    for (const result of summary.ingested) {
      const meta = result.signal.payload as Record<string, unknown>;
      const eventName = typeof meta.eventName === "string" ? meta.eventName : "(unknown)";
      const raVenue = typeof meta.raVenueName === "string" ? meta.raVenueName : "(unknown)";
      const matchType = typeof meta.matchType === "string" ? meta.matchType : "";
      console.log(
        `  ✓ ${eventName.slice(0, 60)}` +
        `\n    → venue: ${result.signal.venueId} (RA: "${raVenue}", ${matchType} match)` +
        `\n    → score after ingest: ${result.snapshot.score.toFixed(4)}`
      );
    }
  }

  if (summary.unmatchedVenues.length > 0) {
    console.log("\n[ra-ingest] Unmatched RA venue names (not yet in Nightloop):");
    for (const name of summary.unmatchedVenues) {
      console.log(`  - ${name}`);
    }
  }

  if (summary.errors.length > 0) {
    console.log("\n[ra-ingest] Errors:");
    for (const { eventTitle, error } of summary.errors) {
      console.error(`  ✗ ${eventTitle.slice(0, 60)}: ${error}`);
    }
  }

  console.log("\n[ra-ingest] Done.");
}

main().catch((error) => {
  console.error("[ra-ingest] Unhandled error:", error);
  process.exit(1);
});
