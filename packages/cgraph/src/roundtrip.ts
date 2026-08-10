import { extract, type Component } from 'component-outline';
import { componentToGraph } from './adapter.js';
import { projectGraph } from './project.js';
import type { Graph } from './graph.types.js';

export interface RoundtripResult {
  /**
   * `held` — projected and re-extracted to an identical graph.
   * `broken` — the graphs differ.
   * `no-jsx` — the component has no JSX, so the law was never exercised.
   *
   * There is deliberately no `ok` boolean: `no-jsx` used to report `ok: true`,
   * which let a component with nothing to check inflate a pass count.
   */
  status: 'held' | 'broken' | 'no-jsx';
  /** Graph built from the original component. */
  before: Graph | null;
  /** Graph rebuilt after project -> re-extract. */
  after: Graph | null;
  /** The projected JSX that was fed back through the B layer. */
  jsx: string;
}

/**
 * The JXON round-trip law for the JSX lens: a component's graph, projected to
 * JSX and re-extracted by the B layer, must yield an identical graph. Verifies
 * the projection is faithful (re-parseable to the same structure) — formatting
 * is normalized away, opaque `expr` nodes survive verbatim.
 */
export function roundtrip(component: Component): RoundtripResult {
  const before = componentToGraph(component);
  if (!before) return { status: 'no-jsx', before: null, after: null, jsx: '' };

  const jsx = projectGraph(before);
  const wrapped = wrapComponent(jsx);
  const reExtracted = extract('__roundtrip__.tsx', wrapped).components[0];
  const after = reExtracted ? componentToGraph(reExtracted) : null;

  const held = after !== null && JSON.stringify(before) === JSON.stringify(after);
  return { status: held ? 'held' : 'broken', before, after, jsx };
}

function wrapComponent(jsx: string): string {
  const body = jsx
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `export function __Roundtrip__() {\n  return (\n${body}\n  );\n}\n`;
}
