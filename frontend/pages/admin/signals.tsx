import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchRecommendations, submitSignal } from "../../lib/api";
import { Recommendation } from "../../types/recommendation";

type SignalType = "crowd_report" | "line_report" | "event_report";

const SIGNAL_OPTIONS: Array<{ value: SignalType; label: string }> = [
  { value: "crowd_report", label: "Crowd report" },
  { value: "line_report", label: "Line report" },
  { value: "event_report", label: "Event report" }
];

export default function AdminSignalsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [venueId, setVenueId] = useState("");
  const [signalType, setSignalType] = useState<SignalType>("crowd_report");
  const [signalStrength, setSignalStrength] = useState("0.8");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    const data = await fetchRecommendations();
    setRecommendations(data.recommendations);
    if (!venueId && data.recommendations[0]) {
      setVenueId(data.recommendations[0].venueId);
    }
  }, [venueId]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        await loadRecommendations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load venues");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadRecommendations]);

  const venueOptions = useMemo(
    () =>
      recommendations.map((rec) => ({
        venueId: rec.venueId,
        label: `${rec.venueName} (${rec.neighborhood})`
      })),
    [recommendations]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      const parsedStrength = Number.parseFloat(signalStrength);
      if (!Number.isFinite(parsedStrength)) {
        setError("Signal strength must be a valid number.");
        return;
      }

      if (!venueId) {
        setError("Select a venue first.");
        return;
      }

      try {
        setSubmitting(true);
        setError(null);
        setMessage(null);

        await submitSignal({
          venue_id: venueId,
          signal_type: signalType,
          signal_strength: parsedStrength,
          source: "manual"
        });

        await loadRecommendations();
        setMessage("Signal submitted. Recommendations refreshed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit signal");
      } finally {
        setSubmitting(false);
      }
    },
    [loadRecommendations, signalStrength, signalType, venueId]
  );

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "36px 20px 64px",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      }}
    >
      <p style={{ marginTop: 0 }}>
        <Link href="/" style={{ color: "#1d4ed8", fontWeight: 600 }}>
          ← Back to recommendations
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Admin signal entry</h1>
      <p style={{ color: "#4b5563" }}>Submit a manual venue signal and immediately refresh recommendation rankings.</p>

      {loading ? (
        <p>Loading venues…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Venue
            <select value={venueId} onChange={(event) => setVenueId(event.target.value)} required>
              {venueOptions.map((option) => (
                <option key={option.venueId} value={option.venueId}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Signal type
            <select value={signalType} onChange={(event) => setSignalType(event.target.value as SignalType)}>
              {SIGNAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Signal strength
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={signalStrength}
              onChange={(event) => setSignalStrength(event.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={submitting} style={{ width: "fit-content", padding: "8px 14px" }}>
            {submitting ? "Submitting…" : "Submit signal"}
          </button>

          {message && <p style={{ margin: 0, color: "#065f46" }}>{message}</p>}
          {error && <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
