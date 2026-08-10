import { describe, expect, it } from 'vitest';
import { completeCheckedOp, typeGateVerdict } from '../src/checked-op.js';
import { hashSource } from '../src/apply-edits.js';

const GATE = { dirty: 'gate-dirty', unavailable: 'gate-unavailable' } as const;
const CLEAN = 'const n: number = 1;\n';

describe('completeCheckedOp', () => {
  it('applies the edits and returns the output with its hash', () => {
    const edits = [{ start: 18, end: 19, text: '2' }];
    const outcome = completeCheckedOp(CLEAN, edits, () => null, GATE);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.output).toBe('const n: number = 2;\n');
      expect(outcome.hash).toBe(hashSource(outcome.output));
    }
  });

  it('runs the structural check against the edited output, not the input', () => {
    let seen: string | null = null;
    completeCheckedOp(
      CLEAN,
      [{ start: 18, end: 19, text: '2' }],
      (output) => {
        seen = output;
        return null;
      },
      GATE,
    );
    expect(seen).toBe('const n: number = 2;\n');
  });

  // The ordering contract: structural reasons name what went wrong, the gate is
  // generic, so the gate only speaks when structure is sound.
  it('prefers the structural reason when the edit fails both checks', () => {
    const breaksTypes = [{ start: 18, end: 19, text: "'not a number'" }];
    const outcome = completeCheckedOp(CLEAN, breaksTypes, () => 'structural', GATE);
    expect(outcome).toEqual({ ok: false, reason: 'structural' });
  });

  it('falls through to the gate when structure is sound', () => {
    const breaksTypes = [{ start: 18, end: 19, text: "'not a number'" }];
    const outcome = completeCheckedOp(CLEAN, breaksTypes, () => null, GATE);
    expect(outcome).toEqual({ ok: false, reason: 'gate-dirty' });
  });
});

describe('typeGateVerdict', () => {
  it('returns null for a clean edit', () => {
    expect(typeGateVerdict(CLEAN, `${CLEAN}const m: number = 2;\n`, GATE)).toBeNull();
  });

  it('returns the dirty reason for an edit that adds an error', () => {
    expect(typeGateVerdict(CLEAN, `${CLEAN}const s: string = 1;\n`, GATE)).toBe('gate-dirty');
  });
});
