export type Phase6ReadinessSurface = {
  surface: string;
  payload: unknown;
};

export type Phase6ReadinessFailure = {
  surface: string;
  path: string;
  code:
    | "INVALID_LIVE_COPY"
    | "INVALID_OPEN_NOW_CLAIM"
    | "INVALID_CLOSED_COPY"
    | "UNKNOWN_HOURS_CLAIM"
    | "RAW_PROVIDER_PAYLOAD_EXPOSED"
    | "CLOSED_TOP_RECOMMENDATION";
  message: string;
};

export type Phase6ReadinessResult = {
  ok: boolean;
  checked_surfaces: number;
  checked_liveness_objects: number;
  checked_open_now_flags: number;
  failures: Phase6ReadinessFailure[];
};

const rawProviderKeys = new Set([
  "raw_payload",
  "provider_records",
  "provider_payload",
  "raw_provider_payload",
  "raw_provider_records"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).join(" ");
  if (!isRecord(value)) return "";
  return Object.values(value).map(textValue).join(" ");
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasLiveEvidence(liveness: Record<string, unknown>): boolean {
  return (
    liveness.state === "live" &&
    liveness.hours_state === "source_verified" &&
    numberValue(liveness.live_signal_count) >= 3 &&
    numberValue(liveness.live_unique_user_count) >= 2
  );
}

function addFailure(
  failures: Phase6ReadinessFailure[],
  failure: Phase6ReadinessFailure
): void {
  failures.push(failure);
}

function validateLiveness(
  surface: string,
  path: string,
  liveness: Record<string, unknown>,
  failures: Phase6ReadinessFailure[]
): void {
  const copy = textValue(liveness.copy);
  const liveClaim = /\b(live now|open now)\b/i.test(copy);
  const closedClaim = /\bclosed today\b/i.test(copy);

  if (liveClaim && !hasLiveEvidence(liveness)) {
    addFailure(failures, {
      surface,
      path,
      code: "INVALID_LIVE_COPY",
      message: "Live/open-now copy requires source-verified hours plus 3 fresh signals from 2 users."
    });
  }

  if (closedClaim && liveness.state !== "closed_today") {
    addFailure(failures, {
      surface,
      path,
      code: "INVALID_CLOSED_COPY",
      message: "Closed-today copy requires liveness.state = closed_today."
    });
  }

  if (liveness.hours_state === "unknown" && (liveClaim || closedClaim || liveness.state === "live")) {
    addFailure(failures, {
      surface,
      path,
      code: "UNKNOWN_HOURS_CLAIM",
      message: "Unknown hours cannot produce live, open, or closed claims."
    });
  }
}

function walk(
  surface: string,
  value: unknown,
  path: string,
  failures: Phase6ReadinessFailure[],
  counters: { liveness: number; openNow: number }
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(surface, item, `${path}[${index}]`, failures, counters));
    return;
  }

  if (!isRecord(value)) return;

  for (const key of Object.keys(value)) {
    if (rawProviderKeys.has(key)) {
      addFailure(failures, {
        surface,
        path: path === "$" ? key : `${path}.${key}`,
        code: "RAW_PROVIDER_PAYLOAD_EXPOSED",
        message: "Public readiness payload includes raw provider data."
      });
    }
  }

  const liveness = isRecord(value.liveness) ? value.liveness : null;
  if (liveness) {
    counters.liveness += 1;
    validateLiveness(surface, `${path}.liveness`, liveness, failures);
  }

  if (
    surface === "recommendations" &&
    typeof value.rank === "number" &&
    value.rank <= 5 &&
    isRecord(value.venue) &&
    isRecord(value.venue.liveness) &&
    value.venue.liveness.state === "closed_today"
  ) {
    addFailure(failures, {
      surface,
      path,
      code: "CLOSED_TOP_RECOMMENDATION",
      message: "Closed-today venues cannot be promoted as top tonight recommendations."
    });
  }

  if (isRecord(value.hours) && "claims_open_now" in value.hours) {
    counters.openNow += 1;
    if (value.hours.claims_open_now === true && (!liveness || !hasLiveEvidence(liveness))) {
      addFailure(failures, {
        surface,
        path: `${path}.hours.claims_open_now`,
        code: "INVALID_OPEN_NOW_CLAIM",
        message: "claims_open_now requires liveness.state = live with source-verified hours and multi-user signal density."
      });
    }
  }

  if (
    "state" in value &&
    "hours_state" in value &&
    ("live_signal_count" in value || "live_unique_user_count" in value)
  ) {
    counters.liveness += 1;
    validateLiveness(surface, path, value, failures);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "liveness") continue;
    walk(surface, child, path === "$" ? key : `${path}.${key}`, failures, counters);
  }
}

export function validatePhase6ReadinessPayloads(
  surfaces: Phase6ReadinessSurface[]
): Phase6ReadinessResult {
  const failures: Phase6ReadinessFailure[] = [];
  const counters = { liveness: 0, openNow: 0 };

  for (const surface of surfaces) {
    walk(surface.surface, surface.payload, "$", failures, counters);
  }

  return {
    ok: failures.length === 0,
    checked_surfaces: surfaces.length,
    checked_liveness_objects: counters.liveness,
    checked_open_now_flags: counters.openNow,
    failures
  };
}
