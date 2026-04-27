export type PublicVenueSourceInput = {
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  name?: string | null;
};

export const PUBLIC_VENUE_SQL = `
  AND COALESCE(v.source, '') <> 'phase2-test'
  AND COALESCE(v.metadata->>'fixture', 'false') <> 'true'
  AND COALESCE(v.metadata->>'test_run_id', '') = ''
  AND v.name NOT ILIKE 'Phase 2 %'
`;

export type ExpectedPulseInput = {
  now?: Date;
  category?: string | null;
  eventContext?: { has_event_tonight?: boolean } | null;
  fsqPopularity?: number | null;
  fsqPrice?: number | null;
  sourceQuality?: number | null;
  timezone?: string;
};

export type ExpectedPulse = {
  level: number;
  score: number;
  copy: string;
  basis: string[];
};

export type DiversityItem = {
  id: string;
  score: number;
  neighborhood?: string | null;
  category?: string | null;
};

export type DiversityOptions = {
  neighborhoodSoftCap: number;
  categorySoftCap: number;
  window: number;
};

const categoryAliases: Record<string, string> = {
  club: "club",
  nightclub: "club",
  dance: "club",
  bar: "bar",
  lounge: "lounge",
  live_music: "music",
  music: "music",
  karaoke: "karaoke"
};

export function isPublicVenueSource(input: PublicVenueSourceInput): boolean {
  const source = input.source ?? "";
  const metadata = input.metadata ?? {};
  const name = input.name ?? "";
  if (source === "phase2-test") return false;
  if (metadata.fixture === true || metadata.fixture === "true") return false;
  if (typeof metadata.test_run_id === "string" && metadata.test_run_id.length > 0) return false;
  if (/^Phase 2\b/i.test(name)) return false;
  return true;
}

function localDayHour(now: Date, timezone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? now.getUTCHours());
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayText ?? "");
  return {
    weekday: weekday >= 0 ? weekday : now.getUTCDay(),
    hour
  };
}

function timeCurve(now: Date, timezone: string): { score: number; basis: string } {
  const { weekday, hour } = localDayHour(now, timezone);
  const weekend = weekday === 5 || weekday === 6;
  const thursday = weekday === 4;
  if (weekend && (hour >= 23 || hour < 2)) return { score: 0.9, basis: weekday === 6 ? "time_curve:saturday_late" : "time_curve:friday_late" };
  if ((weekend || thursday) && hour >= 21) return { score: 0.68, basis: "time_curve:warmup" };
  if (hour >= 18 && hour < 21) return { score: 0.38, basis: "time_curve:early_evening" };
  if (hour < 4 && weekend) return { score: 0.55, basis: "time_curve:post_peak" };
  return { score: 0.2, basis: "time_curve:quiet" };
}

function archetype(category?: string | null): { score: number; basis: string } {
  const normalized = categoryAliases[(category ?? "").toLowerCase()] ?? "venue";
  if (normalized === "club") return { score: 0.82, basis: "archetype:club" };
  if (normalized === "bar") return { score: 0.58, basis: "archetype:bar" };
  if (normalized === "music") return { score: 0.62, basis: "archetype:music" };
  if (normalized === "lounge") return { score: 0.52, basis: "archetype:lounge" };
  if (normalized === "karaoke") return { score: 0.5, basis: "archetype:karaoke" };
  return { score: 0.42, basis: "archetype:venue" };
}

export function calculateExpectedPulse(input: ExpectedPulseInput): ExpectedPulse {
  const now = input.now ?? new Date();
  const timezone = input.timezone ?? "America/Los_Angeles";
  const curve = timeCurve(now, timezone);
  const type = archetype(input.category);
  const basis = [curve.basis, type.basis];
  let score = curve.score * 0.46 + type.score * 0.28 + Number(input.sourceQuality ?? 0.55) * 0.12;

  if (input.eventContext?.has_event_tonight) {
    score += 0.22;
    basis.push("event:tonight");
  }
  if (typeof input.fsqPopularity === "number" && Number.isFinite(input.fsqPopularity)) {
    score += Math.min(0.16, Math.max(0, input.fsqPopularity) * 0.16);
    basis.push("foursquare:popularity");
  }
  if (typeof input.fsqPrice === "number" && Number.isFinite(input.fsqPrice) && input.fsqPrice >= 3) {
    score += 0.03;
    basis.push("foursquare:price");
  }

  const clamped = Math.max(0, Math.min(1, score));
  const level = clamped >= 0.72 ? 3 : clamped >= 0.46 ? 2 : 1;
  const eventCopy = input.eventContext?.has_event_tonight ? " with a source-backed event" : "";

  return {
    level,
    score: clamped,
    copy: `Expected tonight${eventCopy}, based on venue type and current timing.`,
    basis
  };
}

export function rerankForDiversity<T extends DiversityItem>(items: T[], options: DiversityOptions): T[] {
  const remaining = [...items].sort((left, right) => right.score - left.score);
  const ranked: T[] = [];
  const neighborhoodCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  while (remaining.length > 0) {
    const nextIndex = remaining
      .map((item, index) => {
        const neighborhood = item.neighborhood ?? "Unknown";
        const category = item.category ?? "unknown";
        const neighborhoodPenalty =
          ranked.length < options.window && (neighborhoodCounts.get(neighborhood) ?? 0) >= options.neighborhoodSoftCap
            ? 30
            : 0;
        const categoryPenalty =
          ranked.length < options.window && (categoryCounts.get(category) ?? 0) >= options.categorySoftCap
            ? 18
            : 0;
        return {
          index,
          adjusted: item.score - neighborhoodPenalty - categoryPenalty
        };
      })
      .sort((left, right) => right.adjusted - left.adjusted || left.index - right.index)[0]?.index ?? 0;

    const [next] = remaining.splice(nextIndex, 1);
    if (!next) break;
    ranked.push(next);
    const neighborhood = next.neighborhood ?? "Unknown";
    const category = next.category ?? "unknown";
    neighborhoodCounts.set(neighborhood, (neighborhoodCounts.get(neighborhood) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return ranked;
}
