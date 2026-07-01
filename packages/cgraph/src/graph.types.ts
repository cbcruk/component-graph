import type { PropValue } from 'component-outline';

export type GNodeId = string;

/**
 * Ephemeral graph lens over one component's JSX subtree. Not persisted —
 * recomputed on demand from the outline (TSX stays the source of truth).
 * Node ids are deterministic preorder (`n0`, `n1`, ...) so projecting and
 * re-extracting yields an identical graph (the round-trip law).
 */
export interface Graph {
  root: GNodeId;
  nodes: Record<GNodeId, GNode>;
}

export type GNode = GElement | GFragment | GText | GExpr;

export interface GElement {
  id: GNodeId;
  kind: 'element' | 'component';
  tag: string;
  props: GProp[];
  children: GNodeId[];
}

export interface GFragment {
  id: GNodeId;
  kind: 'fragment';
  children: GNodeId[];
}

export interface GText {
  id: GNodeId;
  kind: 'text';
  text: string;
}

/** Opaque expression escape hatch — carried verbatim, never descended into. */
export interface GExpr {
  id: GNodeId;
  kind: 'expr';
  text: string;
}

export interface GProp {
  /** Attribute name, or the sentinel `{...}` for a spread. */
  name: string;
  value: PropValue;
}
