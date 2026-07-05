// Deterministic scorer for the "act" eval: given a candidate edited file and a
// task target, run objective checks — no LLM judge. Exit prints one JSON line:
//   { pass, failureMode, checks }
//
// Usage: node evals/score.mjs <candidate.tsx> <original.tsx> '<targetJSON>'
import { readFileSync } from 'node:fs';
import { extract } from '../packages/component-outline/dist/index.js';
import { introducesTypeErrors } from '../packages/cgraph/dist/type-gate.js';

const [, , candidatePath, originalPath, targetJson] = process.argv;
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
// A new edit must not add semantic errors the original didn't have.
checks.noNewTypeErrors = !introducesTypeErrors(original, candidate);

const REQUIRED = [
  'parses',
  'hasEnclosing',
  'hasNewComponent',
  'usedOnce',
  'hasProps',
  'faithfulBody',
  'noNewTypeErrors',
];
const failed = REQUIRED.filter((k) => !checks[k]);
console.log(JSON.stringify({ pass: failed.length === 0, failureMode: failed[0] ?? null, checks }));
