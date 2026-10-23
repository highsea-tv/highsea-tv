---
name: adr
description: Write a new highsea ADR in docs/adr, or add a dated section to an existing one, and keep the index and CLAUDE.md's ADR list in step. Use when a decision shapes the architecture, when built work departs from an accepted ADR, or when a plan's ADRs section calls for one.
argument-hint: "[new <title> | amend <number> <what changed>]"
---

# Write or amend an ADR

ADRs record every architectural decision. Once one is accepted, its original text isn't rewritten. A change is a **dated section** at the end, or a **new ADR** that supersedes it.

Which to use:

- **A dated section** when the decision stands but something about it changed or was found while building. Examples: 0034's release key, 0050's docs deploying from `main`, 0036's note on the `@highsea-tv/` rename.
- **A new ADR** for a new decision, or one that replaces an old one. The old one's status becomes `Superseded by NNNN`, or its index row says `Accepted; amended by NNNN`.

## A new ADR

1. The number is the next free one: `ls docs/adr | sort | tail -3`. The file is `docs/adr/NNNN-short-kebab-title.md`.
2. Start from `docs/adr/template.md`:

   ```md
   # NNNN. Title: the decision in a phrase

   - **Status:** Accepted
   - **Date:** YYYY-MM-DD

   ## Context
   ## Decision
   ## Consequences
   ```

   Use `Proposed` until the owner has approved the plan that carries it.
3. **Context** says what forced the decision, with what exists already, the constraints and the alternatives. **Decision** says what highsea does, concretely, with packages, files and settings. **Consequences** says what follows, good and bad, and what's left for later.
4. **Cite the documentation every choice rests on**, with links to the official docs, specs and RFCs. This is the owner's standing rule: decisions rest on documentation, not experiments.
5. Name packages as they're called now (`@highsea-tv/...`). Older ADRs keep the names they were written with.

## A dated section

Add it at the end of the existing ADR:

```md
## YYYY-MM-DD: what changed (checkpoint 9b)

What changed, why, and what it means. Cite the documentation.
```

## Keep the lists in step

- **`docs/adr/README.md`:** add a row `| [NNNN](NNNN-….md) | Decision in a phrase | Accepted |`, or change an existing row's status to `Accepted; amended YYYY-MM-DD` or `Accepted; amended by NNNN`.
- **`CLAUDE.md`:** its paragraph after "Read the Phase 3 plan before doing anything" lists which ADRs came with which checkpoint, and which got dated sections. Add the new ones there.
- **The plan's "ADRs" section** and the checkpoint report both name them.
- Where an ADR names the code it governs, add a one-line comment in that code pointing back (`// ADR 0049: …`), matching the code around it.
