/**
 * Lightweight time-of-week baseline signal layer.
 *
 * Purpose
 * ───────
 * Provide a conservative expected-energy floor for venues during sparse-data
 * windows (low recentSignalCount). Real live signals always dominate; the
 * baseline only fills the gap when the signal bucket is thin.
 *
 * Blending rule (see blendWithBaseline)
 * ──────────────────────────────────────
 *   baselineWeight = max(0, 0.30 − recentSignalCount × 0.10)
 *
 *   recentSignalCount │ baselineWeight │ note
 *   ──────────────────┼────────────────┼──────────────────────────────
 *   0                 │ 0.30           │ no live data — baseline helps
 *   1                 │ 0.20           │ thin signal — light touch
 *   2                 │ 0.10           │ some signal — minimal effect
 *   ≥ 3               │ 0.00           │ live signals dominate fully
 *
 * Design constraints
 * ──────────────────
 * - No forecasting, no ML, no historical analytics.
 * - Simple explicit time windows; category-level profiles are editable constants.
 * - Scores are soft floors, not hard overrides.
 * - Works purely from wall clock + venue category — no external data required.
 */

// ─── Time window ─────────────────────────────────────────────────────────────

/**
 * Four coarse time windows that capture the main activity patterns for
 * San Francisco nightlife venues. All logic uses local wall-clock hours,
 * which is good enough for a V1 single-city baseline. Adjust for multi-tz
 * when city support expands.
 *
 *   peak            Fri 21:00 → Sat 02:00 | Sat 21:00 → Sun 03:00
 *   evening         Thu–Sat 18:00–21:00   | Sun 17:00–21:00
 *   weekday_evening Mon–Thu 19:00–23:00
 *   off             everything else
 */
type TimeWindow = "peak" | "evening" | "weekday_evening" | "off";

export function classifyTimeWindow(now: Date): TimeWindow {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const hour = now.getHours();

  // Peak: Fri 21:00+ rolling into early Sat, Sat 21:00+ rolling into early Sun
  if ((day === 5 && hour >= 21) || (day === 6 && hour < 2)) return "peak"; // Fri → Sat
  if ((day === 6 && hour >= 21) || (day === 0 && hour < 3)) return "peak"; // Sat → Sun

  // Evening warmup: Thu–Sat 18–21, Sun 17–21
  if (day >= 4 && day <= 6 && hour >= 18 && hour < 21) return "evening";
  if (day === 0 && hour >= 17 && hour < 21) return "evening";

  // Weekday evening: Mon–Thu 19–23 (Thu overlaps with evening above at 18–19, handled there)
  if (day >= 1 && day <= 4 && hour >= 19 && hour < 23) return "weekday_evening";

  return "off";
}

// ─── Category baseline scores ─────────────────────────────────────────────────

interface CategoryBaseline {
  peak: number;
  evening: number;
  weekday_evening: number;
  off: number;
}

/**
 * Expected energy scores per category per time window (0–1 scale).
 *
 * Intentionally conservative — these are soft floors informed by common SF
 * nightlife patterns, not precise forecasts. Edit freely as real patterns emerge.
 *
 *   club:       highest weekend peaks, drops sharply on weekdays
 *   live_music: meaningful weekday evening presence (shows run weeknights)
 *   bar:        lighter and more consistent across the week
 *   lounge:     flattest curve — always moderate
 */
const CATEGORY_BASELINES: Record<string, CategoryBaseline> = {
  club:       { peak: 0.62, evening: 0.42, weekday_evening: 0.25, off: 0.08 },
  live_music: { peak: 0.55, evening: 0.45, weekday_evening: 0.32, off: 0.12 },
  bar:        { peak: 0.48, evening: 0.38, weekday_evening: 0.28, off: 0.12 },
  lounge:     { peak: 0.42, evening: 0.38, weekday_evening: 0.25, off: 0.12 }
} as const;

// Used for any category not in the map above.
const DEFAULT_BASELINE: CategoryBaseline = { peak: 0.45, evening: 0.35, weekday_evening: 0.25, off: 0.10 };

function getBaselineScore(category: string, window: TimeWindow): number {
  const profile = CATEGORY_BASELINES[category] ?? DEFAULT_BASELINE;
  return profile[window];
}

// ─── Baseline note (UX context, shown only when baseline is active) ───────────

/**
 * Short human-readable context lines shown on recommendation cards when the
 * baseline is actively contributing (recentSignalCount ≤ 2, non-off window).
 * All notes are hedged to avoid sounding like real-time data.
 */
const BASELINE_NOTES: Record<string, Partial<Record<TimeWindow, string>>> = {
  club: {
    peak:            "Clubs here typically get going on Friday and Saturday nights.",
    evening:         "Clubs usually start filling up around this hour.",
    weekday_evening: "Weeknight club crowds are typically lighter — check for a special event."
  },
  live_music: {
    peak:            "Live music venues often run weekend headline shows.",
    evening:         "Evening shows usually get going around now.",
    weekday_evening: "Weeknight shows tend to have smaller, more dedicated crowds."
  },
  bar: {
    peak:    "Bars in this neighborhood tend to be busiest on weekend nights.",
    evening: "Bar scene is usually building up during this window."
  },
  lounge: {
    peak:    "Lounges here tend to reach peak occupancy on weekend nights.",
    evening: "Lounge scene picks up in the evenings."
  }
};

function getBaselineNote(category: string, window: TimeWindow): string | undefined {
  return BASELINE_NOTES[category]?.[window];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BaselineBlendResult {
  /** Final blended score (0–1, 4 decimal places). */
  score: number;
  /** Fraction of the score contributed by the baseline (0.00–0.30). */
  baselineWeight: number;
  /**
   * Optional context note for the UX, populated only when the baseline is
   * meaningfully contributing (baselineWeight ≥ 0.10) and the time window
   * is not "off" (flat baseline is not useful context for users).
   */
  baselineNote: string | undefined;
}

/**
 * Blend a live venue score with the time-of-week baseline.
 *
 * @param liveScore          Score from live signals (0–1).
 * @param category           Venue category ("club" | "bar" | "lounge" | "live_music").
 * @param recentSignalCount  Signals received in the recent window (0 = no live data).
 * @param now                Current time; defaults to wall clock.
 */
export function blendWithBaseline(
  liveScore: number,
  category: string,
  recentSignalCount: number,
  now: Date = new Date()
): BaselineBlendResult {
  const window = classifyTimeWindow(now);
  const baselineScore = getBaselineScore(category, window);

  // Weight decreases linearly with live signal density; floor is 0.
  const baselineWeight = Math.max(0, 0.30 - recentSignalCount * 0.10);

  const blended = liveScore * (1 - baselineWeight) + baselineScore * baselineWeight;
  const score = Math.round(blended * 10_000) / 10_000;

  // Surface a note only when baseline is meaningfully active and informative.
  const baselineNote =
    baselineWeight >= 0.10 && window !== "off"
      ? getBaselineNote(category, window)
      : undefined;

  return { score, baselineWeight, baselineNote };
}
