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
    <main>
      <h1>Nightloop</h1>
      <p>Venue recommendations</p>
      {loading && <p>Loading recommendations…</p>}
      {!loading && error && <p>Failed to load recommendations: {error}</p>}
      {!loading && !error && recommendations.length === 0 && <p>No recommendations yet.</p>}
      {!loading && !error && recommendations.length > 0 && (
        <>
          {generatedAt && <p>Last updated: {new Date(generatedAt).toLocaleString()}</p>}
          <RecommendationList items={recommendations} />
        </>
      )}
    </main>
  );
}
