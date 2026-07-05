import { describe, expect, it } from 'vitest';
import { extractComponent, verifyExtraction } from '../src/index.js';

const card = [
  'interface CardProps { title: string; count: number }',
  'export function Card({ title, count }: CardProps) {',
  '  return (',
  '    <section className="card">',
  '      <span className="count">{count}</span>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const v = (original: string, candidate: string) =>
  verifyExtraction({ file: 'card.tsx', original, candidate });

describe('verifyExtraction — accepts sound edits', () => {
  it("accepts the tool's own extraction", () => {
    const r = extractComponent({
      file: 'card.tsx',
      code: card,
      component: 'Card',
      targetLine: 5,
      newName: 'CountBadge',
    });
    if (!r.ok) throw new Error(`extract failed: ${r.reason}`);
    const result = v(card, r.output);
    expect(result).toEqual({ ok: true, newComponent: 'CountBadge' });
  });

  it('accepts a valid freehand extraction that reintroduces a nested binding (shadowing)', () => {
    const original = [
      'export function Panel({ x }: { x: number }) {',
      '  return (',
      '    <div className="wrap">',
      '      <span>{x}</span>',
      '      <button onClick={(x) => console.log(x)}>ok</button>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n');
    const candidate = [
      'export function Panel({ x }: { x: number }) {',
      '  return <Wrap x={x} />;',
      '}',
      '',
      'function Wrap({ x }: { x: number }) {',
      '  return (',
      '    <div className="wrap">',
      '      <span>{x}</span>',
      '      <button onClick={(x) => console.log(x)}>ok</button>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n');
    // The extractComponent op refuses this (unsupported-shadowing); the verifier accepts it.
    expect(v(original, candidate)).toEqual({ ok: true, newComponent: 'Wrap' });
  });
});

describe('verifyExtraction — rejects unsafe edits (fail-closed)', () => {
  it('rejects a name collision that duplicates a declaration', () => {
    const original = [
      'function Count() { return <strong>x</strong>; }',
      'export function Card({ count }: { count: number }) {',
      '  return <section><span className="count">{count}</span></section>;',
      '}',
      '',
    ].join('\n');
    const candidate = [
      'function Count() { return <strong>x</strong>; }',
      'export function Card({ count }: { count: number }) {',
      '  return <section><Count count={count} /></section>;',
      '}',
      'function Count({ count }: { count: number }) { return <span className="count">{count}</span>; }',
      '',
    ].join('\n');
    const result = v(original, candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('introduces-type-errors');
  });

  it('rejects an edit that adds no new component', () => {
    expect(v(card, card)).toEqual({ ok: false, reason: 'no-new-component' });
  });

  it('rejects an edit that deletes a pre-existing component', () => {
    const candidate = [
      'function CountBadge({ count }: { count: number }) { return <span>{count}</span>; }',
      '',
    ].join('\n');
    const result = v(card, candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('lost-original-component');
  });

  it('rejects a new component that is never used', () => {
    const candidate = card.replace(
      '}\n',
      '}\nfunction Orphan({ count }: { count: number }) { return <span>{count}</span>; }\n',
    );
    const result = v(card, candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('new-component-unused');
  });
});
