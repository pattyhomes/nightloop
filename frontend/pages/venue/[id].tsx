import Link from "next/link";
import { useRouter } from "next/router";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { fetchRecommendations } from "../../lib/api";
import { Recommendation } from "../../types/recommendation";
import SignalButtons from "../../components/SignalButtons";

type VenueDetailPageProps = {
  recommendation: Recommendation | null;
  requestError: string | null;
};

function formatCategory(category: string): string {
  if (category === "live_music") return "Live Music";
  if (category === "club") return "Nightclub";
  if (category === "bar") return "Bar";
  if (category === "lounge") return "Lounge";
  return category;
}

function formatPulseLevel(pulseLevel: Recommendation["pulseLevel"]): string {
  if (pulseLevel >= 3) return "High";
  if (pulseLevel >= 2) return "Medium";
  return "Low";
}

function formatUpdatedAgo(minutes: number): string {
  if (minutes <= 0) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

function formatSignalType(signalType: string): string {
  return signalType.replace(/_/g, " ");
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function hasEventSignalTonight(recentActivity: Recommendation["recentActivity"]): boolean {
  return recentActivity.some((a) => a.signalType === "event_report" && a.minutesAgo < 24 * 60);
}

function getFreshness(minutes: number): { label: string; text: string; background: string; border: string } {
  if (minutes <= 5) {
    return { label: "Live", text: "#065f46", background: "#ecfdf5", border: "#a7f3d0" };
  }
  if (minutes <= 20) {
    return { label: "Fresh", text: "#92400e", background: "#fffbeb", border: "#fde68a" };
  }
  return { label: "Aging", text: "#991b1b", background: "#fef2f2", border: "#fecaca" };
}

function getEnergyTone(status: Recommendation["energyStatus"]): { text: string; background: string; border: string } {
  if (status === "High Energy") {
    return { text: "#9a3412", background: "#fff7ed", border: "#fdba74" };
  }
  if (status === "Steady Energy") {
    return { text: "#374151", background: "#f3f4f6", border: "#d1d5db" };
  }
  return { text: "#155e75", background: "#ecfeff", border: "#67e8f9" };
}

function getEntryTone(status: Recommendation["entryStatus"]): { text: string; background: string; border: string } {
  if (status === "Easy Entry") {
    return { text: "#166534", background: "#f0fdf4", border: "#86efac" };
  }
  if (status === "Manageable Line") {
    return { text: "#92400e", background: "#fffbeb", border: "#fcd34d" };
  }
  return { text: "#991b1b", background: "#fef2f2", border: "#fca5a5" };
}

function getTrendTone(status: Recommendation["trendStatus"]): { text: string; background: string; border: string } {
  if (status === "Rising") {
    return { text: "#166534", background: "#f0fdf4", border: "#86efac" };
  }
  if (status === "Steady") {
    return { text: "#374151", background: "#f3f4f6", border: "#d1d5db" };
  }
  return { text: "#334155", background: "#f8fafc", border: "#cbd5e1" };
}

export const getServerSideProps: GetServerSideProps<VenueDetailPageProps> = async (context) => {
  const id = typeof context.params?.id === "string" ? context.params.id : null;

  if (!id) {
    return { notFound: true };
  }

  try {
    const data = await fetchRecommendations();
    const recommendation = data.recommendations.find((item) => item.venueId === id) ?? null;

    if (!recommendation) {
      return { notFound: true };
    }

    return {
      props: {
        recommendation,
        requestError: null
      }
    };
  } catch (error) {
    return {
      props: {
        recommendation: null,
        requestError: error instanceof Error ? error.message : "Unknown error"
      }
    };
  }
};

export default function VenueDetailPage({
  recommendation,
  requestError
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  if (!recommendation) {
    return (
      <main
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "40px 20px 64px",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        }}
      >
        <h1 style={{ marginTop: 0 }}>Venue details unavailable</h1>
        <p style={{ color: "#b91c1c" }}>
          Couldn&apos;t load venue details{requestError ? `: ${requestError}` : "."}
        </p>
        <p>
          <Link href="/" style={{ color: "#1d4ed8", fontWeight: 600 }}>
            Back to recommendations
          </Link>
        </p>
      </main>
    );
  }

  const freshness = getFreshness(recommendation.lastUpdatedAgoMinutes);
  const energyTone = getEnergyTone(recommendation.energyStatus);
  const entryTone = getEntryTone(recommendation.entryStatus);
  const trendTone = getTrendTone(recommendation.trendStatus);
  const generatedAtDisplay = new Date(recommendation.generatedAt).toLocaleString();
  const eventTonight = hasEventSignalTonight(recommendation.recentActivity);

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "40px 20px 64px",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      }}
    >
      <p style={{ marginTop: 0, marginBottom: 16 }}>
        <Link href="/" style={{ color: "#1d4ed8", fontWeight: 600 }}>
          ← Back to recommendations
        </Link>
      </p>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 34 }}>{recommendation.venueName}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0, flexWrap: "wrap" }}>
          <p style={{ margin: 0, color: "#4b5563", fontSize: 18 }}>{recommendation.neighborhood}</p>
          {recommendation.category && (
            <span
              style={{
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#6b7280",
                padding: "3px 10px",
                fontSize: 14,
                fontWeight: 500
              }}
            >
              {formatCategory(recommendation.category)}
            </span>
          )}
          {recommendation.foursquareOpenNow === true && (
            <span style={{ borderRadius: 999, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", padding: "3px 10px", fontSize: 13, fontWeight: 600 }}>
              Open now
            </span>
          )}
          {recommendation.foursquareOpenNow === false && (
            <span style={{ borderRadius: 999, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", padding: "3px 10px", fontSize: 13, fontWeight: 600 }}>
              Likely closed
            </span>
          )}
          {recommendation.foursquareHours && (
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              {recommendation.foursquareHours}
            </span>
          )}
        </div>
      </header>

      <section
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff"
        }}
      >
        <p style={{ margin: 0, color: "#111827", fontWeight: 600, fontSize: 14 }}>Decision-ready status</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <span
            style={{
              borderRadius: 999,
              border: `1px solid ${energyTone.border}`,
              background: energyTone.background,
              color: energyTone.text,
              padding: "4px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Energy: {recommendation.energyStatus}
          </span>
          <span
            style={{
              borderRadius: 999,
              border: `1px solid ${entryTone.border}`,
              background: entryTone.background,
              color: entryTone.text,
              padding: "4px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Entry: {recommendation.entryStatus}
          </span>
          <span
            style={{
              borderRadius: 999,
              border: `1px solid ${trendTone.border}`,
              background: trendTone.background,
              color: trendTone.text,
              padding: "4px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Trend: {recommendation.trendStatus}
          </span>
        </div>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <span
          style={{
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            color: "#111827",
            padding: "4px 10px",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Pulse: {formatPulseLevel(recommendation.pulseLevel)}
        </span>
        <span
          style={{
            borderRadius: 999,
            border: "1px solid #dbeafe",
            background: "#eff6ff",
            color: "#1d4ed8",
            padding: "4px 10px",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Confidence: {recommendation.confidenceLabel}
        </span>
        <span
          style={{
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            color: "#374151",
            padding: "4px 10px",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Recent signals: {recommendation.recentSignalCount}
        </span>
        {eventTonight && (
          <span
            style={{
              borderRadius: 999,
              border: "1px solid #ddd6fe",
              background: "#f5f3ff",
              color: "#6d28d9",
              padding: "4px 10px",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Event tonight
          </span>
        )}
      </div>

      <div
        style={{
          marginBottom: 18,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${freshness.border}`,
          background: freshness.background
        }}
      >
        <p style={{ margin: 0, color: freshness.text, fontWeight: 600 }}>
          Freshness: {freshness.label} ({formatUpdatedAgo(recommendation.lastUpdatedAgoMinutes)})
        </p>
        <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 14 }}>Generated at {generatedAtDisplay}</p>
      </div>

      <section
        style={{
          marginBottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Why this venue right now</h2>
        <p style={{ margin: 0, color: "#1f2937" }}>{recommendation.why}</p>
      </section>

      <section
        style={{
          marginBottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 20 }}>Submit a signal</h2>
        <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
          Share what it&apos;s like right now — it updates the live ranking.
        </p>
        <SignalButtons
          venueId={recommendation.venueId}
          onSubmitted={() => void router.replace(router.asPath)}
        />
      </section>

      <section
        style={{
          marginBottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Recent activity</h2>
        {recommendation.recentActivity.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>No recent signal activity.</p>
        ) : (
          <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
            {recommendation.recentActivity.map((entry, idx) => (
              <li key={`${recommendation.id}-activity-${idx}`} style={{ marginBottom: 6, color: "#374151" }}>
                <strong>{formatSignalType(entry.signalType)}</strong>
                {" · "}
                {formatTimestamp(entry.timestamp)}
                {" · "}
                {formatUpdatedAgo(entry.minutesAgo)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          marginBottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#ffffff"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Key factors</h2>
        <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
          {recommendation.factors.map((factor, idx) => (
            <li key={`${recommendation.id}-detail-factor-${idx}`} style={{ marginBottom: 6, color: "#374151" }}>
              {factor}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
