import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extract } from 'component-outline';
import { describe, expect, it } from 'vitest';
import { componentToGraph } from '../src/adapter.js';
import { projectGraph } from '../src/project.js';
import { roundtrip } from '../src/roundtrip.js';

const fixturesDir = fileURLToPath(
  new URL('../../component-outline/fixtures/', import.meta.url),
);

const FIXTURES = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx', 'e.tsx'];

function componentsOf(name: string) {
  const code = readFileSync(`${fixturesDir}${name}`, 'utf8');
  return extract(name, code).components;
}

describe('roundtrip law', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture}: project -> re-extract yields an identical graph`, () => {
      for (const component of componentsOf(fixture)) {
        const result = roundtrip(component);
        expect(result.ok, `${fixture} <${component.name}>`).toBe(true);
      }
    });
  }
});

describe('adapter + projection', () => {
  it('carries opaque expr nodes verbatim through the graph', () => {
    const profile = componentsOf('a.tsx').find((c) => c.name === 'Profile');
    const graph = componentToGraph(profile!);
    const exprNodes = Object.values(graph!.nodes).filter((n) => n.kind === 'expr');
    const texts = exprNodes.map((n) => (n.kind === 'expr' ? n.text : '')).sort();
    expect(texts).toEqual([
      'open ? <span>online</span> : null',
      'user.admin && <Badge />',
    ]);

    const rootProps = graph!.nodes[graph!.root];
    const dataOpen =
      rootProps?.kind === 'element'
        ? rootProps.props.find((p) => p.name === 'data-open')
        : undefined;
    expect(dataOpen?.value).toEqual({ kind: 'expr', text: 'open' });
  });

  it('assigns deterministic preorder ids', () => {
    const tag = componentsOf('b.tsx').find((c) => c.name === 'Tag');
    const graph = componentToGraph(tag!);
    expect(graph!.root).toBe('n0');
    expect(graph!.nodes['n0']?.kind).toBe('element');
  });

  it('projects a stable JSX shape', () => {
    const tag = componentsOf('b.tsx').find((c) => c.name === 'Tag');
    const graph = componentToGraph(tag!);
    expect(projectGraph(graph!)).toMatchInlineSnapshot(`
      "<em className="tag" data-tone={color}>
        {label}
      </em>"
    `);
  });
});
