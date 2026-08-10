---
status: accepted
---

# The scorer must not call `verifyExtraction`

`evals/score.mjs` computes parse and type checks that `verifyExtraction` also
computes, which reads like duplication worth removing. It is not. Arm C *is* arm
A's output run through `verifyExtraction`, so a scorer that called the Gate would
make arms A and C the same measurement and the harness's central comparison
vacuous. The scorer leans only on Oracles — the B-layer parser and `tsc` — and
never on the tool under test.

## Consequences

- The overlap between `score.mjs` and `verifyExtraction` is deliberate and must
  survive future de-duplication passes. There is a comment at the call site
  saying so; this ADR is the longer version.
- The same rule constrains anything added later: a check may enter the scorer only
  if it is an Oracle. If it is part of the tool being evaluated, it belongs in a
  Gate arm instead.
- Two checks that *look* shared are not. `hasNewComponent` looks for a specific
  target name where the Gate counts net-new components by any name, and
  `usedOnce` requires exactly one occurrence in the enclosing component where the
  Gate requires at least one reference from anywhere.
