---
status: accepted
---

# `component-outline` owns the AST machinery, published at `/ast`

The B layer exported the Outline but none of the walkers that produced it, and
the A layer — which needs `SgNode`s for the source ranges the contract does not
carry — had no choice but to rebuild them. `findRootJsx` ended up existing twice,
line-for-line. That one matters because it *defines* what counts as a
component's JSX and both layers ask that question: the B layer to decide whether
to catalogue a component at all, the A layer to decide what it may edit. Widening
one copy left the other on the old definition, surfacing as
`component-has-no-jsx` on a file the Outline describes happily.

The machinery is published at a `component-outline/ast` subpath rather than the
main entry point, so that what the B layer *promises* (the JSON contract) stays
distinct from what the two layers *share*.

## Consequences

- A regression test pins the agreement rather than the implementation: across
  five shapes, the A-layer walker and the B-layer catalogue must reach the same
  verdict. Whatever `findRootJsx` becomes, they move together.
- `readObjectPattern` and `collectPatternNames` are deliberately still separate.
  They overlap on node kinds but return different shapes, and unifying them would
  mean inventing a type neither caller wants.
