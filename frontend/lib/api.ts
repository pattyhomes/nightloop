import { RecommendationsResponse } from "../types/recommendation";

export type SignalSubmission = {
  venue_id: string;
  signal_type: "crowd_report" | "line_report" | "event_report";
  signal_strength: number;
  source?: "user" | "manual";
};

function getBackendBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_BASE_URL?.trim();

  return (value || "http://localhost:4000").replace(/\/$/, "");
}

export async function fetchRecommendations(): Promise<RecommendationsResponse> {
  const backendBaseUrl = getBackendBaseUrl();
  const url = `${backendBaseUrl}/api/recommendations`;
  const maxAttempts = 3;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      // Retry on 503 (backend not yet ready); throw immediately on other non-ok statuses.
      if (response.status === 503) {
        lastError = new Error(`Backend not ready (503)`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        throw new Error(`Failed to load recommendations (${response.status})`);
      }

      return (await response.json()) as RecommendationsResponse;
    } catch (err) {
      // Retry on network errors (e.g. backend still starting up).
      if (err instanceof TypeError && attempt < maxAttempts) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("Failed to load recommendations");
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
