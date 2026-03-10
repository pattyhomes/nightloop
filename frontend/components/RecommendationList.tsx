import type { Recommendation } from "../types/recommendation";

type RecommendationListProps = {
  items: Recommendation[];
};

export default function RecommendationList({ items }: RecommendationListProps) {
  if (items.length === 0) {
    return <p>No recommendations available right now.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => (
        <article
          key={item.id}
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, background: "#fff" }}
        >
          <h3 style={{ margin: "0 0 4px" }}>{item.venueName}</h3>
          <p style={{ margin: "0 0 8px", color: "#666" }}>{item.neighborhood}</p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Nightloop Score:</strong> {item.score.toFixed(4)}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Why:</strong> {item.why}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Contributing factors:</strong> {item.factors.join(", ")}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#777" }}>
            Generated at: {new Date(item.generatedAt).toLocaleString()}
          </p>
        </article>
      ))}
    </div>
  );
}
