function Count() {
  return <strong>existing</strong>;
}

export function Card({ count }: { count: number }) {
  return (
    <section className="card">
      <span className="count">{count}</span>
    </section>
  );
}
