import { RecommendationsResponse } from "../types/recommendation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export async function fetchRecommendations(): Promise<RecommendationsResponse> {
  const response = await fetch(`${API_BASE_URL}/recommendations`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load recommendations (${response.status})`);
  }

  return (await response.json()) as RecommendationsResponse;
}
