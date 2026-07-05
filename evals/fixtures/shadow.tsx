export function Panel({ x }: { x: number }) {
  return (
    <section>
      <div className="wrap">
        <span>{x}</span>
        <button onClick={(x) => console.log(x)}>ok</button>
      </div>
    </section>
  );
}
