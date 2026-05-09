export type VenueLivenessState = "live" | "opens_later" | "closed_today" | "unknown";
export type HoursState = "source_verified" | "unknown" | "temporary_closed" | "manual_hold";
export type RecommendationConfidence = "high" | "medium" | "low";

export type VenueLivenessInput = {
  scheduleStatus?: string | null;
  scheduleSource?: string | null;
  scheduleConfidence?: number | string | null;
  scheduleVerifiedAt?: string | null;
  scheduleFetchedAt?: string | null;
  scheduleMetadata?: Record<string, unknown> | null;
  pulseLevel?: number | string | null;
  recentSignalCount?: number | string | null;
  liveSignalCount?: number | string | null;
  liveUniqueUserCount?: number | string | null;
};

export type VenueLiveness = {
  state: VenueLivenessState;
  hours_state: HoursState;
  confidence: RecommendationConfidence;
  opens_at: string | null;
  closes_at: string | null;
  source_open_now: boolean;
  expected_pulse_level: number;
  live_signal_count: number;
  live_unique_user_count: number;
  copy: {
    label: string;
    supporting_text: string;
    provenance: string;
  };
  provenance: {
    source: string;
    verified_at: string | null;
    fetched_at: string | null;
  };
};

const LIVE_SIGNAL_MINIMUM = 3;
const LIVE_UNIQUE_USER_MINIMUM = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberValue(value: number | string | null | undefined, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
}

function metadataString(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const direct = stringValue(metadata[key]);
    if (direct) return direct;
  }

  const currentPeriod = metadata.current_period;
  if (currentPeriod && typeof currentPeriod === "object") {
    for (const key of keys) {
      const nested = stringValue((currentPeriod as Record<string, unknown>)[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function metadataBoolean(metadata: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const direct = booleanValue(metadata[key]);
    if (direct !== null) return direct;
  }
  return null;
}

function hoursState(status: string | null | undefined): HoursState {
  if (status === "verified_hours") return "source_verified";
  if (status === "temporarily_closed") return "temporary_closed";
  if (status === "manual_hold") return "manual_hold";
  return "unknown";
}

function confidenceFor(input: {
  state: VenueLivenessState;
  hoursState: HoursState;
  scheduleConfidence: number;
  liveSignalCount: number;
  liveUniqueUserCount: number;
}): RecommendationConfidence {
  if (input.hoursState === "unknown" || input.hoursState === "manual_hold") return "low";
  if (input.state === "live") return "high";
  if (input.scheduleConfidence >= 0.72) return "high";
  if (input.scheduleConfidence >= 0.45 || input.liveSignalCount > 0 || input.liveUniqueUserCount > 0) return "medium";
  return "low";
}

function sourceLabel(source: string): string {
  if (source === "provider:google_places") return "Google Places";
  if (source === "provider:foursquare") return "Foursquare";
  if (source === "provider:openstreetmap") return "OpenStreetMap";
  if (source === "eventbrite") return "Eventbrite";
  if (source === "venue_website") return "venue website";
  if (source === "manual") return "Nightloop ops";
  if (source === "datasf_poe") return "DataSF evidence";
  return "Unverified source";
}

function copyFor(input: {
  state: VenueLivenessState;
  hoursState: HoursState;
  source: string;
  opensAt: string | null;
  closesAt: string | null;
  sourceOpenNow: boolean;
  liveSignalCount: number;
  liveUniqueUserCount: number;
}): VenueLiveness["copy"] {
  const provenance = input.hoursState === "source_verified"
    ? `Hours source: ${sourceLabel(input.source)}`
    : input.hoursState === "manual_hold"
      ? "Hours are under Nightloop ops review"
      : input.hoursState === "temporary_closed"
        ? `Closure source: ${sourceLabel(input.source)}`
        : "Hours not verified yet";

  if (input.state === "live") {
    return {
      label: "Live now",
      supporting_text:
        `${input.liveSignalCount} verified reports from ${input.liveUniqueUserCount} people in the last 90 minutes.`,
      provenance
    };
  }

  if (input.state === "opens_later") {
    return {
      label: input.opensAt ? "Opens later" : "Tonight preview",
      supporting_text: input.opensAt
        ? `Source-backed hours say it opens at ${input.opensAt}.`
        : "Source-backed hours are available for tonight.",
      provenance
    };
  }

  if (input.sourceOpenNow && input.hoursState === "source_verified") {
    return {
      label: "Open now",
      supporting_text: "Source-backed hours say it is open, but live crowd claims need more verified reports.",
      provenance
    };
  }

  if (input.state === "closed_today") {
    return {
      label: "Closed today",
      supporting_text: "Source-backed hours say it is not available for tonight.",
      provenance
    };
  }

  return {
    label: input.hoursState === "source_verified" ? "Tonight preview" : "Hours not verified",
    supporting_text:
      input.hoursState === "source_verified"
        ? "Source-backed hours exist, but live crowd claims need more verified reports."
        : "Nightloop will not infer open, closed, or live status without verified hours.",
    provenance
  };
}

export function buildVenueLiveness(input: VenueLivenessInput): VenueLiveness {
  const rawMetadata = input.scheduleMetadata ?? {};
  const rawSource = input.scheduleSource ?? "unknown";
  const isInternalOnlyOsm =
    rawSource === "provider:openstreetmap" && rawMetadata.internal_only_until_ui_attribution === true;
  const metadata = isInternalOnlyOsm ? {} : rawMetadata;
  const status = isInternalOnlyOsm ? "unknown" : input.scheduleStatus ?? "unknown";
  const source = isInternalOnlyOsm ? "unknown" : rawSource;
  const stateFromHours = hoursState(status);
  const liveSignalCount = Math.max(0, Math.floor(numberValue(input.liveSignalCount ?? input.recentSignalCount)));
  const liveUniqueUserCount = Math.max(0, Math.floor(numberValue(input.liveUniqueUserCount)));
  const expectedPulseLevel = Math.max(1, Math.min(3, Math.floor(numberValue(input.pulseLevel, 1))));
  const scheduleConfidence = clamp(numberValue(input.scheduleConfidence, 0.25), 0, 1);
  const opensAt = metadataString(metadata, "opens_at", "next_open_at", "tonight_opens_at", "open_time");
  const closesAt = metadataString(metadata, "closes_at", "next_close_at", "tonight_closes_at", "close_time");
  const isOpenNow = metadataBoolean(metadata, "is_open_now", "open_now", "claims_open_now") === true;
  const isClosedToday = metadataBoolean(metadata, "is_closed_today", "closed_today") === true;
  const sourceOpenNow = stateFromHours === "source_verified" && isOpenNow;
  const opensLater = !isOpenNow && (metadataBoolean(metadata, "opens_later") === true || Boolean(opensAt));

  let state: VenueLivenessState = "unknown";
  if (stateFromHours === "temporary_closed" || isClosedToday) {
    state = "closed_today";
  } else if (
    stateFromHours === "source_verified" &&
    isOpenNow &&
    liveSignalCount >= LIVE_SIGNAL_MINIMUM &&
    liveUniqueUserCount >= LIVE_UNIQUE_USER_MINIMUM
  ) {
    state = "live";
  } else if (stateFromHours === "source_verified" && opensLater) {
    state = "opens_later";
  }

  const confidence = confidenceFor({
    state,
    hoursState: stateFromHours,
    scheduleConfidence,
    liveSignalCount,
    liveUniqueUserCount
  });

  return {
    state,
    hours_state: stateFromHours,
    confidence,
    opens_at: opensAt,
    closes_at: closesAt,
    source_open_now: sourceOpenNow,
    expected_pulse_level: expectedPulseLevel,
    live_signal_count: liveSignalCount,
    live_unique_user_count: liveUniqueUserCount,
    copy: copyFor({
      state,
      hoursState: stateFromHours,
      source,
      opensAt,
      closesAt,
      sourceOpenNow,
      liveSignalCount,
      liveUniqueUserCount
    }),
    provenance: {
      source,
      verified_at: input.scheduleVerifiedAt ?? null,
      fetched_at: input.scheduleFetchedAt ?? null
    }
  };
}
