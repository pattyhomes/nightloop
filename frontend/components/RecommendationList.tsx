import SignalButtons from "./SignalButtons";
import { Recommendation } from "../types/recommendation";

type RecommendationListProps = {
  items: Recommendation[];
  onSignalSubmitted?: () => void;
};

function formatSignalType(signalType: string | null): string {
  if (!signalType) return "Unknown";
  return signalType.replace(/_/g, " ");
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatUpdatedAgo(minutes: number): string {
  if (minutes <= 0) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  return `Updated ${minutes} min ago`;
}

function formatPulseLevel(pulseLevel: Recommendation["pulseLevel"]): string {
  if (pulseLevel >= 3) return "High";
  if (pulseLevel >= 2) return "Medium";
  return "Low";
}

function getPulseTone(pulseLevel: Recommendation["pulseLevel"]): { text: string; background: string; border: string } {
  if (pulseLevel >= 3) {
    return { text: "#92400e", background: "#fffbeb", border: "#fde68a" };
  }
  if (pulseLevel >= 2) {
    return { text: "#1f2937", background: "#f3f4f6", border: "#d1d5db" };
  }
  return { text: "#065f46", background: "#ecfdf5", border: "#a7f3d0" };
}

export default function RecommendationList({ items, onSignalSubmitted }: RecommendationListProps) {
  if (items.length === 0) {
    return <p>No recommendations yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {items.map((item) => {
        const pulseTone = getPulseTone(item.pulseLevel);
        const provenanceLine = `${formatUpdatedAgo(item.lastUpdatedAgoMinutes)} • ${formatCount(
          item.userSignalCount,
          "user report"
        )}${
          item.platformSignalCount > 0
            ? ` • ${formatCount(item.platformSignalCount, "platform signal")}`
            : ""
        }`;

        return (
          <article
            key={item.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>{item.venueName}</h3>
              <span style={{ fontWeight: 600, color: "#111827" }}>Score {item.score.toFixed(2)}</span>
            </div>

            <p style={{ marginTop: 6, marginBottom: 10, color: "#4b5563" }}>{item.neighborhood}</p>
            <p style={{ marginTop: 0, marginBottom: 12, color: "#111827" }}>{item.why}</p>
            <p style={{ marginTop: -4, marginBottom: 12, color: "#6b7280", fontSize: 13 }}>{provenanceLine}</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  borderRadius: 999,
                  border: `1px solid ${pulseTone.border}`,
                  background: pulseTone.background,
                  color: pulseTone.text,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                Pulse: {formatPulseLevel(item.pulseLevel)}
              </span>
              <span
                style={{
                  borderRadius: 999,
                  border: "1px solid #dbeafe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                {item.confidenceLabel}
              </span>
              <span
                style={{
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#374151",
                  padding: "4px 10px",
                  fontSize: 12
                }}
              >
                {item.recentSignalCount} recent signal{item.recentSignalCount === 1 ? "" : "s"}
              </span>
            </div>

            <div
              style={{
                marginBottom: 10,
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

            <SignalButtons venueId={item.id} onSubmitted={onSignalSubmitted} />
          </article>
        );
      })}
    </div>
  );
}
