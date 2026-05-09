import { randomUUID } from "crypto";
import type { Response } from "express";

export type DecisionRoomEventType =
  | "room_joined"
  | "vote_changed"
  | "progress_changed"
  | "shortlist_ready"
  | "shortlist_vote_changed"
  | "message_created"
  | "candidate_suggested"
  | "candidate_removed"
  | "final_plan_locked"
  | "room_ended"
  | "room_snapshot_invalidated";

export type DecisionRoomEventActor = {
  id: string;
  display_name: string;
  username: string;
  avatar_kind: string;
};

export type DecisionRoomEvent = {
  id: string;
  session_id: string;
  type: DecisionRoomEventType;
  actor?: DecisionRoomEventActor;
  candidate_id?: string;
  message_id?: string;
  stage?: string;
  created_at: string;
};

export type DecisionRoomEventInput = Omit<DecisionRoomEvent, "id" | "created_at">;
export type DecisionRoomEventListener = (event: DecisionRoomEvent) => void;
export type DecisionRoomEventUnsubscribe = () => void;

function sanitizeEventInput(input: DecisionRoomEventInput): DecisionRoomEventInput {
  if (
    input.type === "vote_changed" ||
    input.type === "shortlist_vote_changed" ||
    input.type === "progress_changed"
  ) {
    return {
      session_id: input.session_id,
      type: input.type,
      ...(input.stage ? { stage: input.stage } : {})
    };
  }
  return input;
}

class DecisionRoomEventBus {
  private listenersBySessionId = new Map<string, Set<DecisionRoomEventListener>>();

  publish(input: DecisionRoomEventInput): DecisionRoomEvent {
    const safeInput = sanitizeEventInput(input);
    const event: DecisionRoomEvent = {
      ...safeInput,
      id: randomUUID(),
      created_at: new Date().toISOString()
    };
    const listeners = this.listenersBySessionId.get(event.session_id);
    if (!listeners) return event;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Isolate stale SSE responses and other listener failures from room mutations.
      }
    }
    return event;
  }

  subscribe(sessionId: string, listener: DecisionRoomEventListener): DecisionRoomEventUnsubscribe {
    let listeners = this.listenersBySessionId.get(sessionId);
    if (!listeners) {
      listeners = new Set<DecisionRoomEventListener>();
      this.listenersBySessionId.set(sessionId, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.listenersBySessionId.delete(sessionId);
      }
    };
  }
}

export const decisionRoomEventBus = new DecisionRoomEventBus();

export function writeSseEvent(res: Response, event: DecisionRoomEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
