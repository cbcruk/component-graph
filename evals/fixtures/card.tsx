interface CardProps {
  title: string;
  count: number;
}

export function Card({ title, count }: CardProps) {
  const label = title.toUpperCase();

  return (
    <section className="card">
      <header>{label}</header>
      <span className="count">{count}</span>
    </section>
  );
}
