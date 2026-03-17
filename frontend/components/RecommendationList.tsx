import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SignalButtons from "./SignalButtons";
import { Recommendation } from "../types/recommendation";

type RecommendationListProps = {
  items: Recommendation[];
  onSignalSubmitted?: () => void;
  /** venueId of the currently selected venue (from map interaction). */
  activeVenueId?: string | null;
  /** Called when the user asks to focus a venue on the map (e.g. "show on map" button). */
  onVenueActive?: (venueId: string) => void;
};

type SortMode = "default" | "highestPulse" | "mostRecentActivity" | "easiestEntry";

type EntryEaseSignal = {
  waitMinutes: number | null;
  keywordScore: number | null;
};

type PreparedRecommendation = {
  item: Recommendation;
  entryEase: EntryEaseSignal;
};

const WAIT_MINUTES_PATTERN = /(\d+(?:\.\d+)?)\s*(?:minute|min)\b/i;
const POSITIVE_ENTRY_PATTERN =
  /fast entry|easy entry|quick entry|shorter wait|short wait|manageable wait|minimal wait|no line/;
const NEGATIVE_ENTRY_PATTERN =
  /long wait|longer wait|line is long|long line|hard to get in|crowded entry|wait time is a bit longer/;

function formatCategory(category: string): string {
  if (category === "live_music") return "Live Music";
  if (category === "club") return "Nightclub";
  if (category === "bar") return "Bar";
  if (category === "lounge") return "Lounge";
  return category;
}

function formatSignalType(signalType: string | null): string {
  if (!signalType) return "Unknown";
  return signalType.replace(/_/g, " ");
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

function getFreshnessPill(minutes: number): { label: string; text: string; background: string; border: string } {
  if (minutes <= 5) return { label: "Live", text: "#065f46", background: "#ecfdf5", border: "#a7f3d0" };
  if (minutes <= 30) return { label: `${minutes}m ago`, text: "#92400e", background: "#fffbeb", border: "#fde68a" };
  if (minutes <= 90) return { label: `${minutes}m ago`, text: "#6b7280", background: "#f9fafb", border: "#e5e7eb" };
  return { label: `${Math.round(minutes / 60)}h ago`, text: "#9ca3af", background: "#f9fafb", border: "#f3f4f6" };
}

function hasEventSignalTonight(recentActivity: Recommendation["recentActivity"]): boolean {
  return recentActivity.some((a) => a.signalType === "event_report" && a.minutesAgo < 24 * 60);
}

function extractWaitMinutes(text: string): number | null {
  const match = text.match(WAIT_MINUTES_PATTERN);
  if (!match) return null;

  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function getEntryEaseSignal(item: Recommendation): EntryEaseSignal {
  const lines = [item.entryStatus, item.why, item.sourceSummary, ...item.factors];
  let waitMinutes: number | null = null;
  let keywordScore: number | null = null;

  for (const line of lines) {
    const normalized = line.toLowerCase();
    const hasEntryContext = /wait|line|entry/.test(normalized);
    const minutes = extractWaitMinutes(line);

    if (hasEntryContext && minutes !== null) {
      waitMinutes = waitMinutes === null ? minutes : Math.min(waitMinutes, minutes);
    }

    if (POSITIVE_ENTRY_PATTERN.test(normalized)) {
      keywordScore = keywordScore === null ? 2 : Math.max(keywordScore, 2);
      continue;
    }

    if (NEGATIVE_ENTRY_PATTERN.test(normalized)) {
      keywordScore = keywordScore === null ? 0 : Math.max(keywordScore, 0);
      continue;
    }

    if (hasEntryContext) {
      keywordScore = keywordScore === null ? 1 : Math.max(keywordScore, 1);
    }
  }

  return { waitMinutes, keywordScore };
}

function compareDefault(left: Recommendation, right: Recommendation): number {
  return right.score - left.score;
}

function compareEasiestEntry(left: PreparedRecommendation, right: PreparedRecommendation): number {
  if (left.entryEase.waitMinutes !== null || right.entryEase.waitMinutes !== null) {
    if (left.entryEase.waitMinutes === null) return 1;
    if (right.entryEase.waitMinutes === null) return -1;
    if (left.entryEase.waitMinutes !== right.entryEase.waitMinutes) {
      return left.entryEase.waitMinutes - right.entryEase.waitMinutes;
    }
  }

  if (left.entryEase.keywordScore !== null || right.entryEase.keywordScore !== null) {
    if (left.entryEase.keywordScore === null) return 1;
    if (right.entryEase.keywordScore === null) return -1;
    if (left.entryEase.keywordScore !== right.entryEase.keywordScore) {
      return right.entryEase.keywordScore - left.entryEase.keywordScore;
    }
  }

  return compareDefault(left.item, right.item);
}

export default function RecommendationList({
  items,
  onSignalSubmitted,
  activeVenueId,
  onVenueActive
}: RecommendationListProps) {
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const neighborhoods = useMemo(() => {
    return [...new Set(items.map((item) => item.neighborhood))].sort((left, right) =>
      left.localeCompare(right)
    );
  }, [items]);

  const preparedItems = useMemo<PreparedRecommendation[]>(
    () =>
      items.map((item) => ({
        item,
        entryEase: getEntryEaseSignal(item)
      })),
    [items]
  );

  const hasEasiestEntryData = useMemo(
    () =>
      preparedItems.some(
        ({ entryEase }) => entryEase.waitMinutes !== null || entryEase.keywordScore !== null
      ),
    [preparedItems]
  );

  useEffect(() => {
    if (selectedNeighborhood !== "all" && !neighborhoods.includes(selectedNeighborhood)) {
      setSelectedNeighborhood("all");
    }
  }, [neighborhoods, selectedNeighborhood]);

  useEffect(() => {
    if (sortMode === "easiestEntry" && !hasEasiestEntryData) {
      setSortMode("default");
    }
  }, [hasEasiestEntryData, sortMode]);

  // Scroll the active card into view when activeVenueId changes (map → list sync).
  useEffect(() => {
    if (!activeVenueId) return;
    const el = cardRefs.current.get(activeVenueId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeVenueId]);

  const visibleItems = useMemo(() => {
    const filtered = preparedItems.filter(({ item }) => {
      if (selectedNeighborhood === "all") return true;
      return item.neighborhood === selectedNeighborhood;
    });

    filtered.sort((left, right) => {
      if (sortMode === "highestPulse") {
        if (right.item.pulseLevel !== left.item.pulseLevel) {
          return right.item.pulseLevel - left.item.pulseLevel;
        }
        return compareDefault(left.item, right.item);
      }

      if (sortMode === "mostRecentActivity") {
        if (left.item.lastUpdatedAgoMinutes !== right.item.lastUpdatedAgoMinutes) {
          return left.item.lastUpdatedAgoMinutes - right.item.lastUpdatedAgoMinutes;
        }
        return compareDefault(left.item, right.item);
      }

      if (sortMode === "easiestEntry") {
        return compareEasiestEntry(left, right);
      }

      return compareDefault(left.item, right.item);
    });

    return filtered.map(({ item }) => item);
  }, [preparedItems, selectedNeighborhood, sortMode]);

  const sortOptions: Array<{ value: SortMode; label: string }> = useMemo(() => {
    const options: Array<{ value: SortMode; label: string }> = [
      { value: "default", label: "Recommended" },
      { value: "highestPulse", label: "Highest pulse" },
      { value: "mostRecentActivity", label: "Most recent activity" }
    ];

    if (hasEasiestEntryData) {
      options.push({ value: "easiestEntry", label: "Easiest entry" });
    }

    return options;
  }, [hasEasiestEntryData]);

  if (items.length === 0) {
    return <p>No recommendations yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          display: "grid",
          gap: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#f9fafb",
          padding: 12
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151", fontSize: 14 }}>
            Neighborhood
            <select
              aria-label="Filter by neighborhood"
              value={selectedNeighborhood}
              onChange={(event) => setSelectedNeighborhood(event.target.value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "6px 10px",
                background: "#ffffff",
                color: "#111827",
                fontSize: 14
              }}
            >
              <option value="all">All neighborhoods</option>
              {neighborhoods.map((neighborhood) => (
                <option key={neighborhood} value={neighborhood}>
                  {neighborhood}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sortOptions.map((option) => {
              const active = sortMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSortMode(option.value)}
                  style={{
                    borderRadius: 999,
                    border: active ? "1px solid #93c5fd" : "1px solid #d1d5db",
                    background: active ? "#eff6ff" : "#ffffff",
                    color: active ? "#1d4ed8" : "#374151",
                    padding: "6px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
          Showing {visibleItems.length} of {items.length} venues
        </p>
      </section>

      {visibleItems.length === 0 && (
        <p style={{ margin: 0, color: "#6b7280" }}>
          No venues match this neighborhood right now.
        </p>
      )}

      {visibleItems.map((item) => {
        const pulseTone = getPulseTone(item.pulseLevel);
        const energyTone = getEnergyTone(item.energyStatus);
        const entryTone = getEntryTone(item.entryStatus);
        const trendTone = getTrendTone(item.trendStatus);
        const freshnessPill = getFreshnessPill(item.lastUpdatedAgoMinutes);
        const eventTonight = hasEventSignalTonight(item.recentActivity);
        const isActive = item.venueId === activeVenueId;

        return (
          <article
            key={item.id}
            ref={(el) => {
              if (el) cardRefs.current.set(item.venueId, el);
            }}
            style={{
              border: isActive ? "2px solid #4f46e5" : "1px solid #e5e7eb",
              borderRadius: 14,
              padding: isActive ? 15 : 16,
              background: isActive ? "#fafaf9" : "#ffffff",
              boxShadow: isActive
                ? "0 0 0 3px rgba(79,70,229,0.1)"
                : "0 1px 2px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>
                <Link href={`/venue/${encodeURIComponent(item.venueId)}`} style={{ color: "#111827", textDecoration: "none" }}>
                  {item.venueName}
                </Link>
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {onVenueActive && (
                  <button
                    type="button"
                    title="Show on map"
                    onClick={() => onVenueActive(item.venueId)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: "2px 4px",
                      color: isActive ? "#4f46e5" : "#9ca3af",
                      lineHeight: 1
                    }}
                  >
                    📍
                  </button>
                )}
                <span style={{ fontWeight: 600, color: "#111827" }}>Score {item.score.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 10 }}>
              <span style={{ color: "#4b5563" }}>{item.neighborhood}</span>
              {item.category && (
                <span
                  style={{
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    color: "#6b7280",
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  {formatCategory(item.category)}
                </span>
              )}
            </div>
            {/* Trust bar: freshness · event detected · signal count · user reports */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: 10, alignItems: "center" }}>
              <span
                style={{
                  borderRadius: 999,
                  border: `1px solid ${freshnessPill.border}`,
                  background: freshnessPill.background,
                  color: freshnessPill.text,
                  padding: "3px 8px",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {freshnessPill.label}
              </span>
              {item.recentSignalCount > 0 && (
                <span style={{ color: "#6b7280", fontSize: 12 }}>
                  {item.recentSignalCount} recent signal{item.recentSignalCount === 1 ? "" : "s"}
                </span>
              )}
              {eventTonight && (
                <span
                  style={{
                    borderRadius: 999,
                    border: "1px solid #ddd6fe",
                    background: "#f5f3ff",
                    color: "#6d28d9",
                    padding: "3px 8px",
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  Event tonight
                </span>
              )}
              {item.userSignalCount > 0 && (
                <span style={{ color: "#9ca3af", fontSize: 11 }}>
                  {item.userSignalCount} user report{item.userSignalCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {item.baselineNote && item.recentSignalCount === 0 && (
              <p style={{ margin: "0 0 8px", color: "#9ca3af", fontSize: 11, fontStyle: "italic" }}>
                {item.baselineNote}
              </p>
            )}
            <p style={{ marginTop: 0, marginBottom: 12, color: "#111827" }}>{item.why}</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  borderRadius: 999,
                  border: `1px solid ${energyTone.border}`,
                  background: energyTone.background,
                  color: energyTone.text,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                Energy: {item.energyStatus}
              </span>
              <span
                style={{
                  borderRadius: 999,
                  border: `1px solid ${entryTone.border}`,
                  background: entryTone.background,
                  color: entryTone.text,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                Entry: {item.entryStatus}
              </span>
              <span
                style={{
                  borderRadius: 999,
                  border: `1px solid ${trendTone.border}`,
                  background: trendTone.background,
                  color: trendTone.text,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                Trend: {item.trendStatus}
              </span>
            </div>

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
                {item.confidenceLabel} confidence
              </span>
            </div>

            {item.signalCount > 0 && (
              <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 12 }}>
                {item.signalCount} signal{item.signalCount === 1 ? "" : "s"} total
                {item.lastSignalType ? ` · last: ${formatSignalType(item.lastSignalType)}` : ""}
                {item.userSignalCount > 0 ? ` · ${item.userSignalCount} from users` : ""}
                {item.platformSignalCount > 0 ? ` · ${item.platformSignalCount} platform` : ""}
              </p>
            )}

            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {item.factors.slice(0, 3).map((factor, idx) => (
                <li key={`${item.id}-factor-${idx}`} style={{ marginBottom: 4, color: "#374151" }}>
                  {factor}
                </li>
              ))}
            </ul>

            <p style={{ marginTop: 12, marginBottom: 0 }}>
              <Link href={`/venue/${encodeURIComponent(item.venueId)}`} style={{ color: "#1d4ed8", fontWeight: 600 }}>
                View full venue details
              </Link>
            </p>

            <SignalButtons venueId={item.venueId} onSubmitted={onSignalSubmitted} />
          </article>
        );
      })}
    </div>
  );
}
