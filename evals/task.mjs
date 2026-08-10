// The schema for `tasks/*.json`. Nothing owned it: `gate.mjs` read `fixture`
// and `render`, `score.mjs` received `target` as a hand-built argv JSON string
// and never opened the task file at all, and two fields were read by nobody.
// The README's stated schema — `{ fixture, instruction, target }` — omitted the
// two that drive the newest runs.
//
// The sharp edge was `fixture`: stored relative to `evals/`, resolved against
// `evals/` in one module and against the caller's cwd in another, so the same
// string meant two different paths. It is resolved once, here.

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const evalsDir = dirname(fileURLToPath(import.meta.url));

/**
 * A task record:
 *
 *   id           string, matches the filename stem; recorded on every result
 *   fixture      path to the input TSX, relative to `evals/`
 *   instruction  the agent prompt — carried, not consumed by the harness
 *   target       what a correct edit produces; the scorer's target-aware checks
 *                  { enclosing, line, newName, propNames, bodyTag }
 *   render       optional; drives the behavioural oracle
 *                  { component, propSamples }
 *   adversarial  optional note on what the task is designed to break —
 *                carried for the write-up, not consumed
 */
const REQUIRED = ['id', 'fixture', 'instruction', 'target'];
const TARGET_REQUIRED = ['enclosing', 'newName'];

export function validateTask(task) {
  const problems = [];
  for (const field of REQUIRED) {
    if (task?.[field] === undefined) problems.push(`missing ${field}`);
  }
  if (task?.target) {
    for (const field of TARGET_REQUIRED) {
      if (task.target[field] === undefined) problems.push(`missing target.${field}`);
    }
  }
  if (task?.render && !task.render.component) {
    problems.push('render is present but render.component is missing');
  }
  return problems;
}

/** Load and validate a task, resolving `fixture` to an absolute path. */
export function loadTask(taskPath) {
  const raw = JSON.parse(readFileSync(taskPath, 'utf8'));
  const problems = validateTask(raw);
  if (problems.length) {
    throw new Error(`invalid task ${taskPath}: ${problems.join('; ')}`);
  }
  return {
    ...raw,
    fixturePath: isAbsolute(raw.fixture) ? raw.fixture : join(evalsDir, raw.fixture),
  };
}

/** The task's input source. */
export function readFixture(task) {
  return readFileSync(task.fixturePath, 'utf8');
}

// CLI: validate every task file given, or all of them.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readdirSync } = await import('node:fs');
  const paths = process.argv.slice(2);
  const files = paths.length
    ? paths
    : readdirSync(join(evalsDir, 'tasks'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(evalsDir, 'tasks', f));

  let bad = 0;
  for (const file of files) {
    try {
      const task = loadTask(file);
      readFixture(task);
      console.log(`ok   ${task.id}`);
    } catch (error) {
      console.error(`FAIL ${file}: ${error.message}`);
      bad++;
    }
  }
  console.log(`${files.length} tasks, ${bad} invalid`);
  process.exit(bad ? 1 : 0);
}
