"use client";

import { useEffect, useState } from "react";
import RecommendationList from "../components/RecommendationList";
import { fetchRecommendations } from "../lib/api";
import { Recommendation } from "../types/recommendation";

export default function HomePage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchRecommendations();
        setRecommendations(data.recommendations);
        setGeneratedAt(data.generatedAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void loadRecommendations();
  }, []);

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "40px 20px 64px",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 34 }}>Nightloop</h1>
        <p style={{ marginTop: 8, color: "#4b5563", fontSize: 17 }}>
          Tonight&apos;s venue recommendations, ranked by live signals, recent check-ins, and signal provenance.
        </p>
        {generatedAt && !loading && (
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Updated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </header>

      {loading && <p>Finding the best spots for tonight…</p>}
      {!loading && error && (
        <p style={{ color: "#b91c1c" }}>Couldn&apos;t load recommendations right now: {error}</p>
      )}
      {!loading && !error && recommendations.length === 0 && <p>No recommendations available yet.</p>}
      {!loading && !error && recommendations.length > 0 && <RecommendationList items={recommendations} />}
    </main>
  );
}
