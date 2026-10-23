---
name: scope
description: Scope, plan and document a highsea phase, checkpoint or feature in the house plan format, with open questions for the owner, without building anything. Use when the owner asks to scope, plan or document the next phase, checkpoint or a new feature.
argument-hint: "[what to scope, e.g. 'checkpoint 10' or 'dashboard customization']"
---

# Scope a phase, checkpoint or feature

Write the plan the owner reviews before any work starts. **Build nothing**: no code, no prototypes, unless the owner asks for a prototype as part of the scope (as for smart collections and VPN).

## Before writing

1. Read `CLAUDE.md` ("Where things stand"), `docs/roadmap.md` and the plan this work belongs to (for Phase 3, `docs/plans/phase-3-server.md`: its standing rules, exit criteria and checkpoint list).
2. Read the most recent checkpoint plan end to end (`ls -t docs/plans/`) and copy its shape. Read its "what it leaves for later" and Progress sections: open items often belong in the new scope.
3. Read the specs in `docs/product/` and the prototypes in `design/prototypes/src/` that the work covers. They're locked; the plan builds to them.
4. Read the ADRs the work touches (`docs/adr/README.md` is the index).
5. Research unknowns in official documentation, and cite it. The owner's rule is that decisions rest on documentation, not experiments.

## The file

`docs/plans/<phase>-<name>.md`, for example `phase-3-checkpoint-9.md`, `smart-collections.md` or `phase-4-clients.md`. Use these sections in this order, leaving out any that don't apply:

- `# Phase N, checkpoint M: <name>`
- **Read first**: the files a fresh agent reads before starting, in order.
- **Goal**: a few sentences on what's true when it's done.
- **Out of scope**: what's left out, and where each item goes instead.
- **Where things stand**: what already exists that this builds on, with file paths.
- **The size of this checkpoint, and its parts**: when it's large, gated parts (8a, 8b, 8c), each reviewed separately.
- **Progress**: empty for now, with dated entries added as the work goes.
- One section per area of work, each naming the packages, routes, screens and tests it touches. Tag each with its part, for example `## Docker (9a)`.
- **ADRs**: the new ones, with the next free numbers from `docs/adr/`, and the dated sections to add to existing ones.
- **Risks**
- **Open questions for the owner**: a numbered list. Each question has a bold name, then `**Recommended:**` first, then `Or:` alternatives, each with its trade-off in a sentence. Recommend something every time.
- Leave space for **The owner's changes** and **The owner's answers**; `/questions` fills them in.

## Then

- Add a line for the scope to `CLAUDE.md`'s "Where things stand", and to the roadmap if this is a new phase or follow-up.
- Write in the house voice (`docs/brand/brief.md` § 6): plain, specific, no exclamation marks. Avoid "we'll" and use the owner's terms.
- Report briefly: what's in scope, how it's split into parts, and how many open questions there are. Offer to go through them with `/questions`.
- Commit only if the owner asks (then `/signoff`'s commit rules apply). Don't start the work.
