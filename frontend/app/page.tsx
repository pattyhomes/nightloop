"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import RecommendationList from "../components/RecommendationList";
import { fetchRecommendations } from "../lib/api";
import { Recommendation } from "../types/recommendation";

// Leaflet requires the browser window — load client-side only.
const VenueMap = dynamic(() => import("../components/VenueMap"), { ssr: false });

const LIVE_REFRESH_INTERVAL_MS = 2000;
const LIVE_REFRESH_WINDOW_MS = 12000;

export default function HomePage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const refreshIntervalRef = useRef<number | null>(null);
  const refreshFetchInFlightRef = useRef(false);

  const loadRecommendations = useCallback(
    async ({ showLoading = false, surfaceError = true }: { showLoading?: boolean; surfaceError?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        if (surfaceError) {
          setError(null);
        }

        const data = await fetchRecommendations();
        setRecommendations(data.recommendations ?? []);
        setGeneratedAt(data.generatedAt ?? null);
        setError(null);
      } catch (err) {
        if (surfaceError) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    []
  );

  const clearLiveRefresh = useCallback(() => {
    if (refreshIntervalRef.current !== null) {
      window.clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  const scheduleLiveRefresh = useCallback(() => {
    clearLiveRefresh();
    const refreshUntil = Date.now() + LIVE_REFRESH_WINDOW_MS;

    const tick = async () => {
      if (refreshFetchInFlightRef.current) return;
      refreshFetchInFlightRef.current = true;
      try {
        await loadRecommendations({ surfaceError: false });
      } finally {
        refreshFetchInFlightRef.current = false;
      }
    };

    void tick();
    refreshIntervalRef.current = window.setInterval(() => {
      if (Date.now() >= refreshUntil) {
        clearLiveRefresh();
        return;
      }

      void tick();
    }, LIVE_REFRESH_INTERVAL_MS);
  }, [clearLiveRefresh, loadRecommendations]);

  useEffect(() => {
    void loadRecommendations({ showLoading: true });

    return () => {
      clearLiveRefresh();
    };
  }, [clearLiveRefresh, loadRecommendations]);

  const handleSignalSubmitted = useCallback(() => {
    scheduleLiveRefresh();
  }, [scheduleLiveRefresh]);

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
        <p style={{ marginTop: 8, color: "#6b7280", fontSize: 14 }}>
          Tap a quick signal under any venue to share what it feels like right now.
        </p>
        <p style={{ marginTop: 8, marginBottom: 0 }}>
          <Link href="/admin/signals" style={{ color: "#1d4ed8", fontWeight: 600 }}>
            Open admin signal entry
          </Link>
        </p>
        {generatedAt && !loading && (
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            Updated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </header>

      {/* ── Map section ───────────────────────────────────────────────────────── */}
      {!loading && !error && recommendations.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: "#111827" }}>
            Venues on the map
          </h2>
          <VenueMap
            recommendations={recommendations}
            activeVenueId={selectedVenueId}
            onVenueSelect={setSelectedVenueId}
            onSignalSubmitted={handleSignalSubmitted}
          />
        </section>
      )}

      {/* ── Recommendation list ───────────────────────────────────────────────── */}
      {loading && <p>Finding the best spots for tonight…</p>}
      {!loading && error && (
        <p style={{ color: "#b91c1c" }}>Couldn&apos;t load recommendations right now: {error}</p>
      )}
      {!loading && !error && recommendations.length === 0 && <p>No recommendations available yet.</p>}
      {!loading && !error && recommendations.length > 0 && (
        <RecommendationList
          items={recommendations}
          onSignalSubmitted={handleSignalSubmitted}
          activeVenueId={selectedVenueId}
          onVenueActive={setSelectedVenueId}
        />
      )}
    </main>
  );
}
