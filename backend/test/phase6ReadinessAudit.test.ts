import { describe, expect, it } from "vitest";
import { validatePhase6ReadinessPayloads } from "../src/services/v1/phase6ReadinessAudit";

function venue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    name: "Trusted Room",
    liveness: {
      state: "opens_later",
      hours_state: "source_verified",
      live_signal_count: 0,
      live_unique_user_count: 0,
      copy: {
        label: "Opens later",
        supporting_text: "Source-backed hours say it opens at 10:00 PM.",
        provenance: "Hours source: Google Places"
      }
    },
    hours: {
      claims_open_now: false
    },
    ...overrides
  };
}

describe("Phase 6 readiness payload audit", () => {
  it("allows true live claims only with source-verified hours and multi-user signal density", () => {
    const liveVenue = venue({
      liveness: {
        state: "live",
        hours_state: "source_verified",
        live_signal_count: 3,
        live_unique_user_count: 2,
        copy: {
          label: "Live now",
          supporting_text: "3 verified reports from 2 people in the last 90 minutes.",
          provenance: "Hours source: Google Places"
        }
      },
      hours: {
        claims_open_now: true
      }
    });

    const result = validatePhase6ReadinessPayloads([
      { surface: "venues", payload: { items: [liveVenue] } }
    ]);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects live or open-now copy without the live evidence contract", () => {
    const result = validatePhase6ReadinessPayloads([
      {
        surface: "recommendations",
        payload: {
          items: [
            {
              venue: venue({
                liveness: {
                  state: "unknown",
                  hours_state: "source_verified",
                  live_signal_count: 2,
                  live_unique_user_count: 1,
                  copy: {
                    label: "Live now",
                    supporting_text: "Open now with a good crowd.",
                    provenance: "Hours source: Google Places"
                  }
                },
                hours: {
                  claims_open_now: true
                }
              })
            }
          ]
        }
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(["INVALID_LIVE_COPY", "INVALID_OPEN_NOW_CLAIM"])
    );
  });

  it("rejects closed copy unless the liveness state is closed_today", () => {
    const result = validatePhase6ReadinessPayloads([
      {
        surface: "venues",
        payload: {
          items: [
            venue({
              liveness: {
                state: "opens_later",
                hours_state: "source_verified",
                live_signal_count: 0,
                live_unique_user_count: 0,
                copy: {
                  label: "Closed today",
                  supporting_text: "Source-backed hours say it is not available for tonight.",
                  provenance: "Hours source: Google Places"
                }
              }
            })
          ]
        }
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain("INVALID_CLOSED_COPY");
  });

  it("rejects unknown-hours payloads that claim live, open, or closed", () => {
    const result = validatePhase6ReadinessPayloads([
      {
        surface: "venues",
        payload: {
          items: [
            venue({
              liveness: {
                state: "unknown",
                hours_state: "unknown",
                live_signal_count: 9,
                live_unique_user_count: 4,
                copy: {
                  label: "Open now",
                  supporting_text: "Closed today after midnight.",
                  provenance: "Hours not verified yet"
                }
              }
            })
          ]
        }
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_HOURS_CLAIM", "INVALID_LIVE_COPY", "INVALID_CLOSED_COPY"])
    );
  });

  it("rejects raw provider payload keys in public output", () => {
    const result = validatePhase6ReadinessPayloads([
      {
        surface: "recommendations",
        payload: {
          items: [
            {
              venue: venue(),
              provider_records: [{ raw_payload: { secret: "nope" } }]
            }
          ]
        }
      }
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain("RAW_PROVIDER_PAYLOAD_EXPOSED");
  });
});
