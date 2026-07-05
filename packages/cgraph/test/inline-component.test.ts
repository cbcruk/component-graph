import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractComponent, hashSource, inlineComponent } from '../src/index.js';

const cardPath = fileURLToPath(new URL('../fixtures/card.tsx', import.meta.url));
const card = readFileSync(cardPath, 'utf8');

describe('inlineComponent — success', () => {
  it('folds a single-usage component back into its call site', () => {
    const extracted = extractComponent({
      file: 'card.tsx',
      code: card,
      component: 'Card',
      targetLine: 12,
      newName: 'Count',
    });
    if (!extracted.ok) throw new Error(`extract failed: ${extracted.reason}`);

    const result = inlineComponent({
      file: 'card.tsx',
      code: extracted.output,
      component: 'Card',
      target: 'Count',
    });
    if (!result.ok) throw new Error(`inline failed: ${result.reason}`);

    expect(result.inlined).toBe('<span className="count">{count}</span>');
    expect(result.substitutions).toEqual({ count: 'count' });
    expect(result.output).not.toContain('function Count');
    expect(result.hash).toBe(hashSource(result.output));
  });

  it('substitutes string-literal and boolean-shorthand props honestly', () => {
    const code = [
      'function Badge({ label, active }: { label: string; active: boolean }) {',
      '  return <span data-active={active}>{label}</span>;',
      '}',
      'export function Card() {',
      '  return (',
      '    <div className="card">',
      '      <Badge label="hi" active />',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n');

    const result = inlineComponent({ file: 'c.tsx', code, component: 'Card', target: 'Badge' });
    if (!result.ok) throw new Error(`inline failed: ${result.reason}`);

    expect(result.substitutions).toEqual({ label: '"hi"', active: 'true' });
    expect(result.inlined).toBe('<span data-active={true}>{"hi"}</span>');
    expect(result.output).not.toContain('function Badge');
  });
});

describe('inline ∘ extract == identity (the round-trip law)', () => {
  const cases: Array<[string, number, string]> = [
    ['a param-flowing subtree', 12, 'Count'],
    ['a local-flowing subtree', 11, 'Label'],
  ];

  for (const [label, line, name] of cases) {
    it(`byte-restores the original after extracting ${label}`, () => {
      const extracted = extractComponent({
        file: 'card.tsx',
        code: card,
        component: 'Card',
        targetLine: line,
        newName: name,
      });
      if (!extracted.ok) throw new Error(`extract failed: ${extracted.reason}`);
      expect(extracted.output).not.toBe(card);

      const inlined = inlineComponent({
        file: 'card.tsx',
        code: extracted.output,
        component: 'Card',
        target: name,
      });
      if (!inlined.ok) throw new Error(`inline failed: ${inlined.reason}`);

      // GetPut: extract then inline is the identity, byte-for-byte.
      expect(inlined.output).toBe(card);
    });
  }
});

describe('inlineComponent — fail-closed', () => {
  const twoUsages = [
    'function Count({ count }: { count: number }) { return <span>{count}</span>; }',
    'export function Card({ count }: { count: number }) {',
    '  return (',
    '    <div>',
    '      <Count count={count} />',
    '      <Count count={count} />',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');

  const exportedTarget = [
    'export function Count({ count }: { count: number }) { return <span>{count}</span>; }',
    'export function Card({ count }: { count: number }) {',
    '  return <div><Count count={count} /></div>;',
    '}',
    '',
  ].join('\n');

  const arrowTarget = [
    'const Count = ({ count }: { count: number }) => <span>{count}</span>;',
    'export function Card({ count }: { count: number }) {',
    '  return <div><Count count={count} /></div>;',
    '}',
    '',
  ].join('\n');

  const otherEnclosing = [
    'function Count({ count }: { count: number }) { return <span>{count}</span>; }',
    'export function Card({ count }: { count: number }) {',
    '  return <div><Count count={count} /></div>;',
    '}',
    'export function Other() { return <p />; }',
    '',
  ].join('\n');

  const cases: Array<[string, Parameters<typeof inlineComponent>[0], string]> = [
    [
      'target-not-found',
      { file: 'c.tsx', code: twoUsages, component: 'Card', target: 'Nope' },
      'target-not-found',
    ],
    [
      'unsupported-target-kind (arrow)',
      { file: 'c.tsx', code: arrowTarget, component: 'Card', target: 'Count' },
      'unsupported-target-kind',
    ],
    [
      'unsupported-exported-target',
      { file: 'c.tsx', code: exportedTarget, component: 'Card', target: 'Count' },
      'unsupported-exported-target',
    ],
    [
      'not-single-usage',
      { file: 'c.tsx', code: twoUsages, component: 'Card', target: 'Count' },
      'not-single-usage',
    ],
    [
      'component-not-found',
      { file: 'c.tsx', code: otherEnclosing, component: 'Nope', target: 'Count' },
      'component-not-found',
    ],
    [
      'usage-not-in-component',
      { file: 'c.tsx', code: otherEnclosing, component: 'Other', target: 'Count' },
      'usage-not-in-component',
    ],
    [
      'stale-hash',
      { file: 'c.tsx', code: twoUsages, component: 'Card', target: 'Count', expectedHash: 'deadbeef' },
      'stale-hash',
    ],
  ];

  for (const [label, req, reason] of cases) {
    it(`rejects ${label} without producing an edit`, () => {
      const result = inlineComponent(req);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    });
  }
});
