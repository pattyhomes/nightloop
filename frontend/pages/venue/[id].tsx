import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { fetchRecommendations } from "../../lib/api";
import { Recommendation } from "../../types/recommendation";

type VenueDetailPageProps = {
  recommendation: Recommendation | null;
  requestError: string | null;
};

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

function getFreshness(minutes: number): { label: string; text: string; background: string; border: string } {
  if (minutes <= 5) {
    return { label: "Live", text: "#065f46", background: "#ecfdf5", border: "#a7f3d0" };
  }
  if (minutes <= 20) {
    return { label: "Fresh", text: "#92400e", background: "#fffbeb", border: "#fde68a" };
  }
  return { label: "Aging", text: "#991b1b", background: "#fef2f2", border: "#fecaca" };
}

export const getServerSideProps: GetServerSideProps<VenueDetailPageProps> = async (context) => {
  const id = typeof context.params?.id === "string" ? context.params.id : null;

  if (!id) {
    return { notFound: true };
  }

  try {
    const data = await fetchRecommendations();
    const recommendation = data.recommendations.find((item) => item.id === id) ?? null;

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
  const generatedAtDisplay = new Date(recommendation.generatedAt).toLocaleString();

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
        <p style={{ marginTop: 0, color: "#4b5563", fontSize: 18 }}>{recommendation.neighborhood}</p>
      </header>

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
