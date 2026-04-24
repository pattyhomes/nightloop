import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminVenue,
  Market,
  ModerationReport,
  ProviderName,
  ProviderImportRun,
  ProviderRunMode,
  VenueAsset,
  VenueReviewItem,
  approveReviewItem,
  createProviderRun,
  createVenueAsset,
  fetchAdminMe,
  fetchAdminVenues,
  fetchMarkets,
  fetchModerationReports,
  fetchProviderRuns,
  fetchReviewerStatus,
  fetchReviewItems,
  fetchVenueAssets,
  importManualEvent,
  rejectReviewItem,
  runProviderRun,
  seedReviewerAccount,
  updateModerationReport
} from "../../lib/adminApi";

const TOKEN_STORAGE_KEY = "nightloop_admin_jwt";

const shellStyle = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "32px 20px 72px",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "#111827"
};

const panelStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  background: "#fff"
};

const inputStyle = {
  width: "100%",
  minHeight: 36,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "7px 9px",
  font: "inherit",
  boxSizing: "border-box" as const
};

const buttonStyle = {
  border: "1px solid #111827",
  borderRadius: 6,
  background: "#111827",
  color: "#fff",
  minHeight: 34,
  padding: "7px 12px",
  fontWeight: 700,
  cursor: "pointer"
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#fff",
  color: "#111827"
};

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
      {label}
      {children}
    </label>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <p style={{ margin: "10px 0 0", color: "#b91c1c", fontWeight: 700 }}>{message}</p>;
}

function StatusMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <p style={{ margin: "10px 0 0", color: "#047857", fontWeight: 700 }}>{message}</p>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not completed";
  return new Date(value).toLocaleString();
}

function nextLocalDateTime(): string {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  value.setMinutes(0, 0, 0);
  return value.toISOString().slice(0, 16);
}

export default function AdminOpsPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [providerRuns, setProviderRuns] = useState<ProviderImportRun[]>([]);
  const [reviewItems, setReviewItems] = useState<VenueReviewItem[]>([]);
  const [assets, setAssets] = useState<VenueAsset[]>([]);
  const [moderationReports, setModerationReports] = useState<ModerationReport[]>([]);
  const [reviewerStatus, setReviewerStatus] = useState<{ configured: boolean; seeded: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [providerRunForm, setProviderRunForm] = useState<{
    provider: ProviderName;
    mode: ProviderRunMode;
    googleRunKind: "existing_qa" | "discovery";
    cap: number;
  }>({
    provider: "google_places",
    mode: "fixture",
    googleRunKind: "existing_qa",
    cap: 10
  });

  const [assetForm, setAssetForm] = useState({
    venue_id: "",
    url: "",
    alt_text: "",
    credit_text: "",
    credit_url: "",
    license_name: "",
    license_url: "",
    rights_status: "licensed" as const,
    source: "manual",
    is_approved: true
  });

  const [eventForm, setEventForm] = useState({
    venue_id: "",
    title: "",
    starts_at: nextLocalDateTime(),
    url: "",
    source_event_id: ""
  });

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? null,
    [markets, selectedMarketId]
  );

  const loadAll = useCallback(
    async (jwt: string, marketIdOverride?: string) => {
      setLoading(true);
      setError(null);
      try {
        const marketData = await fetchMarkets();
        const nextMarketId =
          marketIdOverride ||
          selectedMarketId ||
          marketData.items.find((market) => market.slug === "san-francisco")?.id ||
          marketData.items[0]?.id ||
          "";

        const [me, venueData, runData, reviewData, assetData, moderationData, reviewerData] =
          await Promise.all([
            fetchAdminMe(jwt),
            nextMarketId ? fetchAdminVenues(jwt, nextMarketId) : Promise.resolve({ items: [] }),
            fetchProviderRuns(jwt),
            fetchReviewItems(jwt),
            fetchVenueAssets(jwt),
            fetchModerationReports(jwt),
            fetchReviewerStatus(jwt)
          ]);

        setMarkets(marketData.items);
        setSelectedMarketId(nextMarketId);
        setAdminRole(me.admin.role);
        setVenues(venueData.items);
        setProviderRuns(runData.items);
        setReviewItems(reviewData.items);
        setAssets(assetData.items);
        setModerationReports(moderationData.items);
        setReviewerStatus({ configured: reviewerData.configured, seeded: reviewerData.seeded });

        if (!assetForm.venue_id && venueData.items[0]) {
          setAssetForm((current) => ({ ...current, venue_id: venueData.items[0].id }));
        }
        if (!eventForm.venue_id && venueData.items[0]) {
          setEventForm((current) => ({ ...current, venue_id: venueData.items[0].id }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load ops data");
      } finally {
        setLoading(false);
      }
    },
    [assetForm.venue_id, eventForm.venue_id, selectedMarketId]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      setToken(stored);
      setTokenInput(stored);
      void loadAll(stored);
    }
  }, [loadAll]);

  const saveToken = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const value = tokenInput.trim();
      if (!value) {
        setError("Paste a Supabase user JWT first.");
        return;
      }
      window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
      setToken(value);
      await loadAll(value);
    },
    [loadAll, tokenInput]
  );

  const clearToken = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setTokenInput("");
    setAdminRole(null);
  }, []);

  const refresh = useCallback(async () => {
    if (token) await loadAll(token);
  }, [loadAll, token]);

  const withWork = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (!token) return;
      setWorking(label);
      setError(null);
      setMessage(null);
      try {
        await action();
        await loadAll(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setWorking(null);
      }
    },
    [loadAll, token]
  );

  const handleMarketChange = useCallback(
    async (marketId: string) => {
      setSelectedMarketId(marketId);
      if (token) {
        await loadAll(token, marketId);
      }
    },
    [loadAll, token]
  );

  const handleCreateRun = useCallback(() => {
    void withWork("Creating run", async () => {
      if (!token || !selectedMarketId) return;
      const maxCap = providerRunForm.provider === "foursquare" ? 20 : 100;
      const result = await createProviderRun(token, {
        marketId: selectedMarketId,
        provider: providerRunForm.provider,
        mode: providerRunForm.mode,
        googleRunKind: providerRunForm.googleRunKind,
        cap: Math.max(1, Math.min(maxCap, providerRunForm.cap))
      });
      setMessage(`Created ${result.run.provider} run ${result.run.id.slice(0, 8)}.`);
    });
  }, [providerRunForm, selectedMarketId, token, withWork]);

  const handleRunProvider = useCallback(
    (runId: string) => {
      void withWork("Running provider", async () => {
        if (!token) return;
        const result = await runProviderRun(token, runId);
        const count = result.summary.provider_records_created ?? 0;
        setMessage(`Provider run completed with ${count} records.`);
      });
    },
    [token, withWork]
  );

  const handleApprove = useCallback(
    (id: string) => {
      void withWork("Approving review", async () => {
        if (!token) return;
        await approveReviewItem(token, id);
        setMessage("Venue review item approved.");
      });
    },
    [token, withWork]
  );

  const handleReject = useCallback(
    (id: string) => {
      const reason = window.prompt("Reject reason");
      if (!reason) return;
      void withWork("Rejecting review", async () => {
        if (!token) return;
        await rejectReviewItem(token, id, reason);
        setMessage("Venue review item rejected.");
      });
    },
    [token, withWork]
  );

  const handleAssetSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void withWork("Saving asset", async () => {
        if (!token) return;
        await createVenueAsset(token, assetForm);
        setAssetForm((current) => ({
          ...current,
          url: "",
          alt_text: "",
          credit_text: "",
          credit_url: "",
          license_name: "",
          license_url: ""
        }));
        setMessage("Licensed asset saved.");
      });
    },
    [assetForm, token, withWork]
  );

  const handleEventSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void withWork("Importing event", async () => {
        if (!token) return;
        await importManualEvent(token, {
          ...eventForm,
          starts_at: new Date(eventForm.starts_at).toISOString(),
          url: eventForm.url || undefined,
          source_event_id: eventForm.source_event_id || undefined
        });
        setEventForm((current) => ({
          ...current,
          title: "",
          url: "",
          source_event_id: ""
        }));
        setMessage("Manual event imported.");
      });
    },
    [eventForm, token, withWork]
  );

  const venueOptions = venues.map((venue) => (
    <option key={venue.id} value={venue.id}>
      {venue.name} {venue.neighborhood ? `(${venue.neighborhood})` : ""}
    </option>
  ));

  return (
    <main style={shellStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: "0 0 10px" }}>
            <Link href="/" style={{ color: "#1d4ed8", fontWeight: 700 }}>
              Back to prototype home
            </Link>
          </p>
          <h1 style={{ margin: 0, fontSize: 30 }}>Nightloop Ops</h1>
          <p style={{ margin: "8px 0 0", color: "#4b5563" }}>
            {adminRole ? `Signed in as ${adminRole}.` : "Admin token required."}
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={!token || loading} style={secondaryButtonStyle}>
          Refresh
        </button>
      </header>

      <section style={{ ...panelStyle, marginTop: 20 }}>
        <form onSubmit={saveToken} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }}>
          <input
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Supabase user JWT"
            type="password"
            style={inputStyle}
          />
          <button type="submit" style={buttonStyle}>
            Unlock
          </button>
          <button type="button" onClick={clearToken} style={secondaryButtonStyle}>
            Clear
          </button>
        </form>
        <ErrorMessage message={error} />
        <StatusMessage message={message} />
      </section>

      {token && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
            <div style={panelStyle}>
              <strong>{selectedMarket?.short_label ?? "--"}</strong>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>{selectedMarket?.display_name ?? "No market"}</p>
            </div>
            <div style={panelStyle}>
              <strong>{venues.length}</strong>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>venues loaded</p>
            </div>
            <div style={panelStyle}>
              <strong>{reviewItems.length}</strong>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>pending reviews</p>
            </div>
            <div style={panelStyle}>
              <strong>{moderationReports.length}</strong>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>open reports</p>
            </div>
          </section>

          <section style={{ ...panelStyle, marginTop: 20 }}>
            <Field label="Market">
              <select value={selectedMarketId} onChange={(event) => void handleMarketChange(event.target.value)} style={inputStyle}>
                {markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.display_name} - {market.launch_status}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr", gap: 16, marginTop: 20 }}>
            <div style={panelStyle}>
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Provider Runs</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Provider">
                    <select
                      value={providerRunForm.provider}
                      onChange={(event) => {
                        const provider = event.target.value as ProviderName;
                        setProviderRunForm((current) => ({
                          ...current,
                          provider,
                          cap: provider === "foursquare" ? Math.min(current.cap, 20) : current.cap
                        }));
                      }}
                      style={inputStyle}
                    >
                      <option value="google_places">Google Places</option>
                      <option value="foursquare">Foursquare</option>
                    </select>
                  </Field>
                  <Field label="Mode">
                    <select
                      value={providerRunForm.mode}
                      onChange={(event) =>
                        setProviderRunForm((current) => ({
                          ...current,
                          mode: event.target.value as ProviderRunMode
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="fixture">Fixture</option>
                      <option value="dry_run">Dry run</option>
                      <option value="live">Live</option>
                    </select>
                  </Field>
                  {providerRunForm.provider === "google_places" && (
                    <Field label="Google run">
                      <select
                        value={providerRunForm.googleRunKind}
                        onChange={(event) =>
                          setProviderRunForm((current) => ({
                            ...current,
                            googleRunKind: event.target.value as "existing_qa" | "discovery"
                          }))
                        }
                        style={inputStyle}
                      >
                        <option value="existing_qa">Existing venue QA</option>
                        <option value="discovery">Nightlife discovery</option>
                      </select>
                    </Field>
                  )}
                  <Field label={`Cap (${providerRunForm.provider === "foursquare" ? "max 20" : "max 100"})`}>
                    <input
                      type="number"
                      min={1}
                      max={providerRunForm.provider === "foursquare" ? 20 : 100}
                      value={providerRunForm.cap}
                      onChange={(event) =>
                        setProviderRunForm((current) => ({
                          ...current,
                          cap: Number(event.target.value)
                        }))
                      }
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <button type="button" onClick={handleCreateRun} disabled={working !== null || !selectedMarketId} style={buttonStyle}>
                  Create Run
                </button>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {providerRuns.slice(0, 8).map((run) => (
                  <div key={run.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>
                        {run.provider} / {run.mode}
                      </strong>
                      <span>{run.status}</span>
                    </div>
                    <p style={{ margin: "6px 0", color: "#6b7280", fontSize: 13 }}>
                      {formatDate(run.created_at)} - {formatDate(run.completed_at)}
                    </p>
                    <p style={{ margin: "6px 0", color: "#6b7280", fontSize: 13 }}>
                      Records: {String(run.summary.provider_records_created ?? 0)} · Reviews:{" "}
                      {String(run.summary.review_items_created ?? 0)} · Skipped:{" "}
                      {String(run.summary.skipped_duplicates ?? 0)}
                    </p>
                    {run.status === "pending" && (
                      <button type="button" onClick={() => handleRunProvider(run.id)} disabled={working !== null} style={secondaryButtonStyle}>
                        Run
                      </button>
                    )}
                  </div>
                ))}
                {providerRuns.length === 0 && <p style={{ color: "#6b7280" }}>No provider runs yet.</p>}
              </div>
            </div>

            <div style={panelStyle}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Review Queue</h2>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {reviewItems.map((item) => (
                  <div key={item.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>{item.venue_name ?? "Unmatched venue"}</strong>
                      <span>{item.provider}</span>
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", background: "#f9fafb", padding: 10, borderRadius: 6, fontSize: 12 }}>
                      {JSON.stringify(item.proposed_changes, null, 2)}
                    </pre>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => handleApprove(item.id)} disabled={working !== null} style={buttonStyle}>
                        Approve
                      </button>
                      <button type="button" onClick={() => handleReject(item.id)} disabled={working !== null} style={secondaryButtonStyle}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
                {reviewItems.length === 0 && <p style={{ color: "#6b7280" }}>No pending venue reviews.</p>}
              </div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <form onSubmit={handleAssetSubmit} style={panelStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Licensed Images</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Venue">
                  <select value={assetForm.venue_id} onChange={(event) => setAssetForm({ ...assetForm, venue_id: event.target.value })} style={inputStyle}>
                    {venueOptions}
                  </select>
                </Field>
                <Field label="Image URL">
                  <input value={assetForm.url} onChange={(event) => setAssetForm({ ...assetForm, url: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="Alt text">
                  <input value={assetForm.alt_text} onChange={(event) => setAssetForm({ ...assetForm, alt_text: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="Credit">
                  <input value={assetForm.credit_text} onChange={(event) => setAssetForm({ ...assetForm, credit_text: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="License name">
                  <input value={assetForm.license_name} onChange={(event) => setAssetForm({ ...assetForm, license_name: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="Credit URL">
                  <input value={assetForm.credit_url} onChange={(event) => setAssetForm({ ...assetForm, credit_url: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="License URL">
                  <input value={assetForm.license_url} onChange={(event) => setAssetForm({ ...assetForm, license_url: event.target.value })} style={inputStyle} required />
                </Field>
                <button type="submit" disabled={working !== null || venues.length === 0} style={buttonStyle}>
                  Save Image
                </button>
              </div>
              <p style={{ color: "#6b7280", fontSize: 13 }}>{assets.length} image assets in recent ops view.</p>
            </form>

            <form onSubmit={handleEventSubmit} style={panelStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Manual Event Import</h2>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Venue">
                  <select value={eventForm.venue_id} onChange={(event) => setEventForm({ ...eventForm, venue_id: event.target.value })} style={inputStyle}>
                    {venueOptions}
                  </select>
                </Field>
                <Field label="Title">
                  <input value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} style={inputStyle} required />
                </Field>
                <Field label="Starts at">
                  <input
                    type="datetime-local"
                    value={eventForm.starts_at}
                    onChange={(event) => setEventForm({ ...eventForm, starts_at: event.target.value })}
                    style={inputStyle}
                    required
                  />
                </Field>
                <Field label="Event URL">
                  <input value={eventForm.url} onChange={(event) => setEventForm({ ...eventForm, url: event.target.value })} style={inputStyle} />
                </Field>
                <Field label="Source event ID">
                  <input
                    value={eventForm.source_event_id}
                    onChange={(event) => setEventForm({ ...eventForm, source_event_id: event.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <button type="submit" disabled={working !== null || venues.length === 0} style={buttonStyle}>
                  Import Event
                </button>
              </div>
            </form>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginTop: 20 }}>
            <div style={panelStyle}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Moderation</h2>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {moderationReports.map((report) => (
                  <div key={report.id} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                    <strong>
                      {report.target_type}: {report.reason}
                    </strong>
                    <p style={{ margin: "6px 0", color: "#6b7280", fontSize: 13 }}>{formatDate(report.created_at)}</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["reviewing", "resolved", "dismissed"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => {
                            void withWork("Updating moderation", async () => {
                              if (!token) return;
                              await updateModerationReport(token, report.id, status);
                              setMessage(`Report marked ${status}.`);
                            });
                          }}
                          disabled={working !== null}
                          style={secondaryButtonStyle}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {moderationReports.length === 0 && <p style={{ color: "#6b7280" }}>No open reports.</p>}
              </div>
            </div>

            <div style={panelStyle}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Reviewer Account</h2>
              <p style={{ color: "#4b5563" }}>
                Configured: {reviewerStatus?.configured ? "yes" : "no"}
                <br />
                Seeded: {reviewerStatus?.seeded ? "yes" : "no"}
              </p>
              <button
                type="button"
                onClick={() => {
                  void withWork("Seeding reviewer", async () => {
                    if (!token) return;
                    await seedReviewerAccount(token);
                    setMessage("Reviewer account seeded.");
                  });
                }}
                disabled={working !== null || !reviewerStatus?.configured}
                style={buttonStyle}
              >
                Seed Reviewer
              </button>
              {working && <p style={{ color: "#6b7280" }}>{working}...</p>}
              {loading && <p style={{ color: "#6b7280" }}>Loading...</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
