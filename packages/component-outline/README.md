# component-outline

Parse-now structure extractor for React/TSX. Given one file, it emits a stable
JSON **outline** — the components, their props/hooks, and the JSX containment
tree — for agents (and the `cgraph` editing layer) to read.

This is the **B layer** of `component-graph`: a shippable, honest reader. It is
the dependency of the **A layer** (`cgraph`), which turns this outline into a
graph, applies checked semantic patches, and reprojects to JSX.

## Principles (load-bearing)

- **honest-partial.** Only what the source literally shows is recorded. Names
  are never turned into relationships. Anything that needs resolution
  (data-flow, type checking) is left as opaque `expr` text or an unresolved
  `typeRef` string. A resolved `path` never appears at this tier — the A layer
  promotes some `expr` to `path` via Tier 1 (tsc/ts-morph).
- **parse-now, no-index.** Every run parses from scratch with
  [`@ast-grep/napi`](https://ast-grep.github.io) (`Lang.Tsx`). There is no
  index to build, refresh, or invalidate.
- **stay local, no cross-file.** One file at a time. `import`s are recorded as
  text, never followed.
- **declarative catalog.** What counts as a component lives in
  [`src/catalog.ts`](./src/catalog.ts) as data. Widening coverage (e.g.
  `React.memo` / `forwardRef`) means adding a reader, not branching the walker.

## Install / build

```sh
pnpm install
pnpm --filter component-outline build
```

## CLI

```sh
component-outline <path> [--json] [--match <Name>] [--items imports|components|exports]
```

- `<path>` — a `.tsx/.jsx/.ts/.js` file, or a directory (scanned recursively).
- `--json` — emit the machine-readable contract (below). Without it, a
  human-readable outline view is printed.
- `--match <Name>` — keep only the component with this exact name.
- `--items <section>` — restrict output to one section.

During development, run the TS entry directly:

```sh
pnpm --filter component-outline dev fixtures/a.tsx --json
```

## Library

```ts
import { extract, printOutline } from 'component-outline';

const outline = extract('Profile.tsx', sourceCode); // pure: (file, code) => Outline
console.log(printOutline(outline));
```

## JSON contract (v0.1)

The output is the interface that agents and the A layer depend on.

```jsonc
{
  "version": "0.1",
  "file": "a.tsx",
  "imports": [
    { "source": "./Avatar", "names": ["Avatar"], "line": 1 } // recorded, not followed
  ],
  "components": [
    {
      "name": "Profile",
      "exported": true,
      "isDefault": false,
      "symbolType": "function-component",        // | "arrow-component"
      "params": [
        {
          "name": null,                          // set for a plain identifier param
          "props": [                             // destructured object-param bindings
            { "name": "user", "local": null, "default": null,  "rest": false },
            { "name": "size", "local": null, "default": "2",   "rest": false },
            { "name": "rest", "local": null, "default": null,  "rest": true  }
          ],
          "typeRef": "ProfileProps"              // unresolved type annotation text
        }
      ],
      "hooks": [
        { "call": "useState", "binds": ["open", "setOpen"] }  // no dep edges
      ],
      "root": {                                  // JSX containment tree
        "kind": "element",                       // element|component|fragment|text|expr
        "tag": "div",
        "props": {
          "className": { "kind": "literal", "text": "card" },
          "data-open": { "kind": "expr", "text": "open" }     // opaque, not a path
        },
        "children": [ /* SkelNode[] */ ],
        "line": 14
      },
      "range": [9, 21]                           // 1-based [start, end], inclusive
    }
  ],
  "exportsSurface": ["Profile"]
}
```

### Invariants

- A prop value is only `literal` or `expr`. **Never `path`** — data-flow is not
  resolved here.
- Branches stay opaque: `{cond && <X/>}`, `{a ? <X/> : <Y/>}`, `{items.map(...)}`
  become a single `expr` node carrying the source text. The conditional JSX
  inside is *not* descended into.
- A `typeRef` is the raw annotation text (e.g. `ProfileProps`,
  `{ label: string }`), never a resolved type.

## Coverage & non-goals

Covered: function components, arrow components (expression / block / parenthesized
body), `export default function`, single-identifier and destructured object
params (shorthand, default, renamed, rest), hook calls with their bindings,
JSX element / component / fragment / text / expr nodes, source ranges, and the
import/export surface.

Out of scope (deferred to Tier 1 / the A layer): type resolution, following
imports, data-flow edges, dependency-array semantics, nested component
declarations. Fragments are detected structurally — `<>...</>` parses as a
`jsx_element` with no tag name, **not** a distinct `jsx_fragment` kind — so
catalog correctness is guarded by per-variant fixture snapshots in
[`test/`](./test).
