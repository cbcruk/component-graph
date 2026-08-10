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
tasks/*.json      task = { id, fixture, instruction, target, render?, adversarial? }
fixtures/*.tsx    the input files
task.mjs          tasks/*.json schema; resolves `fixture` to a path once
record.mjs        results.jsonl schema: one shape, one outcome vocabulary
score.mjs         deterministic scorer → one record
extract-tool.mjs  arm-B executor: runs the cgraph op from agent-chosen params
candidates/       each agent's produced file (git-ignored working area)
results.jsonl     append-only log of records (schema 1)
```

**Arms** (what the agent is given for the same task):
- **A — freehand**: the source text; the agent must produce the full edited file by hand.
- **B — tool**: the agent only *identifies* the extraction (`{component, line, name}`); the fail-closed `cgraph` op does the mechanical edit and type resolution.

**Checks** (all required to pass): `parses`, `hasEnclosing`, `hasNewComponent`,
`usedOnce`, `hasProps`, `faithfulBody`, `noNewTypeErrors`.

## Run

Build first (`pnpm build`), then spawn agents (via the session's Agent tool),
and write each output to `candidates/`. Then:

```sh
node evals/score.mjs evals/candidates/x.tsx \
  --task-file evals/tasks/extract-count-badge.json \
  --arm A-freehand --trial 1 --model claude-opus-4-8 \
  >> evals/results.jsonl

node evals/extract-tool.mjs evals/fixtures/card.tsx \
  '{"component":"Card","line":12,"name":"CountBadge"}' evals/candidates/out.tsx

node evals/gate.mjs evals/tasks/extract-collision.json evals/candidates/x.tsx \
  >> evals/results.jsonl
```

The task file supplies the id, the target and the original source, and each
producer emits a complete record — neither the target nor the log envelope is
assembled by hand. `fixture` is stored relative to `evals/` and resolved once in
[`task.mjs`](./task.mjs), so these work from any directory.

Validate the tasks and the log at any time:

```sh
pnpm --filter evals check
```

## Findings

Opus 4.8. One outcome vocabulary across every arm (see [`record.mjs`](./record.mjs)):
`pass` (correct + compiles) · `fail:<check>` (emitted an edit that is wrong;
`<check>` is the first failing check) · `refused:<reason>` (a tool or gate
declined — no broken code emitted).

Whether a refusal was *safe* (it blocked a broken edit) or *false* (it blocked
a valid one) is a judgement about the task, not a fact about the run, so it is
derived in the analysis below rather than baked into the log.

| task | A — freehand | B — tool |
|---|---|---|
| `extract-count-badge` (trivial) | pass 3/3 | pass 3/3 |
| `extract-row-opaque` (free vars buried in `{show && items.length}`) | pass 3/3 | pass 3/3 |
| `extract-collision` (`Count` already exists top-level) | **fail:noNewTypeErrors 6/6** | **refused 2/2** (safe) |
| `extract-shadow` (outer `x` prop vs inner `(x) =>` param) | **pass 6/6** | **refused 2/2** (false) |

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
- A design the data suggested — **model edits, tool verifies** — which is now
  built and validated (below).

## Run 3 — the hybrid arm (`C`)

`verifyExtraction` (CLI: `cgraph verify <original> <candidate>`) is a fail-closed
*acceptance gate*: the agent edits freehand (arm A's coverage), then the tool
checks the result independently — compiles no worse than the original + a
structurally sound extraction — and accepts or rejects. Running it on the same
freehand outputs:

| task | A — freehand | B — tool | C — hybrid |
|---|---|---|---|
| trivial extraction | pass | pass | **pass** |
| free vars in `{show && …}` | pass | pass | **pass** |
| name collision | **BROKEN** | refuse | **reject ✓** (caught the broken edit) |
| shadowing | pass | refuse | **pass** (accepted the valid edit) |

**Arm C strictly dominates.** It never ships broken code — the collision edit
that arm A silently emitted is rejected as `refused:duplicate-declaration` — *and* it
keeps the coverage arm B loses, accepting the valid shadowing extraction the
`extractComponent` op conservatively refuses. Model coverage + tool guarantee,
with neither's downside.

Caveat: v1 of the gate is static (compile + structure). It does not yet prove
the *moved subtree* is behaviorally unchanged — a determined edit that
typechecks but swaps a prop value would pass.

## Run 4 — behavioral equivalence (v2)

[`render-equiv.mjs`](./render-equiv.mjs) closes that gap: it transpiles the
original and the candidate, renders the enclosing component with sample props
via `react-dom/server`, and compares the HTML. Behavior-preserving edits render
byte-identical output; a typechecks-but-wrong edit does not.

| edit | v1 static gate | v2 render-equiv |
|---|---|---|
| `CountBadge` (valid) | accept | equivalent ✓ |
| `Row` (valid) | accept | equivalent ✓ |
| `Wrap` / shadowing (valid) | accept | equivalent ✓ |
| `<CountBadge count={count + 1} />` (typechecks, wrong) | **accept ✗** | **not equivalent ✓ (caught)** |

The last row is the point: an edit that passes `tsc` and every structural check —
so v1 accepts it — renders `<span class="count">4</span>` where the original
renders `3`. v2 catches it. **v2 is strictly stronger than v1.**

Honest-partial, as always: v2 proves equivalence only for the prop samples given
and only for self-contained components (no external imports, context, or
effects). It lives in `evals/` (not `cgraph` core) because executing React pulls
in `react`/`react-dom` — a runtime cost the dep-light editor shouldn't carry. It
is a measurement oracle, not an editing primitive.

## Run 5 — arm C is now the composed two-stage gate

[`gate.mjs`](./gate.mjs) makes arm C's "accept" mean *behaviorally identical*:
it runs v1 (static) then v2 (render), and accepts only if both pass. Two stages,
two failure modes caught:

| candidate | stage that fires | outcome |
|---|---|---|
| `CountBadge` / `Row` / `Wrap` (valid) | — | **pass** |
| collision (duplicate decl) | static (v1) | `refused:duplicate-declaration` |
| `count + 1` (typechecks, wrong output) | render (v2) | `refused:behavior-changed` |

So arm C rejects **both** the edit that doesn't compile *and* the edit that
compiles but renders the wrong thing — while accepting every valid extraction,
including the shadowing case the `extractComponent` op refuses. This is the full
"model edits, tool verifies" gate the eval set out to find: a strong model's
coverage behind a guarantee that is now behavioral, not just structural.

### Cost & caveats

- ~19.6k tokens per subagent (dominated by system-prompt overhead), so cost
  scales with agent count: this run was 28 agents ≈ 550k tokens across two runs.
- Reps of an identical prompt measure *modal* behavior + occasional variance,
  not a full temperature sweep; treat 6/6 as "the model reliably does X here,"
  not a precise rate. Not-yet-stressed axes: **token cost on large files** (arm
  A emits the whole file, arm B a constant JSON — structural, un-run here) and
  **N≥30 broken-rate on borderline inputs**.
