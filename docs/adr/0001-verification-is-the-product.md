---
status: accepted
---

# The Gate is the product; the ops are its reference implementation

`PROJECT_BRIEF.md` hypothesised that agents need a structural *editor*, and made
`extractComponent` the marquee op. The eval harness tested that hypothesis and
found the opposite: on easy and medium tasks the op adds no average-case value
(a strong model extracts freehand just as reliably, including the
opaque-conditional case), on shadowing it *loses* coverage by refusing an edit
the model gets right, and its only win — name collision — comes from declining
to act. The hybrid arm, where the model edits freehand and the tool judges the
result, beats both. We therefore treat the Gate as what this project is for, and
the ops as the deterministic reference implementation that keeps the Gate
honest.

## Considered Options

- **Keep building ops** (`bindProp`, `renameProp`, node-id targeting). Rejected:
  each is a step further along the direction the data already shows is
  dominated. Model capability ate the premise that structure is ergonomic and
  text is expensive — for single-file JSX edits, a strong model handles text
  fine.
- **Delete the ops.** Rejected: they generate known-good edits deterministically,
  which is how the Gate gets tested, and the Round-trip law between `extract`
  and `inline` is real evidence that the structural model does not lie. They
  also remain plausible for bulk mechanical work where invoking a model per site
  is not worth it — untested, since the evals only cover agent-in-the-loop
  single-file edits.

## Consequences

- Effort goes to widening what can be *judged*, not what can be *edited*. The
  behavioural oracle currently reaches only self-contained components with given
  prop samples; components with imports, context or effects are the open work.
- The structural half of the Gate is still extraction-shaped ("exactly one net-new
  component"). The general question — does this edit preserve behaviour — is
  larger than the current checks.
- The evidence is thin and should be widened before this is leaned on hard: four
  tasks, one model, 41 recorded runs. The direction is consistent and the
  mechanism is clear (conservatism costs coverage; verification costs none), but
  this is a strong conclusion from a small n.
