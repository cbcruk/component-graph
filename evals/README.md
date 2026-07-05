# evals — agent-in-the-loop, deterministically scored

Does giving an LLM agent the `cgraph` tools make it **more reliable** at real
refactors than editing by hand? This harness answers that with data, not
opinion — and accumulates results over time so format/tool changes can be
measured, not guessed.

## Why this is not a research swamp

Most "evaluate an LLM with an LLM" setups drown in judge subjectivity. This one
doesn't, because the project ships **deterministic oracles**: `tsc` (no new type
errors), the tool's structural **verify** gate, and the **round-trip law**. So
"act" tasks are scored objectively — no LLM judge.

## Shape

```
tasks/*.json      task = { fixture, instruction, target } with an objective target
fixtures/*.tsx    the input files
score.mjs         deterministic scorer → { pass, failureMode, checks }
extract-tool.mjs  arm-B executor: runs the cgraph op from agent-chosen params
candidates/       each agent's produced file (git-ignored working area)
results.jsonl     append-only log: { ts, task, arm, trial, model, result }
```

**Arms** (what the agent is given for the same task):
- **A — freehand**: the source text; the agent must produce the full edited file by hand.
- **B — tool**: the agent only *identifies* the extraction (`{component, line, name}`); the fail-closed `cgraph` op does the mechanical edit and type resolution.

**Checks** (all required to pass): `parses`, `hasEnclosing`, `hasNewComponent`,
`usedOnce`, `hasProps`, `faithfulBody`, `noNewTypeErrors`.

## Run

Build first (`pnpm build`), then spawn agents (via the session's Agent tool),
write each output to `candidates/`, and score:

```sh
node evals/score.mjs candidates/x.tsx fixtures/card.tsx '<targetJSON>'
node evals/extract-tool.mjs fixtures/card.tsx '{"component":"Card","line":12,"name":"CountBadge"}' out.tsx
```

## Findings so far

Run 1 (2 tasks × 2 arms × 3 trials, Opus 4.8):

| task | A-freehand | B-tool |
|---|---|---|
| `extract-count-badge` (trivial) | 3/3 | 3/3 |
| `extract-row-opaque` (free vars buried in `{show && items.length}`) | 3/3 | 3/3 |

**The tool's value does not show up as average success rate on small,
single-file extractions — a strong model does them freehand just as reliably.**
This is the eval doing its job: it refuted the easy claim. The tool's
hypothesized advantages live on axes these fixtures don't stress, and that's
where the next tasks must go:

1. **Tail safety, not average.** The tool is fail-closed — a 0% broken-output
   rate by construction. Freehand's broken rate is small but nonzero; it only
   surfaces at large N or on adversarial inputs (name collisions, shadowing,
   complex inferred types the model guesses wrong). Measure broken-rate at
   N≥30, not pass/3.
2. **Token cost at scale.** Arm A must emit the *entire* edited file (output
   tokens grow with file size); arm B emits a constant tiny JSON. Invisible on a
   15-line fixture; decisive on a 500-line one.
3. **Auditability.** The tool's output is hash- and round-trip-verifiable;
   freehand output must be re-checked every time.

Next iteration: bigger fixtures, adversarial fixtures, and N≥30 per cell.
