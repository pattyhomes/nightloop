import { RecommendationsResponse } from "../types/recommendation";

export type SignalSubmission = {
  venue_id: string;
  signal_type: "crowd_report" | "line_report" | "event_report";
  signal_strength: number;
  source: "user";
};

function getBackendBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_BASE_URL?.trim();

  return (value || "http://localhost:4000").replace(/\/$/, "");
}

export async function fetchRecommendations(): Promise<RecommendationsResponse> {
  const backendBaseUrl = getBackendBaseUrl();
  const response = await fetch(`${backendBaseUrl}/api/recommendations`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load recommendations (${response.status})`);
  }

  return (await response.json()) as RecommendationsResponse;
}

export async function submitSignal(signal: SignalSubmission): Promise<unknown> {
  const backendBaseUrl = getBackendBaseUrl();
  const response = await fetch(`${backendBaseUrl}/api/signals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(signal)
  });

  if (!response.ok) {
    throw new Error(`Failed to submit signal (${response.status})`);
  }

  return (await response.json()) as unknown;
}
