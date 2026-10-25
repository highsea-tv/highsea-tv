---
name: handoff
description: Write the opening prompt for a fresh Claude Code agent to pick up highsea work, such as the next part of a checkpoint or a side task, pointing it at what to read and repeating the rules most likely to be broken. Use when the owner asks for a prompt, a handoff or an opening message for a new agent or session.
argument-hint: "[the work to hand off]"
---

# Write a handoff prompt

The new agent loads `CLAUDE.md` on its own. The prompt points it at what matters for this piece of work, and says what's done and where to stop. It doesn't retell the project.

Start your message with `Written for: …`, naming the reader (a fresh agent, which work), then give the prompt in one fenced block the owner can paste.

## What the prompt contains

1. **What and where:** one or two sentences naming the work, its plan file, and the date and state of its approval ("approved with the owner's answers of 2026-10-22").
2. **Read these first, in order:** `CLAUDE.md` (and which lines of "Where things stand"), the standing rules in the phase plan, the checkpoint plan (naming the sections that matter), then the ADRs and specs it touches.
3. **What's already done:** with the commit hash (`git log -1 --format=%h`), so it isn't redone.
4. **What to build:** the plan's list for this part, in short, plus any dry-run or no-publish limits.
5. **Rules that are easy to break here.** Choose the ones this work is likely to break, from:
   - choices rest on official documentation, cited;
   - dependencies and actions pinned, two weeks old (`bun run pin`; actions to a commit SHA);
   - an SPDX header on every new file, in the right comment style;
   - no network in tests, and no secrets in fixtures; never open, read or print `.env.local`;
   - Node 26.11.1 everywhere, with checks run under it;
   - `/Volumes/data`, the owner's NAS, is read-only;
   - the prototypes and design system are locked;
   - internal docs stay in `docs/`, and public guides go only in `apps/docs/content/`;
   - commit only when asked, never push, no attribution lines;
   - copy is plain and calm, with no exclamation marks;
   - never infer pronouns from a name, and use they/them for the owner.
6. **When it's done:** which checks to run (`/checks full`), what to record (the plan's Progress, `CLAUDE.md`, ADRs), and what to report at the gate (`/checkpoint-report`). Then "Stop and ask for review. Don't start <the next part>."

## Never

- Put a credential, key or password in the prompt, even one the owner has pasted earlier. Name where it's kept instead (for example, "`HIGHSEA_OPENSUBTITLES_KEY` is in `.env.local`").
- Promise what the new agent will find. Describe the repo as it is now, and check it with `git status` and `git log` before writing.
