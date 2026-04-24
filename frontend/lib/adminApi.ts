export type AdminApiError = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export type Market = {
  id: string;
  slug: string;
  display_name: string;
  short_label: string;
  launch_status: string;
};

export type AdminVenue = {
  id: string;
  slug: string | null;
  name: string;
  market_id: string;
  category: string | null;
  neighborhood: string | null;
  admin_status: string;
  is_active: boolean;
};

export type ProviderImportRun = {
  id: string;
  provider: string;
  market_id: string;
  status: string;
  mode: string;
  capped_venue_count: number;
  summary: Record<string, unknown>;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ProviderName = "foursquare" | "google_places";
export type ProviderRunMode = "fixture" | "dry_run" | "live";
export type GoogleRunKind = "existing_qa" | "discovery";

export type VenueReviewItem = {
  id: string;
  provider_record_id: string;
  provider_record_id_external: string;
  import_run_id: string | null;
  provider: string;
  venue_id: string | null;
  venue_name: string | null;
  market_id: string;
  status: "pending" | "approved" | "rejected";
  proposed_changes: Record<string, unknown>;
  review_notes: string | null;
  created_at: string;
};

export type VenueAsset = {
  id: string;
  venue_id: string;
  market_id: string;
  asset_type: string;
  url: string;
  alt_text: string | null;
  credit_text: string;
  credit_url: string | null;
  license_name: string;
  license_url: string | null;
  rights_status: string;
  source: string;
  is_approved: boolean;
  sort_order: number;
};

export type ModerationReport = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};

function getBackendBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_BASE_URL?.trim();
  return (value || "http://localhost:4000").replace(/\/$/, "");
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).length > 0) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function adminFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as AdminApiError;
      message = body.error?.message ?? message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchMarkets(): Promise<{ items: Market[] }> {
  const response = await fetch(`${getBackendBaseUrl()}/api/v1/markets`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load markets (${response.status})`);
  }
  return (await response.json()) as { items: Market[] };
}

export function fetchAdminMe(token: string) {
  return adminFetch<{ admin: { role: string }; user: { auth_user_id: string } }>(
    token,
    "/api/v1/admin/me"
  );
}

export function fetchAdminVenues(token: string, marketId?: string) {
  return adminFetch<{ items: AdminVenue[] }>(
    token,
    `/api/v1/admin/venues${buildQuery({ market_id: marketId, limit: 200 })}`
  );
}

export function fetchProviderRuns(token: string) {
  return adminFetch<{ items: ProviderImportRun[] }>(token, "/api/v1/admin/provider-import-runs");
}

export function createProviderRun(
  token: string,
  input: {
    marketId: string;
    provider: ProviderName;
    mode: ProviderRunMode;
    cap: number;
    googleRunKind?: GoogleRunKind;
  }
) {
  return adminFetch<{ run: ProviderImportRun }>(token, "/api/v1/admin/provider-import-runs", {
    method: "POST",
    body: JSON.stringify({
      provider: input.provider,
      market_id: input.marketId,
      mode: input.mode,
      capped_venue_count: input.cap,
      summary:
        input.provider === "google_places"
          ? { google_run_kind: input.googleRunKind ?? "existing_qa" }
          : {}
    })
  });
}

export function runProviderRun(token: string, runId: string) {
  return adminFetch<{ run: ProviderImportRun; summary: Record<string, unknown> }>(
    token,
    `/api/v1/admin/provider-import-runs/${runId}/run`,
    { method: "POST" }
  );
}

export function fetchReviewItems(token: string) {
  return adminFetch<{ items: VenueReviewItem[] }>(
    token,
    "/api/v1/admin/venue-review-items?status=pending&limit=50"
  );
}

export function approveReviewItem(token: string, id: string) {
  return adminFetch<unknown>(token, `/api/v1/admin/venue-review-items/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: "Approved from ops dashboard." })
  });
}

export function rejectReviewItem(token: string, id: string, reason: string) {
  return adminFetch<unknown>(token, `/api/v1/admin/venue-review-items/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export function fetchVenueAssets(token: string) {
  return adminFetch<{ items: VenueAsset[] }>(token, "/api/v1/admin/venue-assets?limit=50");
}

export type CreateAssetPayload = {
  venue_id: string;
  url: string;
  alt_text: string;
  credit_text: string;
  credit_url: string;
  license_name: string;
  license_url: string;
  rights_status: "licensed" | "owned" | "partner" | "public_domain";
  source: string;
  is_approved: boolean;
};

export function createVenueAsset(token: string, payload: CreateAssetPayload) {
  return adminFetch<{ asset: VenueAsset }>(token, "/api/v1/admin/venue-assets", {
    method: "POST",
    body: JSON.stringify({ ...payload, asset_type: "image" })
  });
}

export type ImportEventPayload = {
  venue_id: string;
  title: string;
  starts_at: string;
  url?: string;
  source_event_id?: string;
};

export function importManualEvent(token: string, payload: ImportEventPayload) {
  return adminFetch<{ count: number }>(token, "/api/v1/admin/events/import", {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          ...payload,
          source: "manual",
          is_approved: true
        }
      ]
    })
  });
}

export function fetchModerationReports(token: string) {
  return adminFetch<{ items: ModerationReport[] }>(
    token,
    "/api/v1/admin/moderation-reports?status=open&limit=50"
  );
}

export function updateModerationReport(token: string, id: string, status: ModerationReport["status"]) {
  return adminFetch<{ report: ModerationReport }>(token, `/api/v1/admin/moderation-reports/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function fetchReviewerStatus(token: string) {
  return adminFetch<{ configured: boolean; seeded: boolean; user: unknown | null }>(
    token,
    "/api/v1/admin/reviewer-account/status"
  );
}

export function seedReviewerAccount(token: string) {
  return adminFetch<{ configured: boolean; seeded: boolean; user: unknown | null }>(
    token,
    "/api/v1/admin/reviewer-account/seed",
    { method: "POST" }
  );
}
