import type { CommonFailure } from './checked-op.js';
import type { TextEdit } from './apply-edits.js';

export interface ExtractComponentRequest {
  file: string;
  code: string;
  /** Name of the enclosing component whose JSX contains the target. */
  component: string;
  /** 1-based line where the JSX subtree to extract begins. */
  targetLine: number;
  /** PascalCase name for the new component. */
  newName: string;
  /** Optional stale-hash guard: reject if it does not match the input hash. */
  expectedHash?: string;
}

/** Data-flow origin of a prop, resolved locally (Tier 1). */
export type PropOrigin = 'param' | 'hook' | 'local';

export interface ExtractedProp {
  name: string;
  /** Resolved type text (ts-morph), or "unknown" when it can't be resolved. */
  typeText: string;
  origin: PropOrigin;
}

export type { TextEdit } from './apply-edits.js';

/**
 * Shared reasons come from `CommonFailure`; the rest are the ones only this op
 * can raise, so the result type stays precise about what it can return.
 */
export type ExtractComponentFailure =
  | CommonFailure
  | 'invalid-name'
  | 'name-collision'
  | 'component-has-no-jsx'
  | 'target-not-found'
  | 'target-is-root'
  | 'cyclic'
  | 'unsupported-conditional'
  | 'verify-missing-new-component'
  | 'verify-prop-mismatch'
  | 'verify-missing-original'
  | 'verify-usage-missing';

export type ExtractComponentResult =
  | {
      ok: true;
      /** Full edited source. */
      output: string;
      /** The generated new component source. */
      newComponent: string;
      /** The replacement usage placed where the target was. */
      usage: string;
      props: ExtractedProp[];
      edits: TextEdit[];
      /** Content hash of `output`, for chaining atomic edits. */
      hash: string;
    }
  | { ok: false; reason: ExtractComponentFailure };
