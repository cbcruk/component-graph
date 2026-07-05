export interface VerifyExtractionRequest {
  /** Path (for diagnostics / jsx inference). */
  file: string;
  /** The file before the agent's freehand edit. */
  original: string;
  /** The candidate file the agent produced. */
  candidate: string;
}

export type VerifyExtractionFailure =
  | 'parse-failed'
  | 'introduces-type-errors'
  | 'no-new-component'
  | 'multiple-new-components'
  | 'lost-original-component'
  | 'new-component-empty'
  | 'new-component-unused';

export type VerifyExtractionResult =
  | { ok: true; newComponent: string }
  | { ok: false; reason: VerifyExtractionFailure };
