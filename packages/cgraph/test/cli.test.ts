import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

const cardPath = fileURLToPath(new URL('../fixtures/card.tsx', import.meta.url));
const card = readFileSync(cardPath, 'utf8');

function capture(argv: string[]): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  const code = run(argv, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
  });
  return { code, out, err };
}

describe('cgraph cli — extract', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cgraph-cli-'));
    file = join(dir, 'card.tsx');
    writeFileSync(file, card);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('dry-runs by default: previews a diff and leaves the file untouched', () => {
    const { code, out } = capture([
      'extract',
      file,
      '--component',
      'Card',
      '--line',
      '12',
      '--name',
      'Count',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('dry-run: extract Count');
    expect(out).toContain('props: count: number');
    expect(out).toContain('+ <Count count={count} />');
    expect(out).toContain('Re-run with --write');
    // File unchanged.
    expect(readFileSync(file, 'utf8')).toBe(card);
  });

  it('applies the edit with --write', () => {
    const { code, out } = capture([
      'extract',
      file,
      '--component',
      'Card',
      '--line',
      '12',
      '--name',
      'Count',
      '--write',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('wrote');
    const written = readFileSync(file, 'utf8');
    expect(written).toContain('function Count({ count }: {');
    expect(written).toContain('<Count count={count} />');
  });

  it('emits machine-readable JSON with --json', () => {
    const { code, out } = capture([
      'extract',
      file,
      '--component',
      'Card',
      '--line',
      '12',
      '--name',
      'Count',
      '--json',
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.props).toEqual([
      { name: 'count', typeText: 'number', origin: 'param' },
    ]);
  });

  it('exits non-zero and reports the reason on a refused extraction', () => {
    const { code, err } = capture([
      'extract',
      file,
      '--component',
      'Card',
      '--line',
      '12',
      '--name',
      'count', // invalid: not PascalCase
    ]);
    expect(code).toBe(1);
    expect(err).toContain('extract refused — invalid-name');
    expect(readFileSync(file, 'utf8')).toBe(card);
  });

  it('exits non-zero on missing required flags', () => {
    const { code, err } = capture(['extract', file, '--name', 'Count']);
    expect(code).toBe(1);
    expect(err).toContain('extract <file>');
  });

  it('rejects an unknown subcommand', () => {
    const { code, err } = capture(['frobnicate']);
    expect(code).toBe(1);
    expect(err).toContain("unknown command 'frobnicate'");
  });
});

describe('cgraph cli — inline', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cgraph-cli-'));
    file = join(dir, 'card.tsx');
    writeFileSync(file, card);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('extract --write then inline --write byte-restores the original (round-trip)', () => {
    const ex = capture([
      'extract', file, '--component', 'Card', '--line', '12', '--name', 'Count', '--write',
    ]);
    expect(ex.code).toBe(0);
    expect(readFileSync(file, 'utf8')).not.toBe(card);

    const inl = capture([
      'inline', file, '--component', 'Card', '--target', 'Count', '--write',
    ]);
    expect(inl.code).toBe(0);
    expect(inl.out).toContain('inlined Count');
    expect(readFileSync(file, 'utf8')).toBe(card);
  });

  it('dry-runs by default: previews substitutions and leaves the file untouched', () => {
    // First produce a file with an inlinable component.
    capture(['extract', file, '--component', 'Card', '--line', '12', '--name', 'Count', '--write']);
    const withCount = readFileSync(file, 'utf8');

    const { code, out } = capture(['inline', file, '--component', 'Card', '--target', 'Count']);
    expect(code).toBe(0);
    expect(out).toContain('dry-run: inline Count');
    expect(out).toContain('substitutions: count → count');
    expect(out).toContain('Re-run with --write');
    expect(readFileSync(file, 'utf8')).toBe(withCount);
  });

  it('exits non-zero and reports the reason on a refused inline', () => {
    const { code, err } = capture(['inline', file, '--component', 'Card', '--target', 'Nope']);
    expect(code).toBe(1);
    expect(err).toContain('inline refused — target-not-found');
    expect(readFileSync(file, 'utf8')).toBe(card);
  });
});
