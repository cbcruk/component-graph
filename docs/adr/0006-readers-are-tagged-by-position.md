---
status: accepted
---

# Readers are injected, and tagged by Position rather than node kind

`extract` takes its Reader set as an argument, defaulting to `CATALOG`, so
widening coverage means supplying Readers rather than editing the registry in
place — which is what both READMEs already claimed. Each Reader declares the
Position it applies to, and that tag is not decoration: the expression Reader's
`unwrapToFunction` accepts a `function_declaration`, which is exactly what the
declaration Reader reads, so a registry that dispatched on node kind alone would
read `export default function foo() {}` twice and report a duplicate component.

## Consequences

- A Reader added without a Position, or with the wrong one, silently double-reads
  or never fires. Three tests pin read-exactly-once for the default function,
  arrow and class forms.
- `createComponentReaders(hocNames)` is the opt-in path for further higher-order
  components, keeping the standard Readers and widening only the recognised
  wrappers.
- The seam is only justified because something varies across it. The tests supply
  a genuine second Reader set; if that ever stops being true, this is indirection
  and should go.
