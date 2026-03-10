import RecommendationList, { RecommendationItem } from "../components/RecommendationList";

const placeholderRecommendations: RecommendationItem[] = [
  { id: "rec-1", title: "Review nightly ingestion anomalies", score: 0.83 },
  { id: "rec-2", title: "Promote high-confidence opportunities", score: 0.71 }
];

export default function HomePage() {
  return (
    <main>
      <h1>Nightloop</h1>
      <p>Frontend starter scaffold is running.</p>
      <RecommendationList items={placeholderRecommendations} />
    </main>
  );
}
