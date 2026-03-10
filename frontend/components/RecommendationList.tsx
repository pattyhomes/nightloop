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
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            background: "#fff"
          }}
        >
          <h3 style={{ margin: "0 0 6px" }}>{item.venueName}</h3>
          <p style={{ margin: "0 0 6px", color: "#555" }}>{item.neighborhood}</p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Score:</strong> {item.score.toFixed(4)}
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Top factors:</strong> {item.topFactors.map((f) => f.label).join(", ")}
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Explanation:</strong> {item.explanation}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#777" }}>
            Generated at: {new Date(item.generatedAt).toLocaleString()}
          </p>
        </article>
      ))}
    </div>
  );
}
