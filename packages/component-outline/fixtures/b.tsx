interface TagProps {
  label: string;
}

export const Tag = ({ label, tone: color }: TagProps) => (
  <em className="tag" data-tone={color}>
    {label}
  </em>
);
