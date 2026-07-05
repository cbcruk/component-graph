# cgraph (A layer)

The editing layer of `component-graph`. It takes the **B layer**
([`component-outline`](../component-outline)) outline, lifts it into an
**ephemeral graph lens**, and projects that graph back to JSX — verified by a
round-trip law.

> Graph is a lens, **TSX stays the source of truth.** No `.graph` file is ever
> written. The graph is recomputed on demand and thrown away, so parallel git
> worktrees are just source on disk (no index to reconcile).

This is the JXON round-trip lineage made concrete: B's `extract` is the
`createObjTree` (reader), and this layer's project/re-extract pair is the
GetPut/PutGet law (checked bidirectional editor).

## What's here

**Foundation (Task 3)** — the ephemeral lens + round-trip law:

- **`componentToGraph(component)`** — outline component → `Graph`. `expr`
  bindings are carried opaquely; nothing is resolved.
- **`projectGraph(graph)`** — `Graph` → JSX text (canonical formatting).
- **`roundtrip(component)`** — the law: `graph → project → re-extract → graph'`
  must be identical. Formatting is normalized away; opaque `expr` nodes (e.g.
  `{open ? <span>online</span> : null}`) survive verbatim.

**Marquee op (Task 4)** — `extractComponent`:

```ts
extractComponent({ file, code, component: 'Card', targetLine: 12, newName: 'Count' })
// -> { ok: true, output, newComponent, usage, props, edits, hash }
```

It lifts a JSX element subtree into a new sibling component:

1. **Free-var analysis** — identifiers the subtree references that are bound in
   the enclosing component's scope (params / hook binds / locals) become props.
   Tag names and locally-bound names are excluded; free vars are found even
   *inside* opaque `expr` nodes.
2. **Tier 1 promotion** — ts-morph resolves each prop's type (`count: number`,
   `label: string`) and its data-flow origin (`param` | `hook` | `local`). This
   is the localized `expr → path` the design calls for: types aren't cheaper,
   just deferred to the one node being edited.
3. **Rewire** — the original occurrence is replaced by `<New … />`; the new
   component is inserted as a sibling. Edits are character-offset `TextEdit`s.
4. **Fail-closed** — nothing is emitted unless every guard passes: `stale-hash`,
   `invalid-name`, `name-collision`, `component-not-found`, `target-not-found`,
   `target-is-root`, `cyclic`, structural re-extraction invariants, and a
   ts-morph diagnostic-delta type gate (`type-check-failed`). Cases outside the
   honest subset are rejected *up front* with a specific reason rather than a
   vague late gate failure: a target inside an opaque expression
   (`{cond && <x/>}`, ternary, `.map` callback) → `unsupported-conditional`; a
   free var shadowed by a nested binding inside the target → `unsupported-shadowing`.

The moved subtree is the **verbatim source slice** — so an element containing
`{show && items.length}` moves whole, its opaque interior byte-for-byte intact,
while `show`/`items` still surface as typed props.

## `inlineComponent` — the inverse

```ts
inlineComponent({ file, code, component: 'Card', target: 'Count' })
// -> { ok: true, output, inlined, substitutions, edits, hash }
```

The exact inverse of extraction. It folds a single-usage, top-level component
back into its call site:

1. **Substitute** — each prop reference in the target's body is replaced by the
   argument the usage passed (`count={count}` → the body's `count` refs become
   `count`; `label="hi"` → `{"hi"}`; a boolean shorthand → `true`). Free vars in
   the body that aren't props are left alone.
2. **Fold & delete** — the substituted body replaces the `<Target/>` usage, and
   the now-dead declaration is removed (with its leading blank line).
3. **Fail-closed** — refuses anything outside the honest subset: more than one
   usage (`not-single-usage`), an `export`ed target (`unsupported-exported-target`
   — removing it could break other files, which the no-cross-file rule forbids
   reasoning about), an arrow/`const` target, a `{...spread}` or children on the
   usage, a prop the usage doesn't pass, or a prop shadowed inside the body.

**The round-trip law.** `extract` and `inline` form a lens: for a subtree the
honest subset covers, `inline(extract(x)) === x` **byte-for-byte** — verified as
a property test ([`inline-component.test.ts`](./test/inline-component.test.ts)).
This is the GetPut law from the brief, now proven at the op level rather than
just asserted.

## Applying the edit

`extractComponent` only *computes* `TextEdit`s — it never touches disk.
`applyEditsToFile` is the atomic, fail-closed writer: it re-reads the file,
re-hashes it against `expectedHash` (the stale re-check — offsets are only valid
against that exact source), applies the edits, and `rename`s a temp file over
the original so a crash mid-write leaves the original untouched.

```ts
const r = extractComponent({ file, code, component: 'Card', targetLine: 12, newName: 'Count' });
if (r.ok) applyEditsToFile({ file, edits: r.edits, expectedHash: hashSource(code) });
```

The `cgraph` CLI wraps both — dry-run by default (prints a line-anchored diff),
`--write` to apply, `--json` for a machine-readable result:

```sh
cgraph extract Card.tsx --component Card --line 12 --name Count          # preview
cgraph extract Card.tsx --component Card --line 12 --name Count --write  # apply
cgraph inline  Card.tsx --component Card --target Count --write          # the inverse
```

## `verifyExtraction` — model edits, tool verifies

`extractComponent` *produces* a checked edit. `verifyExtraction` *accepts or
rejects* an edit some other agent produced freehand — without trusting it:

```ts
verifyExtraction({ file, original, candidate })
// -> { ok: true, newComponent } | { ok: false, reason }
```

```sh
cgraph verify original.tsx candidate.tsx    # accept: … | reject: <reason>
```

It is fail-closed: the candidate is accepted only if it compiles no worse than
the original (`introduces-type-errors`) and is a structurally sound extraction —
exactly one new, used, non-empty top-level component, nothing pre-existing lost.

This is the hybrid the [`evals/`](../../evals) measurements pointed to. A strong
model edits freehand (high coverage); the gate rejects the broken outputs
(a name collision that duplicates a declaration → `introduces-type-errors`)
while accepting valid edits the `extractComponent` op conservatively refuses
(e.g. shadowing). In the eval it strictly dominates both freehand-alone and
tool-alone. (v1 is a static gate; it does not yet prove the moved subtree is
behaviorally unchanged — a render-based check is the next step.)

## The graph model

An addressable, ephemeral view of one component's JSX subtree
([`graph.types.ts`](./src/graph.types.ts)):

```ts
interface Graph {
  root: GNodeId;                       // "n0"
  nodes: Record<GNodeId, GNode>;       // deterministic preorder ids
}

type GNode =
  | { id; kind: 'element' | 'component'; tag; props: GProp[]; children: GNodeId[] }
  | { id; kind: 'fragment'; children: GNodeId[] }
  | { id; kind: 'text'; text }
  | { id; kind: 'expr'; text };        // opaque escape hatch
```

Node ids are deterministic preorder (`n0`, `n1`, ...), which is what makes the
round-trip law a plain deep-equality check: the same tree always re-keys the
same way.

## Honest limits

Real-world JSX is never *total* in the graph — `.map()`, `&&`, ternaries, and
render props stay as opaque `expr` nodes carrying source text. That is a
feature: an opaque node round-trips losslessly and (in Task 4) will move whole
during `extractComponent` without its interior being touched — conservative and
correct over clever and wrong.

The editor draws the same line explicitly. An element that *contains* an opaque
expression moves whole (its free vars still surface as props), but a target that
*sits inside* one is out of the honest subset — the round-trip check can't see a
usage buried in an opaque node — so it is rejected with `unsupported-conditional`
rather than emitting an unverifiable edit. Likewise, free-var analysis is
scope-shallow by design (no full binder); when a name is both an enclosing-scope
binding and bound by a nested scope inside the target, that ambiguity is rejected
with `unsupported-shadowing` instead of silently guessing.
