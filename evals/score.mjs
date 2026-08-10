// Deterministic scorer for the "act" eval: given a candidate edited file and a
// task target, run objective checks — no LLM judge. Prints one `results.jsonl`
// record (see record.mjs). The envelope is emitted here rather than assembled
// by hand at append time, which is what let four record shapes into the log.
//
// Usage:
//   node evals/score.mjs <candidate.tsx> <original.tsx> '<targetJSON>' \
//     --task <id> --arm <arm> [--trial <n>] [--model <id>]
import { readFileSync } from 'node:fs';
import { extract } from '../packages/component-outline/dist/index.js';
import { checkTypeDelta } from '../packages/cgraph/dist/type-gate.js';
import { makeRecord, outcomeFromChecks } from './record.mjs';

const [, , candidatePath, originalPath, targetJson, ...rest] = process.argv;

const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};

const task = flag('task');
const arm = flag('arm');
if (!candidatePath || !originalPath || !targetJson || !task || !arm) {
  console.error(
    "usage: node evals/score.mjs <candidate.tsx> <original.tsx> '<targetJSON>' " +
      '--task <id> --arm <arm> [--trial <n>] [--model <id>]',
  );
  process.exit(2);
}

const target = JSON.parse(targetJson);
const candidate = readFileSync(candidatePath, 'utf8');
const original = readFileSync(originalPath, 'utf8');

const countTag = (node, tag) => {
  if (!node) return 0;
  const self =
    (node.kind === 'component' || node.kind === 'element') && node.tag === tag ? 1 : 0;
  const kids = node.children ?? [];
  return self + kids.reduce((n, c) => n + countTag(c, tag), 0);
};

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
      task,
      arm,
      outcome: outcomeFromChecks(checks),
      trial: trial === undefined ? undefined : Number(trial),
      model: flag('model'),
      checks,
    }),
  ),
);
