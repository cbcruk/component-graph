export const OUTLINE_VERSION = '0.1' as const;

export type SymbolType = 'function-component' | 'arrow-component';

export interface Outline {
  version: typeof OUTLINE_VERSION;
  file: string;
  imports: ImportRef[];
  components: Component[];
  exportsSurface: string[];
}

/** Recorded only, never followed (cross-file = Tier 1). */
export interface ImportRef {
  source: string;
  names: string[];
  line: number;
}

export interface Component {
  name: string;
  exported: boolean;
  isDefault: boolean;
  symbolType: SymbolType;
  /** HOC chain wrapping the component, outermost first (e.g. ["memo", "forwardRef"]). */
  wrappers: string[];
  params: Param[];
  hooks: HookCall[];
  root: SkelNode | null;
  /** 1-based [start, end] line, inclusive. */
  range: [number, number];
}

/**
 * One function parameter. A React component usually has a single object
 * parameter, so `props` carries the destructured prop bindings while `name`
 * carries a plain identifier param. `typeRef` is the unresolved type
 * annotation text (honest-partial: never resolved at Tier 0).
 */
export interface Param {
  name: string | null;
  props: PropBinding[];
  typeRef: string | null;
}

export interface PropBinding {
  /** Public prop name (the object key). */
  name: string;
  /** Renamed local binding, or null when it matches `name`. */
  local: string | null;
  /** Default value expression text, or null. */
  default: string | null;
  /** True for a `...rest` binding. */
  rest: boolean;
}

export type SkelNode =
  | ElementNode
  | ComponentNode
  | FragmentNode
  | TextNode
  | ExprNode;

export interface ElementNode {
  kind: 'element';
  tag: string;
  props: Record<string, PropValue>;
  children: SkelNode[];
  line: number;
}

export interface ComponentNode {
  kind: 'component';
  tag: string;
  props: Record<string, PropValue>;
  children: SkelNode[];
  line: number;
}

export interface FragmentNode {
  kind: 'fragment';
  children: SkelNode[];
  line: number;
}

export interface TextNode {
  kind: 'text';
  text: string;
  line: number;
}

/** Opaque expression escape hatch (`{cond && <X/>}`, `{items.map(...)}`, ...). */
export interface ExprNode {
  kind: 'expr';
  text: string;
  line: number;
}

/**
 * Prop value invariant: only `literal` or `expr`. A resolved `path`
 * (data-flow) never appears at Tier 0 — the A layer promotes some `expr`
 * to `path` via Tier 1.
 */
export type PropValue =
  | { kind: 'literal'; text: string }
  | { kind: 'expr'; text: string };

export interface HookCall {
  call: string;
  /** Bound identifiers (no dep-array semantics — that is Tier 1). */
  binds: string[];
}
