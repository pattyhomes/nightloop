import { loadConfig } from "../lib/config";
import { dbTransaction, getDBClient, type DBClient } from "../lib/db";

type JsonRecord = Record<string, unknown>;

type ReviewRow = {
  id: string;
  provider_record_id: string;
  venue_id: string;
  market_id: string;
  proposed_changes: JsonRecord;
  venue_name: string;
  venue_slug: string;
  canonical_type: string | null;
  provider_record_external_id: string;
  normalized_payload: JsonRecord;
  match_confidence: string | number | null;
};

type PlannedAction =
  | "approve_google_fields"
  | "metadata_only_verified"
  | "manual_verified"
  | "hide_temporary_closure"
  | "deactivate_permanent_closure"
  | "ignore_provider_manual_review";

type ManualDecision = {
  action: Exclude<PlannedAction, "approve_google_fields" | "deactivate_permanent_closure">;
  note: string;
  canonicalName?: string;
  canonicalSlug?: string;
  canonicalType?: string;
  adminStatus?: string;
  isActive?: boolean;
  mergeGoogleMetadata?: boolean;
  sourceUrls: string[];
};

type PlanItem = ReviewRow & {
  action: PlannedAction;
  note: string;
  sourceUrls: string[];
};

const APPLY = process.argv.includes("--apply");

const REVIEW_SOURCES = {
  googleQaRun: "Phase 2B Google Places existing-venue QA",
  sfStandard15Romolo: "https://sfstandard.com/2026/01/13/15romolo-north-beach-bar-reopens/",
  official1015: "https://1015.com/about-old/",
  officialTeeth: "https://www.teethbarsf.com/",
  officialF8: "https://www.feightsf.com/",
  officialHemlock: "https://www.thehemlocksf.com/contact/",
  officialLiPo: "https://lipolounge.com/about/",
  figThistleWine: "https://www.figandthistlesf.com/main-page",
  figThistleApothecary: "https://figandthistle.com/",
  figThistleWineClosedSignal: "https://starwinelist.com/wine-place/fig-and-thistle"
};

const MANUAL_DECISIONS: Record<string, ManualDecision> = {
  "1015 Folsom": {
    action: "metadata_only_verified",
    note: "Verified as real venue named 1015 Folsom; Google returned an address-like place name, so preserve canonical name/type and merge provider metadata only.",
    mergeGoogleMetadata: true,
    sourceUrls: [REVIEW_SOURCES.official1015]
  },
  "15 Romolo": {
    action: "hide_temporary_closure",
    note: "Verified real venue, but current public reporting says it has been shuttered during renovation and is preparing to reopen; hide until reopened is confirmed.",
    adminStatus: "temporarily_closed_google",
    isActive: false,
    mergeGoogleMetadata: true,
    sourceUrls: [REVIEW_SOURCES.sfStandard15Romolo]
  },
  "Dr. Teeth and the Electric Mayhem": {
    action: "manual_verified",
    note: "Current official venue identity is Teeth at the same Mission Street bar location; provider returned no usable Google match, so close provider item and correct canonical name.",
    canonicalName: "Teeth",
    canonicalSlug: "teeth",
    canonicalType: "bar",
    sourceUrls: [REVIEW_SOURCES.officialTeeth]
  },
  "F8 1192": {
    action: "manual_verified",
    note: "Current official venue identity is F8; 1192 is the street address context, so close unmatched provider item and correct canonical name.",
    canonicalName: "F8",
    canonicalSlug: "f8",
    canonicalType: "club",
    sourceUrls: [REVIEW_SOURCES.officialF8]
  },
  "Hemlock Tavern Annex": {
    action: "manual_verified",
    note: "Current public/official identity is Hemlock Tavern at 1131 Polk; close unmatched provider item and correct canonical name while preserving the venue.",
    canonicalName: "Hemlock Tavern",
    canonicalSlug: "hemlock-tavern",
    canonicalType: "bar",
    sourceUrls: [REVIEW_SOURCES.officialHemlock]
  },
  "Li Po Lounge": {
    action: "manual_verified",
    note: "Verified as real Li Po/Li Po Cocktail Lounge venue; provider returned no usable Google match, so preserve canonical venue and close provider item.",
    sourceUrls: [REVIEW_SOURCES.officialLiPo]
  },
  "Fig & Thistle": {
    action: "ignore_provider_manual_review",
    note: "Google matched Fig & Thistle Apothecary/store. Public sources disagree about the wine-bar venue state, so do not overwrite Nightloop venue fields in this pass.",
    sourceUrls: [
      REVIEW_SOURCES.figThistleWine,
      REVIEW_SOURCES.figThistleApothecary,
      REVIEW_SOURCES.figThistleWineClosedSignal
    ]
  }
};

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function googleMetadataPatch(row: ReviewRow): JsonRecord | null {
  const proposed = asRecord(row.proposed_changes);
  const fromProposed = asRecord(proposed.metadata_patch);
  if (Object.keys(fromProposed).length > 0) return fromProposed;

  const normalized = asRecord(row.normalized_payload);
  const patch = {
    google_place_id: textValue(normalized.google_place_id),
    google_formatted_address: textValue(normalized.formatted_address),
    google_place_types: Array.isArray(normalized.types) ? normalized.types : [],
    google_primary_type: textValue(normalized.primary_type),
    google_business_status: textValue(normalized.business_status),
    google_maps_uri: textValue(normalized.google_maps_uri)
  };

  return Object.values(patch).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value != null;
  })
    ? patch
    : null;
}

function plannedActionFor(row: ReviewRow): PlanItem {
  const manual = MANUAL_DECISIONS[row.venue_name];
  if (manual) {
    return {
      ...row,
      action: manual.action,
      note: manual.note,
      sourceUrls: manual.sourceUrls
    };
  }

  const status = textValue(asRecord(row.normalized_payload).business_status);
  if (status === "CLOSED_PERMANENTLY") {
    return {
      ...row,
      action: "deactivate_permanent_closure",
      note: "Google Places reported CLOSED_PERMANENTLY during existing-venue QA; hide canonical venue pending any future reopening evidence.",
      sourceUrls: [REVIEW_SOURCES.googleQaRun]
    };
  }

  return {
    ...row,
    action: "approve_google_fields",
    note: "Operational Google Places QA match approved for canonical field update.",
    sourceUrls: [REVIEW_SOURCES.googleQaRun]
  };
}

async function readPendingGoogleReviews(client: DBClient): Promise<ReviewRow[]> {
  const result = await client.query<ReviewRow>(
    `
      SELECT
        vri.id,
        vri.provider_record_id,
        vri.venue_id,
        vri.market_id,
        vri.proposed_changes,
        v.name AS venue_name,
        v.slug AS venue_slug,
        v.canonical_type,
        pr.provider_record_id AS provider_record_external_id,
        pr.normalized_payload,
        pr.match_confidence
      FROM venue_review_items vri
      JOIN provider_records pr ON pr.id = vri.provider_record_id
      JOIN venues v ON v.id = vri.venue_id
      WHERE vri.status = 'pending'
        AND pr.provider = 'google_places'
      ORDER BY v.name ASC
    `
  );

  return result.rows;
}

async function readActorUserId(client: DBClient): Promise<string> {
  const result = await client.query<{ app_user_id: string }>(
    `
      SELECT u.id AS app_user_id
      FROM admin_users au
      JOIN users u ON u.auth_user_id = au.auth_user_id
      WHERE au.is_active = true
      ORDER BY au.created_at ASC
      LIMIT 1
    `
  );

  const actor = result.rows[0]?.app_user_id;
  if (!actor) {
    throw new Error("No active admin user found. Bootstrap local admin before applying the review pass.");
  }
  return actor;
}

async function updateSlugIfAvailable(
  client: DBClient,
  venueId: string,
  slug: string | undefined
): Promise<string | null> {
  if (!slug) return null;
  const result = await client.query<{ slug: string }>(
    `
      SELECT slug
      FROM venues
      WHERE slug = $1
        AND id <> $2::uuid
      LIMIT 1
    `,
    [slug, venueId]
  );

  return result.rows.length === 0 ? slug : null;
}

async function writeAudit(
  client: DBClient,
  actorUserId: string,
  action: string,
  item: PlanItem,
  extra: JsonRecord = {}
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_logs (actor_user_id, action, metadata)
      VALUES ($1::uuid, $2, $3::jsonb)
    `,
    [
      actorUserId,
      action,
      serialize({
        review_item_id: item.id,
        provider_record_id: item.provider_record_id,
        venue_id: item.venue_id,
        provider_record_external_id: item.provider_record_external_id,
        review_pass: "google_places_existing_qa_2026_04",
        planned_action: item.action,
        note: item.note,
        source_urls: item.sourceUrls,
        ...extra
      })
    ]
  );
}

async function approveGoogleFields(client: DBClient, actorUserId: string, item: PlanItem): Promise<void> {
  const proposed = asRecord(item.proposed_changes);
  const name = textValue(proposed.name);
  const canonicalType = textValue(proposed.canonical_type);
  const metadataPatch = googleMetadataPatch(item);

  await client.query(
    `
      UPDATE venues
      SET name = COALESCE($2, name),
          canonical_type = COALESCE($3, canonical_type),
          metadata = CASE
            WHEN $4::jsonb IS NULL THEN metadata
            ELSE metadata || $4::jsonb
          END
      WHERE id = $1::uuid
    `,
    [item.venue_id, name, canonicalType, metadataPatch ? serialize(metadataPatch) : null]
  );

  await client.query(
    `
      UPDATE venue_review_items
      SET status = 'approved',
          review_notes = $2,
          reviewed_by_user_id = $3::uuid,
          reviewed_at = now()
      WHERE id = $1::uuid
    `,
    [item.id, item.note, actorUserId]
  );

  await client.query(
    "UPDATE provider_records SET match_status = 'approved' WHERE id = $1::uuid",
    [item.provider_record_id]
  );

  await writeAudit(client, actorUserId, "venue_review.approved", item, {
    proposed_changes: item.proposed_changes
  });
}

async function approveMetadataOnly(client: DBClient, actorUserId: string, item: PlanItem): Promise<void> {
  const metadataPatch = googleMetadataPatch(item);
  await client.query(
    `
      UPDATE venues
      SET metadata = CASE
            WHEN $2::jsonb IS NULL THEN metadata
            ELSE metadata || $2::jsonb
          END
      WHERE id = $1::uuid
    `,
    [item.venue_id, metadataPatch ? serialize(metadataPatch) : null]
  );

  await client.query(
    `
      UPDATE venue_review_items
      SET status = 'approved',
          review_notes = $2,
          reviewed_by_user_id = $3::uuid,
          reviewed_at = now()
      WHERE id = $1::uuid
    `,
    [item.id, item.note, actorUserId]
  );

  await client.query(
    "UPDATE provider_records SET match_status = 'approved' WHERE id = $1::uuid",
    [item.provider_record_id]
  );

  await writeAudit(client, actorUserId, "venue_review.metadata_only_verified", item, {
    metadata_patch: metadataPatch
  });
}

async function rejectProviderItem(
  client: DBClient,
  actorUserId: string,
  item: PlanItem,
  matchStatus: "ignored" | "rejected" = "ignored"
): Promise<void> {
  await client.query(
    `
      UPDATE venue_review_items
      SET status = 'rejected',
          review_notes = $2,
          reviewed_by_user_id = $3::uuid,
          reviewed_at = now()
      WHERE id = $1::uuid
    `,
    [item.id, item.note, actorUserId]
  );

  await client.query(
    "UPDATE provider_records SET match_status = $2 WHERE id = $1::uuid",
    [item.provider_record_id, matchStatus]
  );
}

async function deactivateVenue(
  client: DBClient,
  actorUserId: string,
  item: PlanItem,
  adminStatus: string,
  auditAction: string
): Promise<void> {
  const metadataPatch = googleMetadataPatch(item);
  const reviewMetadata = {
    ...(metadataPatch ?? {}),
    provider_review_status: adminStatus,
    provider_review_note: item.note
  };

  await client.query(
    `
      UPDATE venues
      SET is_active = false,
          admin_status = $2,
          metadata = metadata || $3::jsonb
      WHERE id = $1::uuid
    `,
    [item.venue_id, adminStatus, serialize(reviewMetadata)]
  );

  await rejectProviderItem(client, actorUserId, item, "ignored");
  await writeAudit(client, actorUserId, auditAction, item, {
    admin_status: adminStatus,
    metadata_patch: reviewMetadata
  });
}

async function applyManualVerified(client: DBClient, actorUserId: string, item: PlanItem): Promise<void> {
  const decision = MANUAL_DECISIONS[item.venue_name];
  if (!decision) return;

  const nextSlug = await updateSlugIfAvailable(client, item.venue_id, decision.canonicalSlug);
  await client.query(
    `
      UPDATE venues
      SET name = COALESCE($2, name),
          slug = COALESCE($3, slug),
          canonical_type = COALESCE($4, canonical_type),
          metadata = metadata || $5::jsonb
      WHERE id = $1::uuid
    `,
    [
      item.venue_id,
      decision.canonicalName ?? null,
      nextSlug,
      decision.canonicalType ?? null,
      serialize({
        manual_verification_status: "verified_current",
        manual_verification_note: decision.note,
        manual_verification_sources: decision.sourceUrls
      })
    ]
  );

  await rejectProviderItem(client, actorUserId, item, "ignored");
  await writeAudit(client, actorUserId, "venue_review.manual_verified", item, {
    canonical_name: decision.canonicalName ?? null,
    canonical_slug: nextSlug,
    canonical_type: decision.canonicalType ?? null
  });
}

async function ignoreProviderForManualReview(client: DBClient, actorUserId: string, item: PlanItem): Promise<void> {
  await client.query(
    `
      UPDATE venues
      SET metadata = metadata || $2::jsonb
      WHERE id = $1::uuid
    `,
    [
      item.venue_id,
      serialize({
        manual_review_status: "provider_match_ignored",
        manual_review_note: item.note,
        manual_review_sources: item.sourceUrls
      })
    ]
  );

  await rejectProviderItem(client, actorUserId, item, "ignored");
  await writeAudit(client, actorUserId, "venue_review.provider_ignored_manual_review", item);
}

async function applyPlanItem(client: DBClient, actorUserId: string, item: PlanItem): Promise<void> {
  if (item.action === "approve_google_fields") {
    await approveGoogleFields(client, actorUserId, item);
    return;
  }

  if (item.action === "metadata_only_verified") {
    await approveMetadataOnly(client, actorUserId, item);
    return;
  }

  if (item.action === "deactivate_permanent_closure") {
    await deactivateVenue(
      client,
      actorUserId,
      item,
      "closed_google_permanent",
      "venue_review.deactivated_permanent_closure"
    );
    return;
  }

  if (item.action === "hide_temporary_closure") {
    await deactivateVenue(
      client,
      actorUserId,
      item,
      MANUAL_DECISIONS[item.venue_name]?.adminStatus ?? "temporarily_closed_google",
      "venue_review.hidden_temporary_closure"
    );
    return;
  }

  if (item.action === "manual_verified") {
    await applyManualVerified(client, actorUserId, item);
    return;
  }

  await ignoreProviderForManualReview(client, actorUserId, item);
}

function printManifest(plan: PlanItem[]): void {
  const counts = plan.reduce<Record<string, number>>((acc, item) => {
    acc[item.action] = (acc[item.action] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Google QA review pass (${APPLY ? "APPLY" : "DRY RUN"})`);
  console.log(JSON.stringify({ total: plan.length, counts }, null, 2));
  for (const item of plan) {
    const normalized = asRecord(item.normalized_payload);
    console.log(
      JSON.stringify({
        action: item.action,
        venue: item.venue_name,
        google_name: normalized.name ?? null,
        google_status: normalized.business_status ?? null,
        google_primary_type: normalized.primary_type ?? null,
        confidence: item.match_confidence,
        note: item.note
      })
    );
  }
}

async function main(): Promise<void> {
  loadConfig();
  const pending = await dbTransaction((client) => readPendingGoogleReviews(client));
  const plan = pending.map(plannedActionFor);
  printManifest(plan);

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to mutate Supabase dev.");
    return;
  }

  await dbTransaction(async (client) => {
    const actorUserId = await readActorUserId(client);
    const locked = (await readPendingGoogleReviews(client)).map(plannedActionFor);
    if (locked.length !== plan.length) {
      throw new Error(`Pending review count changed during apply. Expected ${plan.length}, found ${locked.length}.`);
    }

    for (const item of locked) {
      await applyPlanItem(client, actorUserId, item);
    }
  });

  console.log(`Applied ${plan.length} Google QA review decisions.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDBClient().close?.();
  });
