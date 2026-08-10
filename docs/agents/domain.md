# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** One `CONTEXT.md` + `docs/adr/` at the repo root, covering all packages.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is a pnpm workspace, but it shares one domain vocabulary across its packages, so it uses the single-context layout:

```
/
├── CONTEXT.md                         ← one glossary for the whole workspace
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── packages/
│   ├── cgraph/
│   └── component-outline/
└── evals/
```

### If this repo outgrows one context

Should `cgraph` and `component-outline` drift into genuinely distinct vocabularies — the same word meaning different things in each — switch to the multi-context layout: a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per package, with package-scoped `docs/adr/` alongside system-wide ones at the root.

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── packages/
    ├── cgraph/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← package-specific decisions
    └── component-outline/
        ├── CONTEXT.md
        └── docs/adr/
```

Don't pre-emptively split. Wait for the collision.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
