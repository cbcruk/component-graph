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
});
