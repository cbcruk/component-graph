import type { TextEdit } from './apply-edits.js';
import type { CommonFailure } from './checked-op.js';

export interface InlineComponentRequest {
  file: string;
  code: string;
  /** The enclosing component that contains the single usage to inline into. */
  component: string;
  /** The top-level component to inline and remove. */
  target: string;
  /** Optional stale-hash guard: reject if it does not match the input hash. */
  expectedHash?: string;
}

/**
 * Shared reasons come from `CommonFailure`; the rest are the ones only this op
 * can raise, so the result type stays precise about what it can return.
 */
export type InlineComponentFailure =
  | CommonFailure
  | 'target-not-found'
  | 'unsupported-target-kind'
  | 'unsupported-exported-target'
  | 'target-has-no-jsx'
  | 'not-single-usage'
  | 'usage-not-in-component'
  | 'unsupported-spread'
  | 'unsupported-children'
  | 'unsupported-partial-props'
  | 'unsupported-shorthand-prop'
  | 'verify-target-still-present'
  | 'verify-usage-still-present';

export type InlineComponentResult =
  | {
      ok: true;
      /** Full edited source. */
      output: string;
      /** The inlined JSX that replaced the usage (props substituted). */
      inlined: string;
      /** Prop name → the argument expression it was substituted with. */
      substitutions: Record<string, string>;
      edits: TextEdit[];
      /** Content hash of `output`, for chaining atomic edits. */
      hash: string;
    }
  | { ok: false; reason: InlineComponentFailure };
