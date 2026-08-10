// Deterministic scorer for the "act" eval: given a candidate edited file and a
// task target, run objective checks — no LLM judge. Prints one `results.jsonl`
// record (see record.mjs). The envelope is emitted here rather than assembled
// by hand at append time, which is what let four record shapes into the log.
//
// The scorer deliberately does NOT call `verifyExtraction`. Arm C *is* arm A's
// output run through that gate, so scoring with it would collapse the two arms
// and make the experiment's central comparison vacuous. It leans only on
// deterministic oracles — the B-layer parser and `tsc` — never on the tool
// under test. The overlap with `verifyExtraction`'s parse and type checks is
// therefore intentional, not duplication to remove.
//
// Usage:
//   node evals/score.mjs <candidate.tsx> --task-file <task.json> --arm <arm> \
//     [--trial <n>] [--model <id>]
import { readFileSync } from 'node:fs';
import { countTag, extract } from 'component-outline';
import { checkTypeDelta } from 'cgraph';
import { makeRecord, outcomeFromChecks } from './record.mjs';
import { loadTask, readFixture } from './task.mjs';

const [, , candidatePath, ...rest] = process.argv;

const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};

const taskFile = flag('task-file');
const arm = flag('arm');
if (!candidatePath || !taskFile || !arm) {
  console.error(
    'usage: node evals/score.mjs <candidate.tsx> --task-file <task.json> ' +
      '--arm <arm> [--trial <n>] [--model <id>]',
  );
  process.exit(2);
}

// Task id, target and the original all come from the task file — none of it is
// assembled by hand at the call site.
const task = loadTask(taskFile);
const target = task.target;
const candidate = readFileSync(candidatePath, 'utf8');
const original = readFixture(task);

const checks = {};
let outline = null;
try {
  outline = extract('candidate.tsx', candidate);
  checks.parses = true;
} catch {
  checks.parses = false;
}

if (checks.parses) {
  const comps = outline.components;
  const enclosing = comps.find((c) => c.name === target.enclosing);
  const created = comps.find((c) => c.name === target.newName);
  checks.hasEnclosing = Boolean(enclosing);
  checks.hasNewComponent = Boolean(created);
  checks.usedOnce =
    enclosing?.root ? countTag(enclosing.root, target.newName) === 1 : false;
  const props = created ? created.params.flatMap((p) => p.props.map((b) => b.name)) : [];
  const wantProps = target.propNames ?? (target.propName ? [target.propName] : []);
  checks.hasProps = wantProps.every((p) => props.includes(p));
  checks.faithfulBody = created?.root ? created.root.tag === target.bodyTag : false;
}

// A new edit must not add semantic errors the original didn't have. `unknown`
// (the checker could not run) is recorded distinctly and does not count as
// clean — a scorer that cannot verify must not award the check.
const typeDelta = checkTypeDelta(original, candidate);
checks.typeDelta = typeDelta;
checks.noNewTypeErrors = typeDelta === 'clean';

const trial = flag('trial');
console.log(
  JSON.stringify(
    makeRecord({
      ts: new Date().toISOString(),
      task: task.id,
      arm,
      outcome: outcomeFromChecks(checks),
      trial: trial === undefined ? undefined : Number(trial),
      model: flag('model'),
      checks,
    }),
  ),
);
