---
status: accepted
---

# One compiler host, at `strict` minus `noImplicitAny`

Prop-type resolution and the type Gate each built their own ts-morph project, at
`strict: true` and `strict: false` respectively, so a strict-only error could be
resolved into a generated prop type and then walk through a laxer gate. They now
share one `COMPILER_OPTIONS`. `noImplicitAny` is held off, which looks like a
weakening of `strict` and is not: with no React types in scope every intrinsic
element raises TS7026 and every unannotated param TS7006, and that noise scales
with *element count*, so the Gate's diagnostic-count delta would refuse any edit
that legitimately adds an element.

Measured on a real fixture before choosing:

| configuration | adds an element | strictNullChecks | possibly-undefined |
| --- | --- | --- | --- |
| `strict: false` (the old Gate) | clean | **missed** | **missed** |
| `strict: true` | **refused** | caught | caught |
| `strict: true`, `noImplicitAny: false` | clean | caught | caught |

Only the third satisfies both constraints. Plain `strict: true` broke a
`verifyExtraction` test for exactly this reason — a valid freehand candidate that
added one `<span>`.

## Consequences

- `noImplicitAny` changes what is *reported*, never what is *inferred*, so
  resolved prop types are unaffected. The extract tests assert on `typeText` and
  pin this.
- The delta stays coarse: it counts errors rather than classifying them, so an
  edit that removes one error and adds another reads as clean. Classifying new
  error kinds is the way to sharpen it — not raising `strict` further.
