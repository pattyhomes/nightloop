export type RecommendationItem = {
  id: string;
  title: string;
  score: number;
};

type RecommendationListProps = {
  items: RecommendationItem[];
};

export default function RecommendationList({ items }: RecommendationListProps) {
  if (items.length === 0) {
    return <p>No recommendations yet.</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong> — score: {item.score.toFixed(2)}
        </li>
      ))}
    </ul>
  );
}
