# component-graph

React/JSX structure tooling for agents. Two layers: a parse-now reader that
describes a file honestly, and a checked editor that will not touch the file
unless every guard passes.

## Language

### The two layers

**Outline**:
The B layer's description of one file — its components, their params, hooks,
JSX containment and source ranges. The stable JSON contract the A layer and any
agent read against.
_Avoid_: AST, parse tree, skeleton, summary

**Graph lens**:
An ephemeral graph over one component's JSX, computed on demand from an Outline
and thrown away. Never persisted; the TSX file stays the source of truth.
_Avoid_: graph (bare), IR, model, index

**Projection**:
JSX text rendered back out of a Graph lens, in canonical formatting.
_Avoid_: codegen, print, serialize

**Tier 0**:
What is known from parsing one file alone — cheap, always available.
_Avoid_: static analysis, phase 1

**Tier 1**:
What requires a type checker, and is therefore computed only for the node being
edited and then discarded.
_Avoid_: deep analysis, semantic pass

### What the model refuses to guess

**honest-partial**:
The stance that unresolved things are carried as themselves rather than
guessed. It is what makes a refusal trustworthy: a Gate that invents is not a
gate.
_Avoid_: best-effort, lossy, approximate

**Opaque expr**:
A binding or subtree the reader will not interpret — `{cond && <X/>}`, a
ternary, a `.map` callback — carried verbatim as source text. Moved whole by an
edit, never rewritten.
_Avoid_: unknown, unresolved, unparsed, dynamic

**parse-now**:
Parsing from source at each request, building no index to maintain or
invalidate. What makes parallel worktrees just files on disk.
_Avoid_: indexed, cached, incremental

### Editing

**Checked op**:
An edit that produces output only if every guard passes — hash, structure, and
type — and otherwise produces nothing but a reason.
_Avoid_: transform, codemod, refactor, mutation

**fail-closed**:
The property that a failing or unrunnable check refuses the edit rather than
letting it through. "Could not check" is a refusal, not a pass.
_Avoid_: safe, strict, defensive

**Round-trip law**:
The property that `extract` then `inline` restores the original file
byte-for-byte, and that a Graph lens projected and re-read yields an identical
graph. The two ops check each other.
_Avoid_: invariant test, idempotency

**Reader**:
A rule in the catalog recognising one way of declaring a component. Coverage
grows by supplying readers, not by branching the walker.
_Avoid_: matcher, visitor, handler, rule

**Position**:
Where a Reader applies — a declaration, or the bare expression of an
`export default`. The same syntax can appear in both, so Position rather than
node kind is what keeps two Readers off the same node.
_Avoid_: context, scope, site

### Verification and measurement

**Gate**:
A fail-closed accept-or-reject over an edit somebody else produced. The
project's product: what an agent cannot do for itself.
_Avoid_: validator, linter, checker

**Oracle**:
A deterministic judge used to measure an outcome — the parser, `tsc`, a render
comparison. Distinct from the tool under test, and never the same thing in one
measurement.
_Avoid_: judge, scorer, ground truth

**Behavioral equivalence**:
Two versions of a file rendering identical output for given prop samples. The
only check here that catches an edit which typechecks and is structurally sound
but produces the wrong thing.
_Avoid_: semantic equivalence, correctness

**Arm**:
One condition in an eval — the agent working freehand, using the op, or
freehand with a Gate over it. What the harness compares.
_Avoid_: variant, mode, condition
