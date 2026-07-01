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
   ts-morph diagnostic-delta type gate (`type-check-failed`).

The moved subtree is the **verbatim source slice** — so an element containing
`{show && items.length}` moves whole, its opaque interior byte-for-byte intact,
while `show`/`items` still surface as typed props.

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
