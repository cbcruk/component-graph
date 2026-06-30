import { forwardRef, memo } from 'react';

interface CardProps {
  title: string;
}

export const Box = forwardRef((props, ref) => <div ref={ref} />);

export const Card = memo(function Card({ title }: CardProps) {
  return <article>{title}</article>;
});

const Shiny = memo(forwardRef((props, ref) => <span ref={ref} />));
