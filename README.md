# component-graph

A React/JSX structure tooling stack for agents. Two layers, where the lower one (B) is a dependency of the upper one (A).

- **B — [`component-outline`](./packages/component-outline)**: an ast-grep-based, parse-now structure extractor. TSX → a component skeleton (JSON contract v0.1). *A shippable reader.*
- **A — [`cgraph`](./packages/cgraph)**: an editing layer that takes B's output as an ephemeral graph, applies a checked semantic patch, and projects it back to verified JSX. *A checked bidirectional editor.*

> One-line thesis: **treat the graph (structure) as close to the truth as possible, honestly leave what you don't know as opaque, and compute on the fly with no index.**

For lineage and detailed design see [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md); for extension candidates see [`TODO.md`](./TODO.md).

## Architecture

```
             ┌──────────────────────────────────────────────┐
 agent ────▶ │  B: component-outline   (Tier 0, cheap)       │
 "show me     │  parse-now · no-index · no cross-file          │
  structure"  │  → components·props·hooks·JSX containment·range │
             └───────────────────────┬──────────────────────┘
                                     │  outline (contract v0.1)
                                     ▼
             ┌──────────────────────────────────────────────┐
 agent ────▶ │  A: cgraph              (Tier 1, on-demand)   │
 "extract     │  outline → graph → checked patch               │
  it as Count" │  → resolve types/data-flow for the edited node │
             │  → reproject to verified JSX (source-range edit) │
             └──────────────────────────────────────────────┘
```

- **What Tier 0 (B) knows**: components, prop signatures (name + unresolved typeRef), hook *calls*, JSX containment, source ranges, the import/export surface.
- **What Tier 0 doesn't know (deliberately deferred to Tier 1)**: cross-file data-flow, type soundness, branches (`{cond && <X/>}` is an opaque expr), dep-array semantics. The A layer computes these on the fly with ts-morph **for the single node being edited only**.
- **What A produces**: verified `TextEdit[]`. Applied to disk atomically and fail-closed via `applyEditsToFile` (temp file → rename, original untouched on failure, stale re-checked by re-hashing the file), or run through the `cgraph` CLI (dry-run by default / `--write`).

## Design principles (load-bearing)

1. **honest-partial** — don't guess what you don't know. Unresolved bindings stay as opaque `expr`.
2. **parse-now, no-index** — parse on the fly every time. No index to build, refresh, or invalidate.
3. **stay local, no cross-file** — B looks at one file only. Imports are recorded as text but not followed.
4. **declarative catalog** — "what counts as a component" lives in a rule catalog (data). Adding coverage = adding a catalog entry.
5. **the graph is ephemeral, the TSX is the truth** — no `.graph` file is ever written. Brownfield-friendly.
6. **checked & atomic** — a patch never touches the store unless it passes stale-hash / type / structural checks. Fail-closed.

## Packages

| Package | Layer | Role |
|---|---|---|
| [`component-outline`](./packages/component-outline) | B (Tier 0) | TSX → outline JSON contract v0.1. CLI + pure `extract(file, code)`. |
| [`cgraph`](./packages/cgraph) | A (Tier 1) | ephemeral graph lens + the round-trip law + the inverse op pair `extractComponent` ⇄ `inlineComponent` (byte-exact) + atomic disk apply (`applyEditsToFile`) + `cgraph` CLI (`extract`/`inline`, dry-run/`--write`/`--json`). |

## Quick start

```sh
pnpm install
pnpm build          # build everything (tsc, strict ESM)
pnpm test           # run all tests

# B: a file's structure as JSON
pnpm --filter component-outline dev packages/component-outline/fixtures/a.tsx --json

# A: extract a JSX subtree into a new component (CLI)
#   dry-run — shows a diff only, never touches the file (default)
pnpm --filter cgraph dev extract packages/cgraph/fixtures/card.tsx \
  --component Card --line 12 --name Count
#   --write applies to disk atomically (stale re-checked, fail-closed); --json emits a machine-readable result
pnpm --filter cgraph dev extract packages/cgraph/fixtures/card.tsx \
  --component Card --line 12 --name Count --write

# A: inline is the inverse — fold a single-usage component back into its call site
pnpm --filter cgraph dev inline packages/cgraph/fixtures/card.tsx \
  --component Card --target Count --write   # extract then inline == the original, byte-for-byte

# A: also usable as a library
#   const r = extractComponent({ file, code, component: 'Card', targetLine: 12, newName: 'Count' })
#   if (r.ok) applyEditsToFile({ file, edits: r.edits, expectedHash: hashSource(code) })
```

### Example — `extractComponent`

This is the verbatim result of the `--write` command above, run against
[`packages/cgraph/fixtures/card.tsx`](./packages/cgraph/fixtures/card.tsx) —
extracting the `<span>` on line 12 as `Count`:

```tsx
// before — packages/cgraph/fixtures/card.tsx
interface CardProps {
  title: string;
  count: number;
}

export function Card({ title, count }: CardProps) {
  const label = title.toUpperCase();

  return (
    <section className="card">
      <header>{label}</header>
      <span className="count">{count}</span>
    </section>
  );
}
```

```tsx
// after
interface CardProps {
  title: string;
  count: number;
}

export function Card({ title, count }: CardProps) {
  const label = title.toUpperCase();

  return (
    <section className="card">
      <header>{label}</header>
      <Count count={count} />
    </section>
  );
}

function Count({ count }: {
  count: number;
}) {
  return (
    <span className="count">{count}</span>
  );
}
```

What the diff shows, and what it deliberately leaves alone:

- **`count` becomes a typed prop.** It's a free var of the moved subtree, bound by `Card`'s params; ts-morph (Tier 1) resolves `count: number` for that one node.
- **The original is rewired to a single usage** (`<Count count={count} />`) and the new component is inserted as a **sibling** of `Card`.
- **Everything else stays byte-for-byte.** `const label`, `<header>{label}</header>`, and the `<section>` wrapper are untouched — only the target range and the insertion point are edited.
- If any guard fails — `stale-hash`, `name-collision`, `cyclic`, the type gate, and so on — **no edit is produced** (fail-closed).

`inlineComponent` is the exact inverse: it substitutes each prop reference in
`Count`'s body with the argument the usage passed, drops the body back where the
`<Count/>` was, and deletes the now-dead declaration. The two ops form a lens:
**`extract` then `inline` reproduces the original byte-for-byte** (the GetPut
round-trip law, checked as a property test) — which is what "bidirectional
editor" actually means, made concrete on real source.

## Tech stack

- TypeScript (strict, ESM/NodeNext), a pnpm-workspace monorepo.
- `@ast-grep/napi` (`Lang.Tsx`) — B's parsing engine.
- `ts-morph` — the A layer's Tier 1 type/data-flow resolution.
- vitest — fixture TSX + snapshot/assertion tests.

## In one line

JXON (XML↔object) taught the lossless/bidirectional lessons → **B** is an honest parse-now *reader*, → **A** is a checked bidirectional *editor*. B's importer is a reincarnation of `createObjTree`; A's round-trip is the GetPut/PutGet law.
