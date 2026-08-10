import { describe, expect, it } from 'vitest';
import { checkTypeDelta } from '../src/type-gate.js';

const CLEAN = `const n: number = 1;\nexport const double = (x: number) => x * 2;\n`;

describe('checkTypeDelta', () => {
  it('reports clean when the edit changes nothing', () => {
    expect(checkTypeDelta(CLEAN, CLEAN)).toBe('clean');
  });

  it('reports clean for an edit that adds no errors', () => {
    const after = `${CLEAN}export const triple = (x: number) => x * 3;\n`;
    expect(checkTypeDelta(CLEAN, after)).toBe('clean');
  });

  it('reports dirty when the edit introduces a semantic error', () => {
    const after = `const n: number = 'not a number';\nexport const double = (x: number) => x * 2;\n`;
    expect(checkTypeDelta(CLEAN, after)).toBe('dirty');
  });

  // The delta is the whole point: files missing React types carry pre-existing
  // errors, and those must not be charged to the edit.
  it('cancels pre-existing errors so only added ones count', () => {
    const before = `const bad: number = 'oops';\n`;
    const after = `const bad: number = 'oops';\nexport const ok = (x: number) => x + 1;\n`;
    expect(checkTypeDelta(before, after)).toBe('clean');
  });

  it('reports clean when the edit removes an error', () => {
    const before = `const bad: number = 'oops';\n`;
    const after = `const good: number = 1;\n`;
    expect(checkTypeDelta(before, after)).toBe('clean');
  });

  // The gate and prop-type resolution share one compiler configuration. These
  // pin the two competing constraints that fix its shape: strict-only errors
  // must be caught, and ambient noImplicitAny noise must not be.
  describe('strict-only errors (missed by a non-strict gate)', () => {
    it('catches a strictNullChecks violation', () => {
      const after = `${CLEAN}const s: string = null;\n`;
      expect(checkTypeDelta(CLEAN, after)).toBe('dirty');
    });

    it('catches access on a possibly-undefined value', () => {
      const after = `${CLEAN}function f(x?: { a: number }) { return x.a; }\n`;
      expect(checkTypeDelta(CLEAN, after)).toBe('dirty');
    });
  });

  // With no React types in scope every intrinsic element raises TS7026. That
  // noise scales with element count, so counting it would make the delta refuse
  // any edit that adds an element — a valid freehand extraction among them.
  describe('ambient JSX noise (must not scale the delta)', () => {
    const JSX_BEFORE = `export function Card({ n }: { n: number }) {\n  return <div><span>{n}</span></div>;\n}\n`;

    it('stays clean when an edit adds an intrinsic element', () => {
      const after = `${JSX_BEFORE}function Orphan({ n }: { n: number }) { return <span>{n}</span>; }\n`;
      expect(checkTypeDelta(JSX_BEFORE, after)).toBe('clean');
    });

    it('still catches a real error in a file full of JSX', () => {
      const after = `${JSX_BEFORE}const bad: number = 'nope';\n`;
      expect(checkTypeDelta(JSX_BEFORE, after)).toBe('dirty');
    });
  });

  // Regression: this branch previously returned `false` — i.e. "no new type
  // errors" — so an uncheckable edit was reported as clean and the gate opened.
  describe('when the checker cannot run', () => {
    const unavailable = () => null;

    it('reports unknown rather than clean', () => {
      expect(checkTypeDelta(CLEAN, CLEAN, unavailable)).toBe('unknown');
    });

    it('reports unknown when only the "after" side fails', () => {
      const onlyAfterFails = (code: string) => (code === CLEAN ? 0 : null);
      const after = `${CLEAN}export const triple = (x: number) => x * 3;\n`;
      expect(checkTypeDelta(CLEAN, after, onlyAfterFails)).toBe('unknown');
    });

    it('reports unknown when only the "before" side fails', () => {
      const onlyBeforeFails = (code: string) => (code === CLEAN ? null : 0);
      const after = `${CLEAN}export const triple = (x: number) => x * 3;\n`;
      expect(checkTypeDelta(CLEAN, after, onlyBeforeFails)).toBe('unknown');
    });

    it('never reports clean, whatever the counts would have been', () => {
      expect(checkTypeDelta(CLEAN, CLEAN, unavailable)).not.toBe('clean');
    });
  });
});
