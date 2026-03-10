"use client";

import { useEffect, useState } from "react";
import RecommendationList from "../components/RecommendationList";
import { fetchRecommendations } from "../lib/api";
import type { Recommendation } from "../types/recommendation";

export default function HomePage() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchRecommendations();
        if (!active) return;
        setItems(data.recommendations);
        setGeneratedAt(data.generatedAt);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load recommendations");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Nightloop Recommendations</h1>
      {generatedAt ? <p>Batch generated at: {new Date(generatedAt).toLocaleString()}</p> : null}

      {loading ? <p>Loading recommendations...</p> : null}
      {error ? <p>Error: {error}</p> : null}
      {!loading && !error ? <RecommendationList items={items} /> : null}
    </main>
  );
}
