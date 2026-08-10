---
status: accepted
---

# The Graph lens is read-only and off the edit path

`PROJECT_BRIEF.md` §7.1 made the B-to-graph adapter the foundation the editing
layer stands on, and the A-layer README described it that way for a while. It
cannot be: the ops emit byte-exact edits keyed on character offsets, and the
Outline contract carries `line` numbers only. Wiring the lens into the edit path
would mean changing a versioned contract that is the B layer's shipped
deliverable, so the ops read the Outline and work directly on source ranges
instead, and the lens stays a read-only projection plus the Round-trip law that
keeps it honest.

## Consequences

- The lens has no runtime consumer on the edit path, which is why two bugs sat in
  it undetected — a vacuous round-trip pass and unconditional attribute quoting.
  Anything unexercised here needs its own tests; nothing else will reach it.
- It is kept rather than deleted because the Round-trip law is worth running:
  it is the only check that the reader and a canonical projection agree.
