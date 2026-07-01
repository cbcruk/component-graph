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

export interface TextEdit {
  /** Character offsets into the original source. */
  start: number;
  end: number;
  text: string;
}

export type ExtractComponentFailure =
  | 'stale-hash'
  | 'invalid-name'
  | 'name-collision'
  | 'component-not-found'
  | 'component-has-no-jsx'
  | 'target-not-found'
  | 'target-is-root'
  | 'cyclic'
  | 'verify-missing-new-component'
  | 'verify-prop-mismatch'
  | 'verify-missing-original'
  | 'verify-usage-missing'
  | 'type-check-failed';

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
