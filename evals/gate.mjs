// The full hybrid gate for arm C: compose the static acceptance gate (v1,
// cgraph verifyExtraction — compiles + structurally sound) with the render-based
// behavioral-equivalence oracle (v2). An edit is accepted only if it passes
// BOTH. This is what makes arm C's "accept" mean *behaviorally identical*, not
// merely "typechecks and looks like an extraction".
//
//   pass                    → sound + behavior-preserving
//   refused:<v1 reason>     → static gate refused (e.g. duplicate-declaration)
//   refused:behavior-changed→ static gate passed, but render differs (the edit
//                             that typechecks yet outputs the wrong thing)
//
// `gate()` returns the raw verdict for programmatic callers; the CLI wraps it
// into a `results.jsonl` record (see record.mjs).
//
// Usage: node evals/gate.mjs <task.json> <candidate.tsx> [--arm <arm>]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExtraction } from '../packages/cgraph/dist/verify-extraction.js';
import { renderEquivalent } from './render-equiv.mjs';
import { makeRecord, outcomeFromGate } from './record.mjs';

const evalsDir = dirname(fileURLToPath(import.meta.url));

export function gate(task, candidate) {
  const original = readFileSync(join(evalsDir, task.fixture), 'utf8');

  // v1 — static: compiles no worse + structurally sound extraction.
  const v1 = verifyExtraction({ file: task.fixture, original, candidate });
  if (!v1.ok) {
    return {
      outcome: outcomeFromGate({ staticAccepted: false, reason: v1.reason }),
      stage: 'static',
    };
  }

  // v2 — behavioral: renders identically over the task's prop samples.
  if (task.render) {
    const { equivalent, results } = renderEquivalent({
      original,
      candidate,
      component: task.render.component,
      samples: task.render.propSamples,
    });
    if (!equivalent) {
      return {
        outcome: outcomeFromGate({ staticAccepted: true, behaviorEquivalent: false }),
        stage: 'render',
        results,
      };
    }
  }
  return {
    outcome: outcomeFromGate({ staticAccepted: true, behaviorEquivalent: true }),
    stage: 'render',
    newComponent: v1.newComponent,
  };
}

// CLI — emits a results.jsonl record.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , taskPath, candidatePath, ...rest] = process.argv;
  if (!taskPath || !candidatePath) {
    console.error('usage: node evals/gate.mjs <task.json> <candidate.tsx> [--arm <arm>]');
    process.exit(2);
  }
  const task = JSON.parse(readFileSync(taskPath, 'utf8'));
  const candidate = readFileSync(candidatePath, 'utf8');
  const armIdx = rest.indexOf('--arm');
  const verdict = gate(task, candidate);
  console.log(
    JSON.stringify(
      makeRecord({
        ts: new Date().toISOString(),
        task: task.id,
        arm: armIdx === -1 ? 'C-gate' : rest[armIdx + 1],
        outcome: verdict.outcome,
        stage: verdict.stage,
      }),
    ),
  );
}
