import { describe, expect, it } from 'vitest';
import { extract } from 'component-outline';
import { componentToGraph } from '../src/adapter.js';
import { projectGraph, projectNode } from '../src/project.js';
import { roundtrip } from '../src/roundtrip.js';
import type { Graph } from '../src/graph.types.js';

/** Project the first component of a source snippet. */
function project(code: string): string {
  const component = extract('t.tsx', code).components[0]!;
  return projectGraph(componentToGraph(component)!);
}

/** Round-trip the first component of a source snippet. */
function law(code: string) {
  return roundtrip(extract('t.tsx', code).components[0]!).status;
}

describe('projectNode', () => {
  it('projects a self-closing element with no children', () => {
    expect(project('export function T() {\n  return <br />;\n}\n')).toBe('<br />');
  });

  it('projects nested children with two-space indentation', () => {
    const out = project(
      'export function T() {\n  return <div><span>hi</span></div>;\n}\n',
    );
    expect(out).toBe('<div>\n  <span>\n    hi\n  </span>\n</div>');
  });

  it('carries an opaque expr verbatim', () => {
    const out = project(
      'export function T({ a }: { a: boolean }) {\n  return <div>{a && <b />}</div>;\n}\n',
    );
    expect(out).toContain('{a && <b />}');
  });

  it('throws on an unknown node id rather than emitting silence', () => {
    const graph: Graph = { root: 'nope', nodes: {} };
    expect(() => projectNode(graph, 'nope')).toThrow(/unknown node/);
  });
});

// Regression: literals were double-quoted unconditionally, so a value
// containing `"` emitted `title="he said "hi""` — broken JSX, silently.
describe('projectProp — literal quoting', () => {
  it('uses double quotes for an ordinary literal', () => {
    expect(project('export function T() {\n  return <b className="tag" />;\n}\n')).toBe(
      '<b className="tag" />',
    );
  });

  it('keeps double quotes for a value containing an apostrophe', () => {
    expect(project(`export function T() {\n  return <b title="it's" />;\n}\n`)).toBe(
      `<b title="it's" />`,
    );
  });

  it('switches to single quotes for a value containing a double quote', () => {
    const out = project(`export function T() {\n  return <b title='he said "hi"' />;\n}\n`);
    expect(out).toBe(`<b title='he said "hi"' />`);
  });

  it('keeps the law for a value containing a double quote', () => {
    expect(law(`export function T() {\n  return <b title='he said "hi"' />;\n}\n`)).toBe(
      'held',
    );
  });

  it('projects an expr prop into braces', () => {
    expect(project('export function T({ c }: { c: string }) {\n  return <b x={c} />;\n}\n')).toBe(
      '<b x={c} />',
    );
  });
});

describe('roundtrip status', () => {
  it('reports no-jsx — not a pass — for a component with no JSX', () => {
    const component = extract('t.tsx', 'export function T() {\n  return null;\n}\n')
      .components[0];
    // A JSX-less component may not be catalogued at all; when it is, the law
    // must report that it was never exercised.
    if (component) expect(roundtrip(component).status).toBe('no-jsx');
  });

  it('reports held for a component whose projection re-extracts identically', () => {
    expect(law('export function T() {\n  return <div><span>hi</span></div>;\n}\n')).toBe(
      'held',
    );
  });
});
