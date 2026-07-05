interface Props {
  items: string[];
  show: boolean;
}

export function List({ items, show }: Props) {
  return (
    <ul className="list">
      <li className="row">{show && items.length}</li>
    </ul>
  );
}
