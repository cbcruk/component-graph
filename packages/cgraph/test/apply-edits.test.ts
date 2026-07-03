import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyEditsToFile,
  applyTextEdits,
  extractComponent,
  hashSource,
} from '../src/index.js';

const cardPath = fileURLToPath(new URL('../fixtures/card.tsx', import.meta.url));
const card = readFileSync(cardPath, 'utf8');

describe('applyTextEdits', () => {
  it('applies non-overlapping edits regardless of order', () => {
    const code = 'abcdef';
    const out = applyTextEdits(code, [
      { start: 4, end: 6, text: 'Z' }, // ef -> Z
      { start: 0, end: 2, text: 'X' }, // ab -> X
    ]);
    expect(out).toBe('XcdZ');
  });

  it('handles pure insertions (start === end)', () => {
    expect(applyTextEdits('ac', [{ start: 1, end: 1, text: 'b' }])).toBe('abc');
  });
});

describe('applyEditsToFile', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cgraph-apply-'));
    file = join(dir, 'card.tsx');
    writeFileSync(file, card);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies a real extractComponent edit to disk atomically', () => {
    const result = extractComponent({
      file,
      code: card,
      component: 'Card',
      targetLine: 12,
      newName: 'Count',
    });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    const applied = applyEditsToFile({
      file,
      edits: result.edits,
      expectedHash: hashSource(card),
    });
    expect(applied.ok).toBe(true);

    const written = readFileSync(file, 'utf8');
    expect(written).toBe(result.output);
    expect(written).toContain('function Count({ count }: {');
    expect(written).toContain('<Count count={count} />');
    if (applied.ok) expect(applied.hash).toBe(hashSource(result.output));

    // No temp files left behind.
    expect(readdirSync(dir)).toEqual(['card.tsx']);
  });

  it('refuses a stale write and leaves the file untouched (fail-closed)', () => {
    const result = extractComponent({
      file,
      code: card,
      component: 'Card',
      targetLine: 12,
      newName: 'Count',
    });
    if (!result.ok) throw new Error('unexpected failure');

    const applied = applyEditsToFile({
      file,
      edits: result.edits,
      expectedHash: 'deadbeefdeadbeef',
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.reason).toBe('stale-hash');
    expect(readFileSync(file, 'utf8')).toBe(card);
    expect(readdirSync(dir)).toEqual(['card.tsx']);
  });

  it('reports read-failed for a missing file without throwing', () => {
    const applied = applyEditsToFile({
      file: join(dir, 'nope.tsx'),
      edits: [{ start: 0, end: 0, text: 'x' }],
      expectedHash: hashSource(''),
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.reason).toBe('read-failed');
  });
});
