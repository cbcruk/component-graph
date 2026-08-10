// The schema for `results.jsonl`. Nothing owned this before: `score.mjs`
// printed a bare `{pass, failureMode, checks}`, `gate.mjs` printed a bare
// `{outcome, stage}`, and the `ts`/`task`/`arm`/`trial` envelope was assembled
// by hand at append time. That produced four record shapes and three outcome
// vocabularies in one log, with nothing to notice the drift.
//
// One shape, one vocabulary, one validator. Run `--check` to enforce it.

export const SCHEMA = 1;

/** Every check the scorer requires for a `pass`, in precedence order. */
export const REQUIRED_CHECKS = [
  'parses',
  'hasEnclosing',
  'hasNewComponent',
  'usedOnce',
  'hasProps',
  'faithfulBody',
  'noNewTypeErrors',
];

// ── Vocabulary ──────────────────────────────────────────────────────────────
//
//   pass              an edit was emitted and satisfies every check
//   fail:<check>      an edit was emitted and is wrong; <check> is the first
//                     failing check name
//   refused:<reason>  a tool or gate declined — no edit was emitted, or the
//                     candidate was not accepted
//
// Whether a refusal was *correct* is a judgement about the task, not a fact
// about the run, so it is derived during analysis rather than recorded here.
// That is why the legacy `safe-refusal:` / `safe-reject:` prefixes collapse to
// a plain `refused:` — the "safe" verdict is recoverable from the task, and
// baking it into the log conflated a measurement with its interpretation.

export function isValidOutcome(outcome) {
  if (typeof outcome !== 'string') return false;
  if (outcome === 'pass') return true;
  const [kind, ...rest] = outcome.split(':');
  if (!rest.length || !rest.join(':')) return false;
  return kind === 'fail' || kind === 'refused';
}

/** `pass`, or `fail:<first failing check>`. */
export function outcomeFromChecks(checks) {
  if (!checks?.parses) return 'fail:parses';
  // A compile regression outranks a target mismatch: it says the edit is
  // broken, not merely wrong.
  if (checks.noNewTypeErrors === false) return 'fail:noNewTypeErrors';
  const failed = REQUIRED_CHECKS.find((k) => !checks[k]);
  return failed ? `fail:${failed}` : 'pass';
}

/** The arm-C gate verdict, in the shared vocabulary. */
export function outcomeFromGate({ staticAccepted, behaviorEquivalent, reason }) {
  if (!staticAccepted) return `refused:${reason ?? 'static-gate'}`;
  if (behaviorEquivalent === false) return 'refused:behavior-changed';
  return 'pass';
}

// ── Legacy mapping ──────────────────────────────────────────────────────────
//
// Applied once when migrating the pre-schema log. Every migrated record keeps
// its original verdict under `legacy.outcome`, so each mapping stays auditable
// from the file itself — no run's recorded result is overwritten, only
// restated. Prefix rules cover the parameterised forms.

export const LEGACY_OUTCOME_MAP = {
  pass: 'pass',
  accept: 'pass',
  'broken:parse': 'fail:parses',
  'broken:type': 'fail:noNewTypeErrors',
};

const LEGACY_PREFIXES = [
  ['safe-refusal:', 'refused:'],
  ['safe-reject:', 'refused:'],
  ['false-refusal:', 'refused:'],
  ['reject:', 'refused:'],
  ['partial:', 'fail:'],
  ['broken:', 'fail:'],
];

export function normalizeLegacyOutcome(outcome) {
  if (outcome in LEGACY_OUTCOME_MAP) return LEGACY_OUTCOME_MAP[outcome];
  for (const [from, to] of LEGACY_PREFIXES) {
    if (outcome.startsWith(from)) return to + outcome.slice(from.length);
  }
  return null;
}

// ── Records ─────────────────────────────────────────────────────────────────

/**
 * Build a log record. `ts`, `task`, `arm` and `outcome` are required — the
 * fields the hand-assembled envelope kept losing.
 */
export function makeRecord({ ts, task, arm, outcome, trial, model, stage, checks, legacy }) {
  const rec = { schema: SCHEMA, ts, task, arm, outcome };
  if (trial !== undefined) rec.trial = trial;
  if (model !== undefined) rec.model = model;
  if (stage !== undefined) rec.stage = stage;
  if (checks !== undefined) rec.checks = checks;
  if (legacy !== undefined) rec.legacy = legacy;
  const problems = validateRecord(rec);
  if (problems.length) throw new Error(`invalid record: ${problems.join('; ')}`);
  return rec;
}

/** Returns a list of problems; empty means valid. */
export function validateRecord(rec) {
  const problems = [];
  if (rec?.schema !== SCHEMA) problems.push(`schema must be ${SCHEMA}, got ${rec?.schema}`);
  for (const f of ['ts', 'task', 'arm']) {
    if (typeof rec?.[f] !== 'string' || !rec[f]) problems.push(`${f} must be a non-empty string`);
  }
  if (!isValidOutcome(rec?.outcome)) problems.push(`outcome "${rec?.outcome}" is not in the vocabulary`);
  if (rec?.checks !== undefined) {
    const missing = REQUIRED_CHECKS.filter((k) => !(k in rec.checks));
    // A parse failure short-circuits the target-aware checks, so only a record
    // claiming to have parsed must carry the full set.
    if (rec.checks.parses && missing.length) problems.push(`checks missing: ${missing.join(', ')}`);
  }
  return problems;
}

// ── CLI: validate a log ─────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , flag, path] = process.argv;
  if (flag !== '--check' || !path) {
    console.error('usage: node evals/record.mjs --check <results.jsonl>');
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
  let bad = 0;
  lines.forEach((line, i) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      console.error(`line ${i + 1}: not valid JSON`);
      bad++;
      return;
    }
    const problems = validateRecord(rec);
    if (problems.length) {
      console.error(`line ${i + 1}: ${problems.join('; ')}`);
      bad++;
    }
  });
  const shapes = new Set(lines.map((l) => Object.keys(JSON.parse(l)).sort().join(',')));
  const outcomes = new Set(lines.map((l) => JSON.parse(l).outcome));
  console.log(`${lines.length} records, ${bad} invalid`);
  console.log(`distinct field sets: ${shapes.size}`);
  console.log(`outcomes: ${[...outcomes].sort().join(' · ')}`);
  process.exit(bad ? 1 : 0);
}
