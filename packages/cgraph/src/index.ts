export { componentToGraph, skelToGraph, outlineToGraphs } from './adapter.js';
export { projectNode, projectGraph } from './project.js';
export { roundtrip, type RoundtripResult } from './roundtrip.js';

// Named exports rather than `export *`: each op module also exports its
// structural verifier for this package's own tests, and those are not public.
export {
  extractComponent,
  hashSource,
  type ExtractComponentFailure,
  type ExtractComponentRequest,
  type ExtractComponentResult,
  type ExtractedProp,
  type PropOrigin,
} from './extract-component.js';
export {
  inlineComponent,
  type InlineComponentFailure,
  type InlineComponentRequest,
  type InlineComponentResult,
} from './inline-component.js';
export {
  verifyExtraction,
  type VerifyExtractionFailure,
  type VerifyExtractionRequest,
  type VerifyExtractionResult,
} from './verify-extraction.js';

export { checkTypeDelta, type TypeDelta } from './type-gate.js';
export { type CommonFailure } from './checked-op.js';
export {
  applyEditsToFile,
  applyTextEdits,
  type ApplyEditsRequest,
  type ApplyEditsResult,
  type TextEdit,
} from './apply-edits.js';
export * from './graph.types.js';
