import { Recommendation } from "../types/recommendation";

type RecommendationListProps = {
  items: Recommendation[];
};

export default function RecommendationList({ items }: RecommendationListProps) {
  if (items.length === 0) {
    return <p>No recommendations yet.</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <h3>{item.venueName}</h3>
          <p>
            {item.neighborhood} · score: {item.score.toFixed(2)}
          </p>
          <p>{item.explanation}</p>
          <ul>
            {item.topFactors.map((factor) => (
              <li key={`${item.id}-${factor.factor}`}>
                <strong>{factor.label}</strong> ({factor.contribution.toFixed(4)}): {factor.detail}
              </li>
            ))}
          </ul>
          <p>Generated: {new Date(item.generatedAt).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}
