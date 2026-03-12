import SignalButtons from "./SignalButtons";
import { Recommendation } from "../types/recommendation";

type RecommendationListProps = {
  items: Recommendation[];
};

function formatSignalType(signalType: string | null): string {
  if (!signalType) return "Unknown";
  return signalType.replace(/_/g, " ");
}

export default function RecommendationList({ items }: RecommendationListProps) {
  if (items.length === 0) {
    return <p>No recommendations yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {items.map((item) => (
        <article
          key={item.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            background: "#ffffff",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 22 }}>{item.venueName}</h3>
            <span style={{ fontWeight: 600, color: "#111827" }}>Score {item.score.toFixed(2)}</span>
          </div>

          <p style={{ marginTop: 6, marginBottom: 10, color: "#4b5563" }}>{item.neighborhood}</p>
          <p style={{ marginTop: 0, marginBottom: 12, color: "#111827" }}>{item.why}</p>

          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#f9fafb",
              border: "1px solid #f3f4f6"
            }}
          >
            <p style={{ margin: 0, color: "#111827", fontSize: 14 }}>
              Last signal: <strong>{formatSignalType(item.lastSignalType)}</strong>
              {" · "}
              Count: <strong>{item.signalCount}</strong>
            </p>
            <p style={{ margin: "6px 0 0", color: "#4b5563", fontSize: 13 }}>{item.sourceSummary}</p>
          </div>

          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {item.factors.slice(0, 3).map((factor, idx) => (
              <li key={`${item.id}-factor-${idx}`} style={{ marginBottom: 4, color: "#374151" }}>
                {factor}
              </li>
            ))}
          </ul>

          <SignalButtons venueId={item.id} />
        </article>
      ))}
    </div>
  );
}
