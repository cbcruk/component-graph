import { extract, type SkelNode } from 'component-outline';
import { introducesTypeErrors } from './type-gate.js';
import type {
  VerifyExtractionFailure,
  VerifyExtractionRequest,
  VerifyExtractionResult,
} from './verify-extraction.types.js';

const fail = (reason: VerifyExtractionFailure): VerifyExtractionResult => ({
  ok: false,
  reason,
});

/**
 * The "model edits, tool verifies" gate. `extractComponent` *produces* a checked
 * edit; this *accepts or rejects* an edit some other agent produced freehand —
 * without trusting it. Fail-closed: the candidate is accepted only if it
 * compiles no worse than the original and is a structurally sound extraction
 * (exactly one new, used, non-empty top-level component; nothing pre-existing
 * lost). This keeps a strong model's coverage while recovering the safety
 * guarantee the model alone doesn't have.
 *
 * The eval shows why: on a name collision, freehand silently emits a duplicate
 * declaration — the `introduces-type-errors` check rejects it. On shadowing,
 * freehand extracts correctly and the checks pass — so this accepts what the
 * `extractComponent` op conservatively refuses.
 *
 * v1 is a static gate (compile + structure). It does not yet prove behavioral
 * equivalence of the moved subtree — a render-based check is the next step.
 */
export function verifyExtraction(
  req: VerifyExtractionRequest,
): VerifyExtractionResult {
  let originalComps: string[];
  let candidate;
  try {
    originalComps = extract(req.file, req.original).components.map((c) => c.name);
    candidate = extract(req.file, req.candidate);
  } catch {
    return fail('parse-failed');
  }

  // Compile safety: catches duplicate identifiers, undefined types, broken JSX —
  // the failure mode freehand editing hits on adversarial inputs.
  if (introducesTypeErrors(req.original, req.candidate)) {
    return fail('introduces-type-errors');
  }

  const originalNames = new Set(originalComps);
  const candidateNames = new Set(candidate.components.map((c) => c.name));

  // Nothing that existed may have vanished.
  for (const name of originalNames) {
    if (!candidateNames.has(name)) return fail('lost-original-component');
  }

  // Exactly one net-new top-level component — the extraction.
  const newNames = [...candidateNames].filter((n) => !originalNames.has(n));
  if (newNames.length === 0) return fail('no-new-component');
  if (newNames.length > 1) return fail('multiple-new-components');
  const newName = newNames[0]!;

  const created = candidate.components.find((c) => c.name === newName);
  if (!created?.root) return fail('new-component-empty');

  // The new component must actually be referenced by another component.
  const used = candidate.components.some(
    (c) => c.name !== newName && c.root && containsTag(c.root, newName),
  );
  if (!used) return fail('new-component-unused');

  return { ok: true, newComponent: newName };
}

function containsTag(node: SkelNode, tag: string): boolean {
  if ((node.kind === 'component' || node.kind === 'element') && node.tag === tag) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'component' || node.kind === 'fragment') {
    return node.children.some((c) => containsTag(c, tag));
  }
  return false;
}
