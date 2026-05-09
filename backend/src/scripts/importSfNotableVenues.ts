import fs from "fs";
import path from "path";
import { loadConfig } from "../lib/config";
import type { DBClient } from "../lib/db";
import { dbQuery, dbTransaction, getDBClient } from "../lib/db";
import { findProviderDuplicateWarnings, normalizeProviderName } from "../services/v1/providerDedupe";

type CsvRow = Record<string, string>;

type CuratedCandidate = {
  name: string;
  canonical_type: string;
  neighborhood: string;
  notability_reason: string;
  source_note: string;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  alias_names: string | null;
  notes: string | null;
};

type CandidateManifestRow = {
  provider_record_id: string;
  name: string;
  action_bucket: "likely_new" | "likely_duplicate" | "missing_coordinates" | "needs_google_verification";
  duplicate_warnings: string[];
  candidate: CuratedCandidate;
};

const REQUIRED_COLUMNS = ["name", "canonical_type", "neighborhood", "notability_reason", "source_note"];

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    csvPath:
      argv.find((arg) => arg.startsWith("--csv="))?.slice("--csv=".length) ??
      path.resolve(process.cwd(), "../data/venues/sf_notable_candidates.csv"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "0")
  };
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cells) => {
    const output: CsvRow = {};
    for (const [index, header] of headers.entries()) {
      output[header] = (cells[index] ?? "").trim();
    }
    return output;
  });
}

function requiredText(row: CsvRow, column: string): string {
  const value = row[column]?.trim();
  if (!value) {
    throw new Error(`Missing required column "${column}" for row: ${JSON.stringify(row)}`);
  }
  return value;
}

function optionalNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Invalid numeric value: ${value}`);
  return numeric;
}

function optionalText(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function toCandidate(row: CsvRow): CuratedCandidate {
  for (const column of REQUIRED_COLUMNS) requiredText(row, column);
  return {
    name: requiredText(row, "name"),
    canonical_type: requiredText(row, "canonical_type"),
    neighborhood: requiredText(row, "neighborhood"),
    notability_reason: requiredText(row, "notability_reason"),
    source_note: requiredText(row, "source_note"),
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    source_url: optionalText(row.source_url),
    alias_names: optionalText(row.alias_names),
    notes: optionalText(row.notes)
  };
}

function slugify(value: string): string {
  return normalizeProviderName(value).replace(/\s+/g, "-").slice(0, 80) || "venue";
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

async function buildManifest(
  client: DBClient,
  marketId: string,
  candidates: CuratedCandidate[]
): Promise<CandidateManifestRow[]> {
  const rows: CandidateManifestRow[] = [];
  for (const candidate of candidates) {
    const dedupe = await findProviderDuplicateWarnings(client, {
      marketId,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude
    });
    const action_bucket =
      dedupe.blockingDuplicate
        ? "likely_duplicate"
        : candidate.latitude == null || candidate.longitude == null
          ? "missing_coordinates"
          : dedupe.warnings.length > 0
            ? "needs_google_verification"
            : "likely_new";

    rows.push({
      provider_record_id: `sf-notable:${slugify(candidate.name)}`,
      name: candidate.name,
      action_bucket,
      duplicate_warnings: dedupe.warnings,
      candidate
    });
  }
  return rows;
}

async function applyManifest(client: DBClient, marketId: string, manifest: CandidateManifestRow[]) {
  let created = 0;
  let skippedExisting = 0;

  for (const item of manifest) {
    const existing = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM provider_records
          WHERE provider = 'manual'
            AND provider_record_id = $1
            AND market_id = $2::uuid
        ) AS exists
      `,
      [item.provider_record_id, marketId]
    );
    if (existing.rows[0]?.exists) {
      skippedExisting += 1;
      continue;
    }

    const providerRecord = await client.query<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status,
          license,
          attribution
        )
        VALUES (
          'manual',
          $1,
          'venue',
          $2::uuid,
          NULL,
          $3::jsonb,
          $4::jsonb,
          NULL,
          'candidate',
          $5::jsonb,
          $6::jsonb
        )
        RETURNING id
      `,
      [
        item.provider_record_id,
        marketId,
        JSON.stringify({
          source: "sf_notable_curated_csv",
          candidate: item.candidate,
          action_bucket: item.action_bucket,
          duplicate_warnings: item.duplicate_warnings
        }),
        JSON.stringify(item.candidate),
        JSON.stringify({
          provider_terms: "manual curated ops list",
          photos_used: false,
          reviews_used: false
        }),
        JSON.stringify({
          provider: "Nightloop curated SF notable list",
          source_note: item.candidate.source_note
        })
      ]
    );

    await client.query(
      `
        INSERT INTO venue_review_items (
          provider_record_id,
          venue_id,
          market_id,
          proposed_changes
        )
        VALUES ($1::uuid, NULL, $2::uuid, $3::jsonb)
      `,
      [
        providerRecord.rows[0]?.id,
        marketId,
        JSON.stringify({
          curated_candidate: item.candidate,
          review_context: {
            action_bucket: item.action_bucket,
            approval_default: "manual_hold_for_imperfect_matches",
            next_step:
              item.action_bucket === "likely_duplicate"
                ? "compare_against_existing_venue"
                : "run_google_curated_qa_or_manually_verify"
          },
          duplicate_warnings: item.duplicate_warnings
        })
      ]
    );
    created += 1;
  }

  return { created, skippedExisting };
}

async function main() {
  loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(args.csvPath);
  const csvRows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const candidates = csvRows.map(toCandidate).slice(0, args.limit > 0 ? args.limit : undefined);
  const marketId = await getMarketId(args.market);
  const manifest = await dbTransaction((client) => buildManifest(client, marketId, candidates));

  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", market_id: marketId, manifest }, null, 2));

  if (!args.apply) {
    console.log(`[sf-notable] Dry-run complete. ${manifest.length} candidate(s), no rows written.`);
    return;
  }

  const result = await dbTransaction((client) => applyManifest(client, marketId, manifest));
  console.log(`[sf-notable] Apply complete. Created=${result.created}; skipped_existing=${result.skippedExisting}.`);
}

main().catch((error) => {
  console.error("[sf-notable] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
