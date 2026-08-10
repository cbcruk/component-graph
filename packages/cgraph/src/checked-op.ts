import { applyTextEdits, hashSource, type TextEdit } from './apply-edits.js';
import { checkTypeDelta } from './type-gate.js';

/**
 * Refusal reasons every checked edit op can produce. Declared once so the two
 * ops cannot drift on the spelling of a shared concept; each op unions this with
 * the reasons only it can raise, which keeps its result type precise.
 */
export type CommonFailure =
  | 'stale-hash'
  | 'component-not-found'
  | 'unsupported-shadowing'
  | 'type-check-failed'
  | 'type-check-unavailable';

/** The reasons an op raises for the two failing type-gate verdicts. */
export interface TypeGateReasons<F extends string> {
  dirty: F;
  unavailable: F;
}

/** The type gate as a refusal reason, or null when the edit is clean. */
export function typeGateVerdict<F extends string>(
  before: string,
  after: string,
  reasons: TypeGateReasons<F>,
): F | null {
  const delta = checkTypeDelta(before, after);
  if (delta === 'dirty') return reasons.dirty;
  if (delta === 'unknown') return reasons.unavailable;
  return null;
}

export type CheckedOutcome<F extends string> =
  | { ok: true; output: string; hash: string }
  | { ok: false; reason: F };

/**
 * The tail every checked edit op shares: apply the planned edits, run the op's
 * own structural checks against the result, then the type gate.
 *
 * The order is the contract. Structural checks run first because they name what
 * actually went wrong; the gate is both the most expensive check and the least
 * specific, so it only speaks when structure is sound. Owning that here is what
 * stops the three ops from drifting — the last two changes to this ordering had
 * to be made in three places at once.
 */
export function completeCheckedOp<F extends string>(
  before: string,
  edits: TextEdit[],
  structural: (output: string) => F | null,
  gate: TypeGateReasons<F>,
): CheckedOutcome<F> {
  const output = applyTextEdits(before, edits);

  const structuralFailure = structural(output);
  if (structuralFailure) return { ok: false, reason: structuralFailure };

  const gateFailure = typeGateVerdict(before, output, gate);
  if (gateFailure) return { ok: false, reason: gateFailure };

  return { ok: true, output, hash: hashSource(output) };
}
