import { dbQuery } from "../../lib/db";

export type ProviderProvenance =
  | "nightloop_owned"
  | "manual_curated"
  | "google_verified"
  | "google_derived";

export type ProviderProvenanceRisk = "low" | "review_before_non_google_map";

export type ProviderProvenanceVenueRow = {
  id: string;
  name: string;
  source: string | null;
  metadata: Record<string, unknown>;
  google_provider_records: number;
  google_approved_reviews: number;
};

export type VenueProvenanceClassification = {
  id: string;
  name: string;
  source: string | null;
  overall: ProviderProvenance;
  risk: ProviderProvenanceRisk;
  fields: {
    identity: ProviderProvenance;
    coordinates: ProviderProvenance;
    address: ProviderProvenance;
    type: ProviderProvenance;
    provider_id: ProviderProvenance | null;
  };
  evidence: string[];
};

export type ProviderProvenanceAudit = {
  generated_at: string;
  summary: Record<ProviderProvenance | ProviderProvenanceRisk | "total", number>;
  examples: VenueProvenanceClassification[];
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasGoogleProviderEvidence(row: ProviderProvenanceVenueRow): boolean {
  return Boolean(textValue(row.metadata.google_place_id)) ||
    row.google_provider_records > 0 ||
    row.google_approved_reviews > 0;
}

function hasGoogleDerivedField(row: ProviderProvenanceVenueRow): boolean {
  return row.source === "provider:google_places" ||
    Boolean(textValue(row.metadata.google_formatted_address)) ||
    row.metadata.coordinate_source === "google_places" ||
    row.metadata.name_source === "google_places" ||
    row.metadata.type_source === "google_places";
}

function baseProvenance(row: ProviderProvenanceVenueRow): ProviderProvenance {
  if (row.source?.startsWith("curated:") || row.source === "manual") {
    return "manual_curated";
  }
  return "nightloop_owned";
}

export function classifyVenueProvenance(row: ProviderProvenanceVenueRow): VenueProvenanceClassification {
  const base = baseProvenance(row);
  const googleEvidence = hasGoogleProviderEvidence(row);
  const googleDerived = hasGoogleDerivedField(row);
  const providerCreated = row.source === "provider:google_places";
  const fieldSource = (key: string, fallback: ProviderProvenance): ProviderProvenance =>
    row.metadata[key] === "google_places" || providerCreated ? "google_derived" : fallback;

  const fields = {
    identity: fieldSource("name_source", base),
    coordinates: fieldSource("coordinate_source", base),
    address: textValue(row.metadata.google_formatted_address) || providerCreated ? "google_derived" as const : base,
    type: fieldSource("type_source", base),
    provider_id: googleEvidence ? "google_verified" as const : null
  };
  const overall: ProviderProvenance = googleDerived
    ? "google_derived"
    : googleEvidence
      ? "google_verified"
      : base;
  const evidence = [
    ...(row.source ? [`source:${row.source}`] : []),
    ...(textValue(row.metadata.google_place_id) ? ["metadata.google_place_id"] : []),
    ...(textValue(row.metadata.google_formatted_address) ? ["metadata.google_formatted_address"] : []),
    ...(row.google_provider_records > 0 ? [`google_provider_records:${row.google_provider_records}`] : []),
    ...(row.google_approved_reviews > 0 ? [`google_approved_reviews:${row.google_approved_reviews}`] : [])
  ];

  return {
    id: row.id,
    name: row.name,
    source: row.source,
    overall,
    risk: overall === "google_derived" ? "review_before_non_google_map" : "low",
    fields,
    evidence
  };
}

export function buildProviderProvenanceAudit(rows: ProviderProvenanceVenueRow[]): ProviderProvenanceAudit {
  const classifications = rows.map(classifyVenueProvenance);
  const summary: ProviderProvenanceAudit["summary"] = {
    total: rows.length,
    nightloop_owned: 0,
    manual_curated: 0,
    google_verified: 0,
    google_derived: 0,
    low: 0,
    review_before_non_google_map: 0
  };

  for (const item of classifications) {
    summary[item.overall] += 1;
    summary[item.risk] += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    summary,
    examples: classifications
      .filter((item) => item.risk === "review_before_non_google_map" || item.overall === "google_verified")
      .slice(0, 20)
  };
}

export async function loadProviderProvenanceAudit(): Promise<ProviderProvenanceAudit> {
  const result = await dbQuery<ProviderProvenanceVenueRow>(
    `
      SELECT
        v.id,
        v.name,
        v.source,
        COALESCE(v.metadata, '{}'::jsonb) AS metadata,
        COUNT(pr.id) FILTER (WHERE pr.provider = 'google_places')::int AS google_provider_records,
        COUNT(vri.id) FILTER (
          WHERE pr.provider = 'google_places'
            AND vri.status = 'approved'
        )::int AS google_approved_reviews
      FROM venues v
      LEFT JOIN provider_records pr ON pr.venue_id = v.id
      LEFT JOIN venue_review_items vri ON vri.provider_record_id = pr.id
      WHERE v.admin_status = 'approved'
      GROUP BY v.id, v.name, v.source, v.metadata
      ORDER BY v.name ASC
    `
  );

  return buildProviderProvenanceAudit(result.rows);
}
