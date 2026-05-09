import { describe, expect, it } from "vitest";
import {
  buildProviderProvenanceAudit,
  classifyVenueProvenance,
  type ProviderProvenanceVenueRow
} from "../src/services/v1/providerProvenanceAudit";

function venue(input: Partial<ProviderProvenanceVenueRow>): ProviderProvenanceVenueRow {
  return {
    id: input.id ?? "venue-1",
    name: input.name ?? "Nightloop Room",
    source: input.source ?? "seed",
    metadata: input.metadata ?? {},
    google_provider_records: input.google_provider_records ?? 0,
    google_approved_reviews: input.google_approved_reviews ?? 0,
    datasf_provider_records: input.datasf_provider_records ?? 0,
    foursquare_provider_records: input.foursquare_provider_records ?? 0
  };
}

describe("provider provenance audit", () => {
  it("flags Google-created canonical venues as Google-derived map content risk", () => {
    const result = classifyVenueProvenance(
      venue({
        source: "provider:google_places",
        metadata: {
          google_place_id: "ChIJ-nightloop",
          google_formatted_address: "1 Market St, San Francisco, CA"
        }
      })
    );

    expect(result.overall).toBe("google_derived");
    expect(result.risk).toBe("google_maps_required");
    expect(result.fields).toMatchObject({
      identity: "google_derived",
      coordinates: "google_derived",
      address: "google_derived",
      provider_id: "google_verified"
    });
  });

  it("treats curated venues with Google IDs as verified instead of Google-owned", () => {
    const result = classifyVenueProvenance(
      venue({
        source: "curated:sf_notable",
        metadata: {
          google_place_id: "ChIJ-verified",
          google_checked_at: "2026-04-26T00:00:00Z"
        },
        google_provider_records: 1,
        google_approved_reviews: 1
      })
    );

    expect(result.overall).toBe("google_verified");
    expect(result.risk).toBe("low");
    expect(result.fields.identity).toBe("manual_curated");
    expect(result.fields.provider_id).toBe("google_verified");
  });

  it("summarizes audit counts and examples without provider raw payloads", () => {
    const audit = buildProviderProvenanceAudit([
      venue({ id: "seed-1", source: "seed" }),
      venue({ id: "curated-1", source: "curated:sf_notable", metadata: { google_place_id: "ChIJ-ok" } }),
      venue({ id: "google-1", source: "provider:google_places", metadata: { google_place_id: "ChIJ-risk" } })
    ]);

    expect(audit.summary).toMatchObject({
      total: 3,
      nightloop_owned: 1,
      manual_curated: 0,
      google_verified: 1,
      google_derived: 1,
      google_maps_required: 1
    });
    expect(JSON.stringify(audit.examples)).not.toContain("raw_payload");
  });
});
