# component-graph

A pnpm workspace: `packages/cgraph`, `packages/component-outline`, and an `evals/` harness.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `cbcruk/component-graph`, driven by the `gh` CLI (or the GitHub MCP tools where `gh` is unavailable). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. Only `wontfix` exists in the repo so far — the rest need creating on first use. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root, shared across all packages. See `docs/agents/domain.md`.
