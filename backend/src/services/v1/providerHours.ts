export const NIGHTLIFE_DAY_WINDOW = "18:00-04:00";
export const GOOGLE_HOURS_FIELD_MASK =
  "id,businessStatus,utcOffsetMinutes,regularOpeningHours,currentOpeningHours,regularSecondaryOpeningHours,currentSecondaryOpeningHours";

const GOOGLE_TTL_DAYS = 30;
const WEBSITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type GoogleTimePoint = {
  day?: number;
  hour?: number;
  minute?: number;
};

type GooglePeriod = {
  open?: GoogleTimePoint;
  close?: GoogleTimePoint;
};

type GoogleHoursBlock = {
  openNow?: boolean;
  periods?: GooglePeriod[];
  weekdayDescriptions?: string[];
};

type GoogleSecondaryHoursBlock = {
  periods?: GooglePeriod[];
  weekdayDescriptions?: string[];
  type?: string;
};

export type GooglePlaceHours = {
  id?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  regularOpeningHours?: GoogleHoursBlock;
  currentOpeningHours?: GoogleHoursBlock;
  regularSecondaryOpeningHours?: GoogleSecondaryHoursBlock[];
  currentSecondaryOpeningHours?: GoogleSecondaryHoursBlock[];
};

export type GoogleHoursCandidate = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
  google_place_id: string;
};

type FoursquarePeriod = {
  day?: number;
  open?: string;
  close?: string;
};

type FoursquareCategory = {
  id?: number;
  name?: string;
};

type FoursquareSocialMedia = {
  instagram?: string;
  twitter?: string;
};

export type FoursquarePlaceHours = {
  fsq_id?: string;
  fsq_place_id?: string;
  name?: string;
  timezone?: string;
  verified?: boolean;
  tel?: string;
  website?: string;
  social_media?: FoursquareSocialMedia;
  categories?: FoursquareCategory[];
  related_places?: unknown;
  location?: {
    neighborhood?: string[] | string;
  };
};

export type FoursquareHoursCandidate = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
  latitude: number;
  longitude: number;
};

export type OpenStreetMapHoursCandidate = {
  id: string;
  name: string;
  market_id: string;
  timezone: string;
};

export type OpenStreetMapHoursPlace = {
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  name?: string;
  opening_hours?: string;
  lat?: number;
  lon?: number;
};

export type ParsedWebsiteHours = {
  source_url: string;
  raw_opening_hours?: string[];
  normalized_periods: NormalizedPeriod[];
};

export type VenueWebsiteHoursSource = {
  source_url: string;
  parsed: ParsedWebsiteHours;
};

export type ProviderSchedulePlan = {
  venue_id: string;
  venue_name: string;
  status: "unknown" | "verified_hours" | "temporarily_closed" | "manual_hold";
  source: "provider:google_places" | "provider:foursquare" | "provider:openstreetmap" | "venue_website";
  timezone: string;
  confidence: number;
  weekly_hours: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expires_at: string | null;
};

type NormalizeOptions = {
  now?: Date;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

export type NormalizedPeriod = {
  day: number;
  open_hour: number;
  open_minute: number;
  close_day: number;
  close_hour: number;
  close_minute: number;
};

export type WindowEvaluation = {
  is_open_now: boolean | null;
  opens_later?: boolean;
  closed_today?: boolean;
  opens_at?: string;
  closes_at?: string;
};

export type RequestTimeScheduleEvaluation = {
  metadata: Record<string, unknown>;
  window: WindowEvaluation | null;
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function getLocalParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? date.getUTCDay(),
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

function shiftLocalDate(parts: Pick<LocalParts, "year" | "month" | "day">, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay()
  };
}

function zonedDateToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
}): Date {
  const guess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
  const localAtGuess = getLocalParts(new Date(guess), input.timezone);
  const desiredAsUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
  const localGuessAsUtc = Date.UTC(
    localAtGuess.year,
    localAtGuess.month - 1,
    localAtGuess.day,
    localAtGuess.hour,
    localAtGuess.minute,
    0
  );
  return new Date(guess + desiredAsUtc - localGuessAsUtc);
}

function formatLocalTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function expiresAt(now: Date): string {
  return new Date(now.getTime() + GOOGLE_TTL_DAYS * DAY_MS).toISOString();
}

function ttlExpiresAt(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function normalizeGooglePeriod(period: GooglePeriod): NormalizedPeriod | null {
  if (!period.open || !period.close) return null;
  const day = Number(period.open.day);
  const openHour = Number(period.open.hour);
  const openMinute = Number(period.open.minute ?? 0);
  const closeDay = Number(period.close.day);
  const closeHour = Number(period.close.hour);
  const closeMinute = Number(period.close.minute ?? 0);
  if (![day, openHour, openMinute, closeDay, closeHour, closeMinute].every(Number.isFinite)) return null;
  return {
    day,
    open_hour: openHour,
    open_minute: openMinute,
    close_day: closeDay,
    close_hour: closeHour,
    close_minute: closeMinute
  };
}

function parseFsqTime(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const normalized = value.replace(":", "").trim();
  if (!/^\d{3,4}$/.test(normalized)) return null;
  const padded = normalized.padStart(4, "0");
  return {
    hour: Number(padded.slice(0, 2)),
    minute: Number(padded.slice(2, 4))
  };
}

function normalizeFoursquarePeriod(period: FoursquarePeriod): NormalizedPeriod | null {
  const open = parseFsqTime(period.open);
  const close = parseFsqTime(period.close);
  const fsqDay = Number(period.day);
  if (!open || !close || !Number.isFinite(fsqDay)) return null;
  const day = fsqDay % 7;
  const rollsToNextDay = close.hour < open.hour || (close.hour === open.hour && close.minute <= open.minute);
  return {
    day,
    open_hour: open.hour,
    open_minute: open.minute,
    close_day: rollsToNextDay ? (day + 1) % 7 : day,
    close_hour: close.hour,
    close_minute: close.minute
  };
}

const osmDayMap: Record<string, number> = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6
};

const schemaDayMap: Record<string, string> = {
  Sunday: "Su",
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa"
};

function dayCodesFromToken(token: string): string[] {
  const [startRaw, endRaw] = token.split("-");
  const start = startRaw?.trim();
  const end = endRaw?.trim();
  if (!start || osmDayMap[start] == null) return [];
  if (!end) return [start];
  if (osmDayMap[end] == null) return [];
  const days: string[] = [];
  let current = osmDayMap[start];
  const target = osmDayMap[end];
  for (let guard = 0; guard < 7; guard += 1) {
    const code = Object.entries(osmDayMap).find(([, value]) => value === current)?.[0];
    if (code) days.push(code);
    if (current === target) break;
    current = (current + 1) % 7;
  }
  return days;
}

function parseOpeningHoursValue(value: string): { periods: NormalizedPeriod[]; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { periods: [], error: "empty opening_hours" };
  if (trimmed === "24/7") {
    return {
      periods: Object.values(osmDayMap).map((day) => ({
        day,
        open_hour: 0,
        open_minute: 0,
        close_day: (day + 1) % 7,
        close_hour: 0,
        close_minute: 0
      }))
    };
  }

  const periods: NormalizedPeriod[] = [];
  const rules = trimmed.split(";").map((rule) => rule.trim()).filter(Boolean);
  for (const rule of rules) {
    if (/\b(off|closed)\b/i.test(rule)) continue;
    const match = rule.match(/^([A-Z][a-z](?:-[A-Z][a-z])?(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+(.+)$/);
    if (!match) return { periods: [], error: `unsupported opening_hours rule: ${rule}` };
    const days = match[1].split(",").flatMap((token) => dayCodesFromToken(token.trim()));
    if (days.length === 0) return { periods: [], error: `unsupported opening_hours days: ${match[1]}` };
    const ranges = match[2].split(",").map((range) => range.trim()).filter(Boolean);
    for (const range of ranges) {
      const timeMatch = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!timeMatch) return { periods: [], error: `unsupported opening_hours time range: ${range}` };
      const open = { hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) };
      const close = { hour: Number(timeMatch[3]), minute: Number(timeMatch[4]) };
      if (
        open.hour < 0 || open.hour > 23 || close.hour < 0 || close.hour > 24 ||
        open.minute < 0 || open.minute > 59 || close.minute < 0 || close.minute > 59
      ) {
        return { periods: [], error: `invalid opening_hours time range: ${range}` };
      }
      for (const dayCode of days) {
        const day = osmDayMap[dayCode];
        const rollsToNextDay = close.hour < open.hour || (close.hour === open.hour && close.minute <= open.minute);
        periods.push({
          day,
          open_hour: open.hour,
          open_minute: open.minute,
          close_day: rollsToNextDay || close.hour === 24 ? (day + 1) % 7 : day,
          close_hour: close.hour === 24 ? 0 : close.hour,
          close_minute: close.minute
        });
      }
    }
  }

  return periods.length > 0 ? { periods } : { periods: [], error: "opening_hours contains no open periods" };
}

function scriptJsonLdBodies(html: string): string[] {
  const scriptMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return scriptMatches.map((script) => script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim());
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  return [record, ...(Array.isArray(graph) ? graph.flatMap(flattenJsonLd) : [])];
}

function schemaDayToOsm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.split("/").pop()?.trim() ?? value.trim();
  return schemaDayMap[raw] ?? (osmDayMap[raw] == null ? null : raw);
}

function openingHoursSpecToRule(spec: Record<string, unknown>): string | null {
  const opens = typeof spec.opens === "string" ? spec.opens.slice(0, 5) : null;
  const closes = typeof spec.closes === "string" ? spec.closes.slice(0, 5) : null;
  if (!opens || !closes) return null;
  const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
  const dayCodes = days.map(schemaDayToOsm).filter((day): day is string => Boolean(day));
  if (dayCodes.length === 0) return null;
  return `${dayCodes.join(",")} ${opens}-${closes}`;
}

export function parseVenueWebsiteHoursFromHtml(html: string, sourceUrl: string): ParsedWebsiteHours {
  const rawRules: string[] = [];
  for (const body of scriptJsonLdBodies(html)) {
    try {
      const parsed = JSON.parse(body);
      for (const item of flattenJsonLd(parsed)) {
        const specs = item.openingHoursSpecification;
        const specItems = Array.isArray(specs) ? specs : specs ? [specs] : [];
        for (const spec of specItems) {
          if (spec && typeof spec === "object") {
            const rule = openingHoursSpecToRule(spec as Record<string, unknown>);
            if (rule) rawRules.push(rule);
          }
        }
        const openingHours = item.openingHours;
        const openingRules = Array.isArray(openingHours) ? openingHours : openingHours ? [openingHours] : [];
        for (const rule of openingRules) {
          if (typeof rule === "string" && rule.trim()) rawRules.push(rule.trim());
        }
      }
    } catch {
      continue;
    }
  }
  const combined = rawRules.join("; ");
  const parsed = combined ? parseOpeningHoursValue(combined) : { periods: [], error: "no structured website hours found" };
  return {
    source_url: sourceUrl,
    raw_opening_hours: rawRules,
    normalized_periods: parsed.periods
  };
}

function closeDayOffset(period: NormalizedPeriod): number {
  const offset = (period.close_day - period.day + 7) % 7;
  if (offset > 0) return offset;
  if (
    period.close_hour < period.open_hour ||
    (period.close_hour === period.open_hour && period.close_minute <= period.open_minute)
  ) {
    return 1;
  }
  return 0;
}

export function evaluateNightlifeWindow(periods: NormalizedPeriod[], timezone: string, now: Date): WindowEvaluation {
  if (periods.length === 0) return { is_open_now: null };

  const local = getLocalParts(now, timezone);
  const targetDate = local.hour < 4
    ? shiftLocalDate(local, -1)
    : shiftLocalDate(local, 0);
  const nightlifeStart = zonedDateToUtc({
    ...targetDate,
    hour: 18,
    minute: 0,
    timezone
  });
  const nightlifeEndDate = shiftLocalDate(targetDate, 1);
  const nightlifeEnd = zonedDateToUtc({
    ...nightlifeEndDate,
    hour: 4,
    minute: 0,
    timezone
  });

  const windows = periods
    .filter((period) => period.day === targetDate.weekday)
    .map((period) => {
      const start = zonedDateToUtc({
        ...targetDate,
        hour: period.open_hour,
        minute: period.open_minute,
        timezone
      });
      const closeDate = shiftLocalDate(targetDate, closeDayOffset(period));
      const end = zonedDateToUtc({
        ...closeDate,
        hour: period.close_hour,
        minute: period.close_minute,
        timezone
      });
      return { period, start, end };
    })
    .filter((window) => window.end > nightlifeStart && window.start < nightlifeEnd)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  if (windows.length === 0) {
    return { is_open_now: false, closed_today: true };
  }

  const current = windows.find((window) => window.start <= now && window.end > now);
  if (current) {
    return {
      is_open_now: true,
      opens_at: formatLocalTime(current.period.open_hour, current.period.open_minute),
      closes_at: formatLocalTime(current.period.close_hour, current.period.close_minute)
    };
  }

  const later = windows.find((window) => window.start > now);
  if (later) {
    return {
      is_open_now: false,
      opens_later: true,
      opens_at: formatLocalTime(later.period.open_hour, later.period.open_minute),
      closes_at: formatLocalTime(later.period.close_hour, later.period.close_minute)
    };
  }

  return {
    is_open_now: false,
    closed_today: true,
    opens_at: formatLocalTime(windows[0].period.open_hour, windows[0].period.open_minute),
    closes_at: formatLocalTime(windows[0].period.close_hour, windows[0].period.close_minute)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedPeriod(value: unknown): NormalizedPeriod | null {
  if (!isRecord(value)) return null;
  const period = {
    day: Number(value.day),
    open_hour: Number(value.open_hour),
    open_minute: Number(value.open_minute ?? 0),
    close_day: Number(value.close_day),
    close_hour: Number(value.close_hour),
    close_minute: Number(value.close_minute ?? 0)
  };
  return Object.values(period).every(Number.isFinite) ? period : null;
}

function normalizedPeriodsFromWeeklyHours(weeklyHours: Record<string, unknown> | null | undefined): NormalizedPeriod[] {
  const raw = weeklyHours?.normalized_periods;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizedPeriod).filter((period): period is NormalizedPeriod => Boolean(period));
}

export function evaluateRequestTimeSchedule(
  input: {
    weeklyHours?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
    timezone: string;
    now?: Date;
  }
): RequestTimeScheduleEvaluation {
  const now = input.now ?? new Date();
  const metadata = { ...(input.metadata ?? {}) };
  const periods = normalizedPeriodsFromWeeklyHours(input.weeklyHours);
  if (periods.length === 0) {
    return { metadata, window: null };
  }

  const window = evaluateNightlifeWindow(periods, input.timezone, now);
  metadata.is_open_now = window.is_open_now;
  metadata.opens_at = window.opens_at ?? null;
  metadata.closes_at = window.closes_at ?? null;
  metadata.opens_later = window.opens_later === true;
  metadata.closed_today = window.closed_today === true;
  metadata.request_time_evaluated_at = now.toISOString();
  metadata.request_time_timezone = input.timezone;
  return { metadata, window };
}

function hasGoogleHours(place: GooglePlaceHours): boolean {
  return Boolean(
    (place.regularOpeningHours?.periods?.length ?? 0) > 0 ||
      (place.currentOpeningHours?.periods?.length ?? 0) > 0 ||
      (place.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0 ||
      (place.currentOpeningHours?.weekdayDescriptions?.length ?? 0) > 0 ||
      (place.regularSecondaryOpeningHours ?? []).some((block) => (block.periods?.length ?? 0) > 0) ||
      (place.currentSecondaryOpeningHours ?? []).some((block) => (block.periods?.length ?? 0) > 0)
  );
}

function flattenSecondary(blocks: GoogleSecondaryHoursBlock[] | undefined): GooglePeriod[] {
  return (blocks ?? []).flatMap((block) => block.periods ?? []);
}

export function normalizeGooglePlaceHours(
  candidate: GoogleHoursCandidate,
  place: GooglePlaceHours,
  options: NormalizeOptions = {}
): ProviderSchedulePlan {
  const now = options.now ?? new Date();
  const regularPeriods = (place.regularOpeningHours?.periods ?? []).map(normalizeGooglePeriod).filter(Boolean) as NormalizedPeriod[];
  const currentPeriods = (place.currentOpeningHours?.periods ?? []).map(normalizeGooglePeriod).filter(Boolean) as NormalizedPeriod[];
  const secondaryPeriods = [
    ...flattenSecondary(place.currentSecondaryOpeningHours),
    ...flattenSecondary(place.regularSecondaryOpeningHours)
  ].map(normalizeGooglePeriod).filter(Boolean) as NormalizedPeriod[];
  const normalizedPeriods = currentPeriods.length > 0 ? currentPeriods : regularPeriods;
  const window = evaluateNightlifeWindow(normalizedPeriods, candidate.timezone, now);
  const hasHours = hasGoogleHours(place);
  const status = place.businessStatus === "CLOSED_TEMPORARILY"
    ? "temporarily_closed"
    : hasHours
      ? "verified_hours"
      : "unknown";
  const explicitOpenNow = place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow;
  const isOpenNow = status === "verified_hours"
    ? explicitOpenNow ?? window.is_open_now
    : null;
  const metadata: Record<string, unknown> = {
    google_place_id: candidate.google_place_id,
    google_place_resource_id: place.id ?? null,
    business_status: place.businessStatus ?? "UNKNOWN",
    utc_offset_minutes: place.utcOffsetMinutes ?? null,
    source_provider: "google_places",
    fetched_by: "syncGoogleHours",
    fetched_at: now.toISOString(),
    expires_at: expiresAt(now),
    nightlife_day_window: NIGHTLIFE_DAY_WINDOW,
    is_open_now: isOpenNow,
    opens_at: status === "verified_hours" ? window.opens_at ?? null : null,
    closes_at: status === "verified_hours" ? window.closes_at ?? null : null,
    hours_missing: !hasHours
  };
  if (status === "verified_hours") {
    metadata.opens_later = window.opens_later === true;
    metadata.closed_today = window.closed_today === true;
  }

  return {
    venue_id: candidate.id,
    venue_name: candidate.name,
    status,
    source: "provider:google_places",
    timezone: candidate.timezone,
    confidence: status === "verified_hours" ? 0.9 : status === "temporarily_closed" ? 0.85 : 0.25,
    expires_at: expiresAt(now),
    weekly_hours: {
      regular_periods: place.regularOpeningHours?.periods ?? [],
      regular_weekday_descriptions: place.regularOpeningHours?.weekdayDescriptions ?? [],
      current_periods: place.currentOpeningHours?.periods ?? [],
      current_weekday_descriptions: place.currentOpeningHours?.weekdayDescriptions ?? [],
      regular_secondary_opening_hours: place.regularSecondaryOpeningHours ?? [],
      current_secondary_opening_hours: place.currentSecondaryOpeningHours ?? [],
      normalized_periods: normalizedPeriods,
      normalized_secondary_periods: secondaryPeriods
    },
    metadata
  };
}

export function normalizeOpenStreetMapHours(
  candidate: OpenStreetMapHoursCandidate,
  place: OpenStreetMapHoursPlace,
  options: NormalizeOptions = {}
): ProviderSchedulePlan {
  const now = options.now ?? new Date();
  const rawOpeningHours = place.opening_hours ?? "";
  const parsed = parseOpeningHoursValue(rawOpeningHours);
  const hasHours = parsed.periods.length > 0;
  const window = evaluateNightlifeWindow(parsed.periods, candidate.timezone, now);
  const sourceUrl = `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`;
  const metadata: Record<string, unknown> = {
    osm_type: place.osm_type,
    osm_id: place.osm_id,
    osm_name: place.name ?? null,
    osm_opening_hours: rawOpeningHours,
    source_provider: "openstreetmap",
    source_url: sourceUrl,
    attribution: "OpenStreetMap contributors",
    license: "ODbL",
    fetched_by: "syncOpenStreetMapHours",
    fetched_at: now.toISOString(),
    nightlife_day_window: NIGHTLIFE_DAY_WINDOW,
    internal_only_until_ui_attribution: true,
    is_open_now: hasHours ? window.is_open_now : null,
    opens_at: hasHours ? window.opens_at ?? null : null,
    closes_at: hasHours ? window.closes_at ?? null : null,
    hours_missing: !hasHours
  };
  if (!hasHours && parsed.error) metadata.parse_error = parsed.error;
  if (hasHours) {
    metadata.opens_later = window.opens_later === true;
    metadata.closed_today = window.closed_today === true;
  }

  return {
    venue_id: candidate.id,
    venue_name: candidate.name,
    status: hasHours ? "verified_hours" : "unknown",
    source: "provider:openstreetmap",
    timezone: candidate.timezone,
    confidence: hasHours ? 0.58 : 0.18,
    expires_at: null,
    weekly_hours: {
      raw_opening_hours: rawOpeningHours,
      normalized_periods: parsed.periods
    },
    metadata
  };
}

export function normalizeVenueWebsiteHours(
  candidate: OpenStreetMapHoursCandidate,
  source: VenueWebsiteHoursSource,
  options: NormalizeOptions = {}
): ProviderSchedulePlan {
  const now = options.now ?? new Date();
  const periods = source.parsed.normalized_periods;
  const hasHours = periods.length > 0;
  const window = evaluateNightlifeWindow(periods, candidate.timezone, now);
  const expires = ttlExpiresAt(now, WEBSITE_TTL_DAYS);
  const metadata: Record<string, unknown> = {
    source_provider: "venue_website",
    source_url: source.source_url,
    fetched_by: "syncVenueWebsiteHours",
    fetched_at: now.toISOString(),
    expires_at: expires,
    ttl_days: WEBSITE_TTL_DAYS,
    nightlife_day_window: NIGHTLIFE_DAY_WINDOW,
    is_open_now: hasHours ? window.is_open_now : null,
    opens_at: hasHours ? window.opens_at ?? null : null,
    closes_at: hasHours ? window.closes_at ?? null : null,
    hours_missing: !hasHours
  };
  if (hasHours) {
    metadata.opens_later = window.opens_later === true;
    metadata.closed_today = window.closed_today === true;
  }

  return {
    venue_id: candidate.id,
    venue_name: candidate.name,
    status: hasHours ? "verified_hours" : "unknown",
    source: "venue_website",
    timezone: candidate.timezone,
    confidence: hasHours ? 0.82 : 0.2,
    expires_at: expires,
    weekly_hours: {
      source_url: source.source_url,
      raw_opening_hours: source.parsed.raw_opening_hours ?? [],
      normalized_periods: periods
    },
    metadata
  };
}

function fsqNeighborhood(value: FoursquarePlaceHours["location"]): string | null {
  const neighborhood = value?.neighborhood;
  if (Array.isArray(neighborhood)) return neighborhood.find(Boolean) ?? null;
  return typeof neighborhood === "string" && neighborhood.trim() ? neighborhood.trim() : null;
}

export function normalizeFoursquarePlaceHours(
  candidate: FoursquareHoursCandidate,
  place: FoursquarePlaceHours,
  options: NormalizeOptions = {}
): ProviderSchedulePlan {
  const now = options.now ?? new Date();
  const categoryNames = (place.categories ?? [])
    .map((category) => category.name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  const hasRelatedPlaces = typeof place.related_places === "object" && place.related_places !== null;
  const status = "unknown";
  const metadata: Record<string, unknown> = {
    fsq_id: place.fsq_place_id ?? place.fsq_id ?? null,
    source_provider: "foursquare",
    fetched_by: "syncFoursquareHours",
    fetched_at: now.toISOString(),
    expires_at: expiresAt(now),
    nightlife_day_window: NIGHTLIFE_DAY_WINDOW,
    foursquare_verified: place.verified ?? false,
    phone: place.tel ?? null,
    website: place.website ?? null,
    instagram: place.social_media?.instagram ?? null,
    twitter: place.social_media?.twitter ?? null,
    category_names: categoryNames,
    related_places_present: hasRelatedPlaces,
    provider_neighborhood: fsqNeighborhood(place.location),
    is_open_now: null,
    opens_at: null,
    closes_at: null,
    hours_missing: true
  };

  return {
    venue_id: candidate.id,
    venue_name: candidate.name,
    status,
    source: "provider:foursquare",
    timezone: place.timezone ?? candidate.timezone,
    confidence: 0.22,
    expires_at: expiresAt(now),
    weekly_hours: {
      display: null,
      regular_periods: [],
      popular_periods: []
    },
    metadata
  };
}
