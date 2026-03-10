import type { RecommendationsResponse } from "../types/recommendation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function fetchRecommendations(): Promise<RecommendationsResponse> {
  const res = await fetch(`${API_BASE_URL}/recommendations`, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch recommendations: ${res.status}`);
  }

  const data = (await res.json()) as RecommendationsResponse;

  if (!data || !Array.isArray(data.recommendations)) {
    throw new Error("Invalid recommendations response shape");
  }

  return data;
}
