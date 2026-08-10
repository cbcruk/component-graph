# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

> **Note:** of these five, only `wontfix` currently exists in `cbcruk/component-graph` (it ships as a GitHub default). The other four — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` — do not exist yet. `gh issue edit --add-label` fails on an unknown label, so create each one the first time you need it:
>
> ```bash
> gh label create needs-triage    --description "Maintainer needs to evaluate this issue"
> gh label create needs-info      --description "Waiting on reporter for more information"
> gh label create ready-for-agent --description "Fully specified, ready for an AFK agent"
> gh label create ready-for-human --description "Requires human implementation"
> ```
