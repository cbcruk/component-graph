import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extract } from '../src/extract.js';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

function outlineOf(name: string) {
  const code = readFileSync(join(fixturesDir, name), 'utf8');
  return extract(name, code);
}

describe('extract', () => {
  it('a.tsx: function component + hooks + ternary/&&/text', () => {
    expect(outlineOf('a.tsx')).toMatchSnapshot();
  });

  it('b.tsx: arrow expression-body component', () => {
    expect(outlineOf('b.tsx')).toMatchSnapshot();
  });

  it('c.tsx: export default function with fragment', () => {
    expect(outlineOf('c.tsx')).toMatchSnapshot();
  });

  it('d.tsx: memo / forwardRef / nested HOC, multiple components', () => {
    expect(outlineOf('d.tsx')).toMatchSnapshot();
  });

  it('e.tsx: anonymous default arrow component', () => {
    expect(outlineOf('e.tsx')).toMatchSnapshot();
  });

  it('keeps prop values opaque (literal | expr only)', () => {
    const profile = outlineOf('a.tsx').components.find((c) => c.name === 'Profile');
    const root = profile?.root;
    if (root?.kind !== 'element') throw new Error('expected element root');
    expect(root.props.className).toEqual({ kind: 'literal', text: 'card' });
    expect(root.props['data-open']).toEqual({ kind: 'expr', text: 'open' });
  });

  it('records hook calls and binds without dep edges', () => {
    const profile = outlineOf('a.tsx').components.find((c) => c.name === 'Profile');
    expect(profile?.hooks).toEqual([
      { call: 'useState', binds: ['open', 'setOpen'] },
      { call: 'useId', binds: ['id'] },
    ]);
  });

  it('captures destructured prop variants (default, rename, rest)', () => {
    const tag = outlineOf('b.tsx').components.find((c) => c.name === 'Tag');
    expect(tag?.params[0]?.props).toEqual([
      { name: 'label', local: null, default: null, rest: false },
      { name: 'tone', local: 'color', default: null, rest: false },
    ]);

    const profile = outlineOf('a.tsx').components.find((c) => c.name === 'Profile');
    expect(profile?.params[0]?.props).toEqual([
      { name: 'user', local: null, default: null, rest: false },
      { name: 'size', local: null, default: '2', rest: false },
      { name: 'rest', local: null, default: null, rest: true },
    ]);
  });

  it('marks export-default components', () => {
    const app = outlineOf('c.tsx').components.find((c) => c.name === 'App');
    expect(app?.isDefault).toBe(true);
    expect(app?.exported).toBe(true);
  });

  it('records HOC wrapper chains outermost-first', () => {
    const outline = outlineOf('d.tsx');
    const byName = (n: string) => outline.components.find((c) => c.name === n);

    expect(byName('Box')?.wrappers).toEqual(['forwardRef']);
    expect(byName('Box')?.symbolType).toBe('arrow-component');

    expect(byName('Card')?.wrappers).toEqual(['memo']);
    expect(byName('Card')?.symbolType).toBe('function-component');

    expect(byName('Shiny')?.wrappers).toEqual(['memo', 'forwardRef']);
    expect(outline.components.map((c) => c.name)).toEqual(['Box', 'Card', 'Shiny']);
  });

  it('names anonymous default components "default"', () => {
    const [component] = outlineOf('e.tsx').components;
    expect(component?.name).toBe('default');
    expect(component?.isDefault).toBe(true);
    expect(component?.symbolType).toBe('arrow-component');
    expect(component?.wrappers).toEqual([]);
  });

  it('handles anonymous default function expression', () => {
    const outline = extract('inline.tsx', 'export default function () { return <aside /> }');
    expect(outline.components).toHaveLength(1);
    expect(outline.components[0]?.name).toBe('default');
    expect(outline.components[0]?.symbolType).toBe('function-component');
  });

  it('does not misclassify non-HOC calls as components', () => {
    const outline = extract('inline.tsx', 'const x = styled(Foo);\nconst y = compute();');
    expect(outline.components).toHaveLength(0);
  });
});
