import path from "path";
import { config as loadDotenv } from "dotenv";
import { getDBClient } from "../lib/db";

type NycSlaRow = {
  dba?: string;
  legalname?: string;
  actualaddressofpremises?: string;
  city?: string;
  premisescounty?: string;
  description?: string;
  georeference?: {
    type?: string;
    coordinates?: [number, number];
  };
  expirationdate?: string;
  originalissuedate?: string;
};

const NYC_SLA_ENDPOINT = "https://data.ny.gov/resource/9s3h-dpkz.json";
const NYC_COUNTIES = ["New York", "Kings", "Queens", "Bronx", "Richmond"];
const NIGHTLIFE_DESCRIPTIONS = [
  "Club",
  "Cabaret",
  "Bottle Club",
  "Food & Beverage Business",
  "Additional Bar"
];

function parseArgs(argv: string[]) {
  return {
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "50000"),
    examples: Number(argv.find((arg) => arg.startsWith("--examples="))?.slice("--examples=".length) ?? "20")
  };
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildUrl(limit: number): string {
  const url = new URL(NYC_SLA_ENDPOINT);
  const counties = NYC_COUNTIES.map((county) => `'${escapeSoql(county)}'`).join(",");
  const descriptions = NIGHTLIFE_DESCRIPTIONS.map((description) => `'${escapeSoql(description)}'`).join(",");
  url.searchParams.set("$limit", String(Math.max(1, Math.min(50000, limit))));
  url.searchParams.set(
    "$where",
    `premisescounty in(${counties}) AND description in(${descriptions})`
  );
  url.searchParams.set(
    "$select",
    "dba,legalname,actualaddressofpremises,city,premisescounty,description,georeference,expirationdate,originalissuedate"
  );
  return url.toString();
}

function hasCoordinates(row: NycSlaRow): boolean {
  return Array.isArray(row.georeference?.coordinates) && row.georeference.coordinates.length >= 2;
}

async function main() {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const response = await fetch(buildUrl(args.limit));
  if (!response.ok) throw new Error(`NY SLA API returned ${response.status}`);
  const rows = (await response.json()) as NycSlaRow[];
  const byDescription = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.description ?? "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const byCounty = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.premisescounty ?? "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const missingGeoreference = rows.filter((row) => !hasCoordinates(row)).length;
  const noisyExamples = rows
    .filter((row) => row.description === "Food & Beverage Business" || row.description === "Additional Bar")
    .slice(0, args.examples)
    .map((row) => ({
      name: row.dba ?? row.legalname ?? "Unnamed",
      address: row.actualaddressofpremises ?? null,
      city: row.city ?? null,
      county: row.premisescounty ?? null,
      description: row.description ?? null,
      has_georeference: hasCoordinates(row)
    }));

  console.log(JSON.stringify({
    mode: "dry-run",
    source: NYC_SLA_ENDPOINT,
    note: "NYC SLA is broad licensing evidence only. This script never writes public venues in Phase 5.6.",
    total_candidates: rows.length,
    missing_georeference: missingGeoreference,
    by_description: byDescription,
    by_county: byCounty,
    noise_warning: "Food & Beverage Business and Additional Bar are broad and require curated filters plus provider verification before launch.",
    examples: noisyExamples
  }, null, 2));
}

main().catch((error) => {
  console.error("[nyc-sla] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
