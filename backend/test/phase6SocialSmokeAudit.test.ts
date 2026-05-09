import { describe, expect, it } from "vitest";
import {
  PHASE6_SOCIAL_SMOKE_USER_KEYS,
  validatePhase6SocialSmokeSnapshot,
  type Phase6SocialSmokeSnapshot
} from "../src/services/v1/socialSmokeAudit";

function completeSnapshot(overrides: Partial<Phase6SocialSmokeSnapshot> = {}): Phase6SocialSmokeSnapshot {
  return {
    generated_at: "2026-04-28T00:00:00.000Z",
    market: {
      id: "market-1",
      slug: "san-francisco"
    },
    users: PHASE6_SOCIAL_SMOKE_USER_KEYS.map((key) => ({
      key,
      id: `user-${key}`,
      username: `dev_social_${key}`,
      display_name: `Dev Social ${key}`,
      selected_market_id: "market-1",
      ghost_mode: false,
      deleted_at: null,
      preference_count: 6
    })),
    social: {
      accepted_friendships: ["alex:maya", "alex:jules"],
      alex_blocked_friendship_count: 0,
      alex_blocks_blocked: true,
      active_signal_count: 1,
      active_signal_activity_count: 1,
      active_coming_activity_count: 1,
      active_reply_count: 1,
      active_attendance_intent_count: 1,
      raw_coordinate_activity_count: 0
    },
    decision: {
      alex_visible_accepted_friend_count: 2,
      approved_candidate_count: 12,
      active_open_room_count: 1,
      finalized_room_count: 1,
      suggested_candidate_count: 1,
      room_message_count: 2,
      finalized_room_frozen_count: 1
    },
    ...overrides
  };
}

describe("Phase 6 social smoke audit", () => {
  it("accepts a complete repeatable Friends and Decision baseline", () => {
    const result = validatePhase6SocialSmokeSnapshot(completeSnapshot());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("requires accepted friends, a strict block case, and hidden blocked friendship state", () => {
    const result = validatePhase6SocialSmokeSnapshot(
      completeSnapshot({
        social: {
          ...completeSnapshot().social,
          accepted_friendships: ["alex:maya"],
          alex_blocked_friendship_count: 1,
          alex_blocks_blocked: false
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(["MISSING_ACCEPTED_FRIENDSHIP", "MISSING_BLOCK", "BLOCKED_FRIENDSHIP_VISIBLE"])
    );
  });

  it("requires visible activity, replies, attendance, and sanitized activity payloads", () => {
    const result = validatePhase6SocialSmokeSnapshot(
      completeSnapshot({
        social: {
          ...completeSnapshot().social,
          active_signal_activity_count: 0,
          active_coming_activity_count: 0,
          active_reply_count: 0,
          active_attendance_intent_count: 0,
          raw_coordinate_activity_count: 1
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        "MISSING_SIGNAL_ACTIVITY",
        "MISSING_COMING_ACTIVITY",
        "MISSING_REPLY",
        "MISSING_ATTENDANCE_INTENT",
        "RAW_COORDINATES_EXPOSED"
      ])
    );
  });

  it("requires decision-session-ready friends and candidate supply", () => {
    const result = validatePhase6SocialSmokeSnapshot(
      completeSnapshot({
        decision: {
          alex_visible_accepted_friend_count: 1,
          approved_candidate_count: 8,
          active_open_room_count: 0,
          finalized_room_count: 0,
          suggested_candidate_count: 0,
          room_message_count: 0,
          finalized_room_frozen_count: 0
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining([
        "INSUFFICIENT_DECISION_FRIENDS",
        "INSUFFICIENT_DECISION_CANDIDATES",
        "MISSING_OPEN_DECISION_ROOM",
        "MISSING_FINALIZED_DECISION_ROOM",
        "MISSING_SUGGESTED_CANDIDATE",
        "MISSING_ROOM_MESSAGE",
        "FINALIZED_ROOM_NOT_FROZEN"
      ])
    );
  });
});
