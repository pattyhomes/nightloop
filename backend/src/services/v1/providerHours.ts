export const NIGHTLIFE_DAY_WINDOW = "18:00-04:00";
export const GOOGLE_HOURS_FIELD_MASK =
  "id,businessStatus,utcOffsetMinutes,regularOpeningHours,currentOpeningHours,regularSecondaryOpeningHours,currentSecondaryOpeningHours";

const GOOGLE_TTL_DAYS = 30;
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

export type FoursquarePlaceHours = {
  fsq_id?: string;
  fsq_place_id?: string;
  name?: string;
  timezone?: string;
  verified?: boolean;
  popularity?: number;
  price?: number;
  rating?: number;
  closed_bucket?: string;
  hours?: {
    open_now?: boolean;
    display?: string;
    regular?: FoursquarePeriod[];
  };
  hours_popular?: FoursquarePeriod[];
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

export type ProviderSchedulePlan = {
  venue_id: string;
  venue_name: string;
  status: "unknown" | "verified_hours" | "temporarily_closed" | "manual_hold";
  source: "provider:google_places" | "provider:foursquare";
  timezone: string;
  confidence: number;
  weekly_hours: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expires_at: string;
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

type NormalizedPeriod = {
  day: number;
  open_hour: number;
  open_minute: number;
  close_day: number;
  close_hour: number;
  close_minute: number;
};

type WindowEvaluation = {
  is_open_now: boolean | null;
  opens_later?: boolean;
  closed_today?: boolean;
  opens_at?: string;
  closes_at?: string;
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

function evaluateNightlifeWindow(periods: NormalizedPeriod[], timezone: string, now: Date): WindowEvaluation {
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
  const regularPeriods = (place.hours?.regular ?? []).map(normalizeFoursquarePeriod).filter(Boolean) as NormalizedPeriod[];
  const popularPeriods = (place.hours_popular ?? []).map(normalizeFoursquarePeriod).filter(Boolean) as NormalizedPeriod[];
  const window = evaluateNightlifeWindow(regularPeriods, place.timezone ?? candidate.timezone, now);
  const hasHours = regularPeriods.length > 0 || Boolean(place.hours?.display);
  const closedBucket = place.closed_bucket ?? "";
  const status = /verylikelyclosed/i.test(closedBucket)
    ? "temporarily_closed"
    : hasHours
      ? "verified_hours"
      : "unknown";
  const popularity = typeof place.popularity === "number" ? clamp(place.popularity) : null;
  const metadata: Record<string, unknown> = {
    fsq_id: place.fsq_place_id ?? place.fsq_id ?? null,
    source_provider: "foursquare",
    fetched_by: "syncFoursquareHours",
    fetched_at: now.toISOString(),
    expires_at: expiresAt(now),
    nightlife_day_window: NIGHTLIFE_DAY_WINDOW,
    foursquare_verified: place.verified ?? false,
    popularity,
    price: typeof place.price === "number" ? place.price : null,
    rating: typeof place.rating === "number" ? place.rating : null,
    closed_bucket: closedBucket || null,
    provider_neighborhood: fsqNeighborhood(place.location),
    is_open_now: status === "verified_hours" ? place.hours?.open_now ?? window.is_open_now : null,
    opens_at: status === "verified_hours" ? window.opens_at ?? null : null,
    closes_at: status === "verified_hours" ? window.closes_at ?? null : null,
    hours_popular_present: popularPeriods.length > 0,
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
    source: "provider:foursquare",
    timezone: place.timezone ?? candidate.timezone,
    confidence: status === "verified_hours" ? (place.verified ? 0.84 : 0.72) : status === "temporarily_closed" ? 0.7 : 0.22,
    expires_at: expiresAt(now),
    weekly_hours: {
      display: place.hours?.display ?? null,
      regular_periods: regularPeriods,
      popular_periods: popularPeriods
    },
    metadata
  };
}
