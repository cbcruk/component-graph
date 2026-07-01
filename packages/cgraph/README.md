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

## Scope (Task 3 — the foundation, not the marquee op)

Built here:

- **`componentToGraph(component)`** — outline component → `Graph`. `expr`
  bindings are carried opaquely; nothing is resolved.
- **`projectGraph(graph)`** — `Graph` → JSX text (canonical formatting).
- **`roundtrip(component)`** — the law: `graph → project → re-extract → graph'`
  must be identical. Formatting is normalized away; opaque `expr` nodes (e.g.
  `{open ? <span>online</span> : null}`) survive verbatim.

Deferred to **Task 4**:

- Tier 1 promotion (ts-morph/tsc): resolve a selected subtree's free variables,
  turning some `expr` into a resolved `path`.
- The marquee op **`extractComponent`**: infer new-component props from free
  vars, rewire the original to a single usage, type-check, reproject — all
  fail-closed (stale-hash / type-mismatch / unresolved-binding / cyclic
  rejected before the store is touched).

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
