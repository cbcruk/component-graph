// The full hybrid gate for arm C: compose the static acceptance gate (v1,
// cgraph verifyExtraction — compiles + structurally sound) with the render-based
// behavioral-equivalence oracle (v2). An edit is accepted only if it passes
// BOTH. This is what makes arm C's "accept" mean *behaviorally identical*, not
// merely "typechecks and looks like an extraction".
//
//   accept                 → sound + behavior-preserving
//   reject:<v1 reason>     → static gate refused (e.g. introduces-type-errors)
//   reject:behavior-changed→ static gate passed, but render differs (the edit
//                            that typechecks yet outputs the wrong thing)
//
// Usage: node evals/gate.mjs <task.json> <candidate.tsx>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExtraction } from '../packages/cgraph/dist/verify-extraction.js';
import { renderEquivalent } from './render-equiv.mjs';

const evalsDir = dirname(fileURLToPath(import.meta.url));

export function gate(task, candidate) {
  const original = readFileSync(join(evalsDir, task.fixture), 'utf8');

  // v1 — static: compiles no worse + structurally sound extraction.
  const v1 = verifyExtraction({ file: task.fixture, original, candidate });
  if (!v1.ok) return { outcome: `reject:${v1.reason}`, stage: 'static' };

  // v2 — behavioral: renders identically over the task's prop samples.
  if (task.render) {
    const { equivalent, results } = renderEquivalent({
      original,
      candidate,
      component: task.render.component,
      samples: task.render.propSamples,
    });
    if (!equivalent) return { outcome: 'reject:behavior-changed', stage: 'render', results };
  }
  return { outcome: 'accept', stage: 'render', newComponent: v1.newComponent };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , taskPath, candidatePath] = process.argv;
  const task = JSON.parse(readFileSync(taskPath, 'utf8'));
  const candidate = readFileSync(candidatePath, 'utf8');
  console.log(JSON.stringify(gate(task, candidate)));
}
