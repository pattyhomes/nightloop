import { RecommendationsResponse } from "../types/recommendation";

function getBackendBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_BASE_URL;

  if (!value) {
    throw new Error("Missing NEXT_PUBLIC_BACKEND_BASE_URL");
  }

  return value.replace(/\/$/, "");
}

export async function fetchRecommendations(): Promise<RecommendationsResponse> {
  const backendBaseUrl = getBackendBaseUrl();
  const response = await fetch(`${backendBaseUrl}/recommendations`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load recommendations (${response.status})`);
  }

  return (await response.json()) as RecommendationsResponse;
}
