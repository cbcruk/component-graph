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

## Findings

Opus 4.8. Outcome = `pass` (correct + compiles) · `broken:*` (produced code
that doesn't compile / is structurally wrong) · `safe-refusal` (tool declined,
no broken code emitted).

| task | A — freehand | B — tool |
|---|---|---|
| `extract-count-badge` (trivial) | pass 3/3 | pass 3/3 |
| `extract-row-opaque` (free vars buried in `{show && items.length}`) | pass 3/3 | pass 3/3 |
| `extract-collision` (`Count` already exists top-level) | **broken:type 6/6** | **safe-refusal 2/2** |
| `extract-shadow` (outer `x` prop vs inner `(x) =>` param) | **pass 6/6** | **false-refusal 2/2** |

### What the data says

1. **On easy/medium tasks the tool adds no average-case value.** A strong model
   does small single-file extractions freehand just as reliably — even the
   opaque-conditional case. Average success rate is the wrong metric.
2. **On name-collision the tool wins decisively on *safety*.** Every freehand
   trial silently emitted a duplicate `function Count` — a hard TypeScript
   error, 6/6 broken. The tool refused every time (`name-collision`), 0 broken.
   This is the raison d'être: fail-closed means a 0% broken-output rate by
   construction.
3. **On shadowing the tool *loses* on coverage.** Freehand correctly extracted
   `Wrap` (the inner `(x) =>` is legally scoped, behavior preserved), 6/6 pass.
   The tool refused all — a **false refusal**. Its conservatism has a real cost.

**Synthesis: the tool doesn't raise success rate — it trades coverage for a
safety guarantee.** It never emits broken code, but it also declines valid edits
a strong model gets right. Whether that trade pays off is deployment-specific:
for autonomous/bulk editing where a broken write is expensive, the guarantee
matters; with a strong model behind a human/CI backstop, freehand wins on
coverage.

### What this points to

- The shadowing false-refusal is exactly the `scope-aware type resolution` item
  in [`TODO.md`](../TODO.md) — the eval now *quantifies* why it's worth doing.
- A promising design the data suggests: **model edits, tool verifies.** Let the
  agent produce the edit freehand (high coverage), then run it through the
  tool's checks (`verify` gate / round-trip / `tsc`) to accept-or-reject
  (safety). This keeps coverage *and* the guarantee — better than either arm
  alone.

### Cost & caveats

- ~19.6k tokens per subagent (dominated by system-prompt overhead), so cost
  scales with agent count: this run was 28 agents ≈ 550k tokens across two runs.
- Reps of an identical prompt measure *modal* behavior + occasional variance,
  not a full temperature sweep; treat 6/6 as "the model reliably does X here,"
  not a precise rate. Not-yet-stressed axes: **token cost on large files** (arm
  A emits the whole file, arm B a constant JSON — structural, un-run here) and
  **N≥30 broken-rate on borderline inputs**.
