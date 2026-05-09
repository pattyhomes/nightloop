import fs from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";
import type { DBClient } from "../lib/db";
import { dbQuery, dbTransaction, getDBClient } from "../lib/db";
import { findProviderDuplicateWarnings, normalizeProviderName } from "../services/v1/providerDedupe";

type CsvRow = Record<string, string>;
type DataSfRow = Record<string, unknown>;

type DataSfCandidate = {
  record_id: string;
  name: string;
  address: string;
  neighborhood: string | null;
  license_type: string | null;
  active_licenses: string | null;
  permit_status: string | null;
  operating_status: string | null;
  evidence_url: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: Record<string, unknown>;
};

type ManifestRow = {
  provider_record_id: string;
  name: string;
  action_bucket:
    | "likely_new"
    | "likely_duplicate"
    | "needs_google_verification"
    | "hold_manual"
    | "reject_non_nightlife";
  duplicate_warnings: string[];
  candidate: DataSfCandidate;
};

const DATASF_ENDPOINT = "https://data.sfgov.org/resource/86e8-rfem.json";
const NIGHTLIFE_KEYWORDS = [
  "bar",
  "club",
  "lounge",
  "karaoke",
  "cocktail",
  "music",
  "pub",
  "tavern",
  "saloon",
  "dance",
  "dj",
  "night",
  "cabaret"
];
const HOLD_KEYWORDS = ["hotel", "museum", "theater", "theatre", "restaurant", "cafe", "office", "gym", "school"];
const INCLUDE_OPERATING_STATUS = new Set(["likely_operating_city_registry", "web_verified_operating"]);

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--apply"),
    csvPath: argv.find((arg) => arg.startsWith("--csv="))?.slice("--csv=".length),
    liveApi: argv.includes("--api"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "0"),
    summaryOnly: argv.includes("--summary-only")
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
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cells) => {
    const output: CsvRow = {};
    for (const [index, header] of headers.entries()) output[header] = (cells[index] ?? "").trim();
    return output;
  });
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function coordinateFromPoint(value: unknown): { latitude: number | null; longitude: number | null } {
  if (typeof value === "object" && value !== null && "coordinates" in value) {
    const coords = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return { longitude: Number(coords[0]), latitude: Number(coords[1]) };
    }
  }
  if (typeof value === "string") {
    const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) return { longitude: Number(match[1]), latitude: Number(match[2]) };
  }
  return { latitude: null, longitude: null };
}

function rowValue(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = textValue(row[key]);
    if (value) return value;
  }
  return null;
}

function slug(value: string): string {
  return normalizeProviderName(value).replace(/\s+/g, "-").slice(0, 80) || "venue";
}

function toCandidate(row: DataSfRow): DataSfCandidate | null {
  const name = rowValue(row, "DBA Name", "dba_name");
  const address = rowValue(row, "Street Address", "street_address");
  if (!name || !address) return null;

  const coordinates = coordinateFromPoint(row.Point ?? row.point);
  const permit = rowValue(row, "Permit Number", "permit_number") ?? "unknown-permit";
  const ban = rowValue(row, "BAN", "ban") ?? "unknown-ban";
  const activeLicenses = rowValue(row, "Active Licenses", "active_licenses");
  const licenseType = rowValue(row, "License Type", "license_type");

  return {
    record_id: `${permit}:${ban}`,
    name,
    address,
    neighborhood: rowValue(row, "analysis_neighborhood", "Analysis Neighborhood"),
    license_type: licenseType,
    active_licenses: activeLicenses,
    permit_status: rowValue(row, "Permit Status", "permit_status"),
    operating_status: rowValue(row, "operating_status"),
    evidence_url: rowValue(row, "evidence_url"),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    raw: row
  };
}

function classify(candidate: DataSfCandidate): ManifestRow["action_bucket"] {
  const haystack = `${candidate.name} ${candidate.license_type ?? ""} ${candidate.active_licenses ?? ""}`.toLowerCase();
  const operating = candidate.operating_status;
  const isPoe = candidate.active_licenses?.includes("POE") || candidate.license_type === "Place of Entertainment";
  const keywordHit = NIGHTLIFE_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const holdKeyword = HOLD_KEYWORDS.some((keyword) => haystack.includes(keyword));

  if (operating && !INCLUDE_OPERATING_STATUS.has(operating)) return "hold_manual";
  if (!isPoe) return "hold_manual";
  if (holdKeyword && !keywordHit) return "reject_non_nightlife";
  if (!keywordHit) return "needs_google_verification";
  if (candidate.latitude == null || candidate.longitude == null) return "needs_google_verification";
  return "likely_new";
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

async function loadRows(args: ReturnType<typeof parseArgs>): Promise<DataSfRow[]> {
  if (args.csvPath) {
    return parseCsv(fs.readFileSync(path.resolve(args.csvPath), "utf8"));
  }
  if (!args.liveApi) {
    throw new Error("Pass --csv=/path/to/review.csv or --api. Default mode never calls DataSF live API implicitly.");
  }
  const url = new URL(DATASF_ENDPOINT);
  url.searchParams.set("$limit", "50000");
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`DataSF API returned ${response.status}`);
  return (await response.json()) as DataSfRow[];
}

async function buildManifest(client: DBClient, marketId: string, candidates: DataSfCandidate[]): Promise<ManifestRow[]> {
  const manifest: ManifestRow[] = [];
  for (const candidate of candidates) {
    const dedupe = await findProviderDuplicateWarnings(client, {
      marketId,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      dataSfRecordId: candidate.record_id,
      address: candidate.address
    });
    const bucket = dedupe.blockingDuplicate ? "likely_duplicate" : classify(candidate);
    manifest.push({
      provider_record_id: `datasf-poe:${candidate.record_id}:${slug(candidate.name)}`,
      name: candidate.name,
      action_bucket: dedupe.warnings.length > 0 && bucket === "likely_new" ? "needs_google_verification" : bucket,
      duplicate_warnings: dedupe.warnings,
      candidate
    });
  }
  return manifest;
}

async function applyManifest(client: DBClient, marketId: string, manifest: ManifestRow[]) {
  let created = 0;
  let skippedExisting = 0;
  let skippedRejected = 0;

  for (const item of manifest) {
    if (item.action_bucket === "reject_non_nightlife") {
      skippedRejected += 1;
      continue;
    }

    const exists = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM provider_records
          WHERE provider = 'datasf_poe'
            AND provider_record_id = $1
            AND market_id = $2::uuid
        ) AS exists
      `,
      [item.provider_record_id, marketId]
    );
    if (exists.rows[0]?.exists) {
      skippedExisting += 1;
      continue;
    }

    const record = await client.query<{ id: string }>(
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
        VALUES ('datasf_poe', $1, 'venue', $2::uuid, NULL, $3::jsonb, $4::jsonb, NULL, 'candidate', $5::jsonb, $6::jsonb)
        RETURNING id
      `,
      [
        item.provider_record_id,
        marketId,
        JSON.stringify(item.candidate.raw),
        JSON.stringify({
          datasf_poe_record_id: item.candidate.record_id,
          name: item.candidate.name,
          address: item.candidate.address,
          neighborhood: item.candidate.neighborhood,
          latitude: item.candidate.latitude,
          longitude: item.candidate.longitude,
          license_type: item.candidate.license_type,
          active_licenses: item.candidate.active_licenses,
          operating_status: item.candidate.operating_status,
          evidence_url: item.candidate.evidence_url
        }),
        JSON.stringify({
          provider_terms: "https://data.sfgov.org/terms-of-use",
          source: "DataSF Active Entertainment Permits",
          photos_used: false,
          reviews_used: false
        }),
        JSON.stringify({
          provider: "DataSF Active Entertainment Permits",
          url: DATASF_ENDPOINT
        })
      ]
    );

    await client.query(
      `
        INSERT INTO venue_review_items (provider_record_id, venue_id, market_id, proposed_changes)
        VALUES ($1::uuid, NULL, $2::uuid, $3::jsonb)
      `,
      [
        record.rows[0]?.id,
        marketId,
        JSON.stringify({
          datasf_candidate: item.candidate,
          review_context: {
            action_bucket: item.action_bucket,
            approval_default: "manual_hold_for_imperfect_matches",
            next_step:
              item.action_bucket === "likely_duplicate"
                ? "compare_against_existing_venue"
                : "verify_with_google_or_manual_source"
          },
          duplicate_warnings: item.duplicate_warnings,
          proposed_changes: {
            create_venue: {
              name: item.candidate.name,
              canonical_type: "bar",
              neighborhood: item.candidate.neighborhood,
              latitude: item.candidate.latitude,
              longitude: item.candidate.longitude,
              metadata: {
                address: item.candidate.address,
                datasf_poe_record_id: item.candidate.record_id,
                datasf_license_type: item.candidate.license_type,
                datasf_active_licenses: item.candidate.active_licenses,
                source_confidence: "city_permit_evidence"
              }
            }
          }
        })
      ]
    );
    created += 1;
  }

  return { created, skippedExisting, skippedRejected };
}

async function main() {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const rawRows = await loadRows(args);
  const candidates = rawRows.map(toCandidate).filter((row): row is DataSfCandidate => Boolean(row));
  const limited = candidates.slice(0, args.limit > 0 ? args.limit : undefined);
  const marketId = await getMarketId(args.market);
  const manifest = await dbTransaction((client) => buildManifest(client, marketId, limited));
  const summary = manifest.reduce<Record<string, number>>((acc, row) => {
    acc[row.action_bucket] = (acc[row.action_bucket] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    summary,
    manifest: args.summaryOnly ? undefined : manifest
  }, null, 2));

  if (!args.apply) {
    console.log(`[datasf-poe] Dry-run complete. ${manifest.length} candidate(s), no rows written.`);
    return;
  }

  const result = await dbTransaction((client) => applyManifest(client, marketId, manifest));
  console.log(
    `[datasf-poe] Apply complete. Created=${result.created}; ` +
      `skipped_existing=${result.skippedExisting}; skipped_rejected=${result.skippedRejected}.`
  );
}

main().catch((error) => {
  console.error("[datasf-poe] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
