import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extract } from 'component-outline';
import { describe, expect, it } from 'vitest';
import { extractComponent, hashSource } from '../src/extract-component.js';

const cardPath = fileURLToPath(new URL('../fixtures/card.tsx', import.meta.url));
const card = readFileSync(cardPath, 'utf8');

const base = { file: 'card.tsx', code: card, component: 'Card' } as const;

describe('extractComponent — success', () => {
  it('extracts a param-flowing subtree with a resolved type', () => {
    const result = extractComponent({ ...base, targetLine: 12, newName: 'Count' });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(result.props).toEqual([
      { name: 'count', typeText: 'number', origin: 'param' },
    ]);
    expect(result.usage).toBe('<Count count={count} />');
    expect(result.newComponent).toContain('function Count({ count }: {');
    expect(result.newComponent).toContain('count: number;');
    expect(result.newComponent).toContain('<span className="count">{count}</span>');
  });

  it('resolves a local-flowing free variable', () => {
    const result = extractComponent({ ...base, targetLine: 11, newName: 'Label' });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(result.props).toEqual([
      { name: 'label', typeText: 'string', origin: 'local' },
    ]);
    expect(result.usage).toBe('<Label label={label} />');
  });

  it('produces output that re-extracts to both components with the usage wired', () => {
    const result = extractComponent({ ...base, targetLine: 12, newName: 'Count' });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    const outline = extract('out.tsx', result.output);
    const names = outline.components.map((c) => c.name).sort();
    expect(names).toEqual(['Card', 'Count']);

    const card = outline.components.find((c) => c.name === 'Card');
    const root = card?.root;
    const tags =
      root?.kind === 'element'
        ? root.children.map((c) => ('tag' in c ? c.tag : c.kind))
        : [];
    expect(tags).toContain('Count');
  });

  it('chains an accurate output hash for atomic follow-up edits', () => {
    const result = extractComponent({ ...base, targetLine: 12, newName: 'Count' });
    if (!result.ok) throw new Error('unexpected failure');
    expect(result.hash).toBe(hashSource(result.output));
  });

  it('matches the projected edit shape', () => {
    const result = extractComponent({ ...base, targetLine: 12, newName: 'Count' });
    if (!result.ok) throw new Error('unexpected failure');
    expect(result.output).toMatchSnapshot();
  });
});

describe('extractComponent — honest limits', () => {
  const listCode = [
    'interface Props { items: string[]; show: boolean }',
    'export function List({ items, show }: Props) {',
    '  return (',
    '    <ul className="list">',
    '      <li className="row">{show && items.length}</li>',
    '    </ul>',
    '  );',
    '}',
    '',
  ].join('\n');

  it('moves an element containing an opaque expr whole, surfacing its free vars', () => {
    const result = extractComponent({
      file: 'list.tsx',
      code: listCode,
      component: 'List',
      targetLine: 5,
      newName: 'Row',
    });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    // The opaque `{show && items.length}` is carried verbatim, not rewritten.
    expect(result.newComponent).toContain('{show && items.length}');
    // Free vars from inside the opaque expr still become typed props.
    expect(result.props).toEqual([
      { name: 'show', typeText: 'boolean', origin: 'param' },
      { name: 'items', typeText: 'string[]', origin: 'param' },
    ]);
    expect(result.usage).toBe('<Row show={show} items={items} />');
  });
});

describe('extractComponent — honest rejections', () => {
  it('rejects a target inside an opaque expression instead of a vague verify failure', () => {
    const code = [
      'export function Panel({ show, title }: { show: boolean; title: string }) {',
      '  return (',
      '    <div className="panel">',
      '      {show && <span className="t">{title}</span>}',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const result = extractComponent({
      file: 'p.tsx',
      code,
      component: 'Panel',
      targetLine: 4,
      newName: 'Inner',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported-conditional');
  });

  it('rejects a free var shadowed by a nested binding rather than dropping it', () => {
    const code = [
      'export function Panel({ x }: { x: number }) {',
      '  return (',
      '    <section>',
      '      <div className="wrap">',
      '        <span>{x}</span>',
      '        <button onClick={(x) => console.log(x)}>ok</button>',
      '      </div>',
      '    </section>',
      '  );',
      '}',
    ].join('\n');
    const result = extractComponent({
      file: 'p.tsx',
      code,
      component: 'Panel',
      targetLine: 4,
      newName: 'Inner',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported-shadowing');
  });

  it('surfaces an object-shorthand free var ({{ count }}) as a typed prop', () => {
    const code = [
      'export function Panel({ count }: { count: number }) {',
      '  return (',
      '    <div className="wrap">',
      '      <Chart data={{ count }} />',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const result = extractComponent({
      file: 'p.tsx',
      code,
      component: 'Panel',
      targetLine: 4,
      newName: 'Inner',
    });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);
    expect(result.props).toEqual([
      { name: 'count', typeText: 'number', origin: 'param' },
    ]);
    expect(result.usage).toBe('<Inner count={count} />');
  });
});

describe('extractComponent — fail-closed', () => {
  const cases: Array<[string, Parameters<typeof extractComponent>[0], string]> = [
    [
      'stale-hash',
      { ...base, targetLine: 12, newName: 'Count', expectedHash: 'deadbeef' },
      'stale-hash',
    ],
    ['invalid-name', { ...base, targetLine: 12, newName: 'count' }, 'invalid-name'],
    ['name-collision', { ...base, targetLine: 12, newName: 'Card' }, 'name-collision'],
    [
      'component-not-found',
      { ...base, component: 'Nope', targetLine: 12, newName: 'Count' },
      'component-not-found',
    ],
    ['target-not-found', { ...base, targetLine: 99, newName: 'Count' }, 'target-not-found'],
    ['target-is-root', { ...base, targetLine: 10, newName: 'Count' }, 'target-is-root'],
  ];

  for (const [label, req, reason] of cases) {
    it(`rejects ${label} without producing an edit`, () => {
      const result = extractComponent(req);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    });
  }

  it('accepts a matching expectedHash (round-trips the guard)', () => {
    const result = extractComponent({
      ...base,
      targetLine: 12,
      newName: 'Count',
      expectedHash: hashSource(card),
    });
    expect(result.ok).toBe(true);
  });
});
